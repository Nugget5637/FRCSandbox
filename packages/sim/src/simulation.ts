import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-deterministic-compat';
import { SIM_HZ, SIM_STEP_SECONDS } from './constants';
import { getMechanic, type MechanicContext, type MechanicInstance } from './mechanics';
import {
  boxContains,
  pointsFor,
  rotationToQuaternion,
  type Alliance,
  type Box,
  type GamePack,
  type Goal,
  type HumanPlayerStation,
  type Obstacle,
  type PieceExit,
  type PieceShape,
  type Quaternion,
  type Surface,
  DEFAULT_STRUCTURE_SURFACE,
  IDENTITY_QUATERNION,
} from './pack';
import { checkRobotRules, IDLE_INPUT, type RobotInput, type RobotSpec } from './robot';
import { SeededRandom } from './rng';

export const GRAVITY = 9.81;

/** How long a robot must wait before recapturing a piece it just released. */
export const RECAPTURE_COOLDOWN_SECONDS = 0.5;

/** Rounded edges let box-shaped robots ride up ramps instead of catching on them. */
const ROBOT_EDGE_RADIUS = 0.03;

/** How far ridge obstacles extend below their box (into the floor). */
const RIDGE_SINK = 0.03;

/**
 * Default angular acceleration (rad/s^2) when a robot spec omits it. At the
 * client's turn rate of 2*pi rad/s, this reaches full turn speed in about a
 * quarter second, matching the snappy translation ramp.
 */
export const DEFAULT_ANGULAR_ACCELERATION = 8 * Math.PI;

/**
 * Robots are driven by setting velocity, not by wheel friction, so they have zero
 * friction against everything. That lets box-shaped bodies slide up ramps. Low
 * restitution stands in for foam bumpers.
 */
const ROBOT_SURFACE: Surface = { friction: 0, restitution: 0.2 };

/** A piece within this distance of the carpet counts as rolling on it. */
const CARPET_CONTACT_TOLERANCE = 0.01;
/** Below this speed a rolling piece is stopped outright so it can sleep. */
const ROLLING_STOP_SPEED = 0.03;

/** A piece whose center falls this far below the carpet has left the field. */
const OUT_OF_BOUNDS_FLOOR = -0.5;
/** Extra clearance beyond a piece's radius when it is put back inside the field. */
const RETURN_CLEARANCE = 0.05;
/** One-sided obstacles only check bodies within this distance of their bounding sphere. */
const ONE_SIDED_MARGIN = 1;

/** Rapier cylinders run along their local y axis; pack cylinders run along z. */
const CYLINDER_TO_Z: Quaternion = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
/** A returned cylinder lies on its side with its axis along field x. */
const LYING_CYLINDER = rotationToQuaternion([0, Math.PI / 2, 0]);

/**
 * Applies a surface so every contact uses the geometric mean of both sides.
 * Rapier multiplies coefficients under the Multiply rule, so storing sqrt(value)
 * on each collider gives sqrt(a) * sqrt(b) = sqrt(a * b) for every pair.
 */
function withSurface(desc: RAPIER.ColliderDesc, surface: Surface): RAPIER.ColliderDesc {
  return desc
    .setFriction(Math.sqrt(surface.friction))
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
    .setRestitution(Math.sqrt(surface.restitution))
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
}

/** The friction or restitution the engine uses when two surfaces touch. */
export function combineSurfaces(a: Surface, b: Surface): Surface {
  return {
    friction: Math.sqrt(a.friction * b.friction),
    restitution: Math.sqrt(a.restitution * b.restitution),
  };
}

let rapierReady: Promise<void> | undefined;

/** Loads the physics engine's WebAssembly module once per process. */
export function initPhysics(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

export interface RobotEntry {
  id: string;
  alliance: Alliance;
  spec: RobotSpec;
  /** Starting position on the floor and heading (radians, counterclockwise from +x). */
  start: { x: number; y: number; yaw: number };
  /** Pieces held at the start of the match. Limited by the pack's `preload` rule. */
  preload?: number;
}

/** One tick of input for a human player station. */
export interface HumanPlayerInput {
  /** While true, the human player feeds one piece every `feedSeconds`. */
  feed: boolean;
}

export interface SimulationOptions {
  pack: GamePack;
  robots: RobotEntry[];
  seed?: number;
}

/**
 * field: loose on the field. stored: held by a robot. processing: inside a
 * recycling goal, about to return to the field. scored: removed from play.
 * station: held by a human player. outOfBounds: left the field and waiting for
 * a referee to put it back.
 */
export type PieceState = 'field' | 'stored' | 'processing' | 'scored' | 'station' | 'outOfBounds';

export type SimEvent =
  | { tick: number; type: 'periodStarted'; period: string }
  | { tick: number; type: 'matchEnded' }
  | { tick: number; type: 'pieceAcquired'; pieceId: number; robotId: string }
  | { tick: number; type: 'pieceReleased'; pieceId: number; robotId: string }
  | { tick: number; type: 'pieceFed'; pieceId: number; station: string }
  | { tick: number; type: 'pieceLeftField'; pieceId: number }
  | { tick: number; type: 'pieceReturned'; pieceId: number }
  | {
      tick: number;
      type: 'pieceScored';
      pieceId: number;
      goal: string;
      rule: string;
      alliance: Alliance;
      /** False if a mechanic had the goal inactive, in which case points is 0. */
      active: boolean;
      points: number;
    };

export interface RobotSnapshot {
  id: string;
  alliance: Alliance;
  pose: { x: number; y: number; z: number; yaw: number };
  velocity: { x: number; y: number };
  storedPieces: number[];
}

export interface PieceSnapshot {
  id: number;
  type: string;
  state: PieceState;
  position: { x: number; y: number; z: number } | null;
  /** Orientation while on the field. */
  rotation: Quaternion | null;
  heldBy: string | null;
}

export interface StationSnapshot {
  id: string;
  alliance: Alliance;
  /** Pieces the human player still holds. */
  supply: number;
  /** True while a feed is in progress. */
  feeding: boolean;
}

export interface GoalSnapshot {
  id: string;
  alliance: Alliance;
  active: boolean;
}

export interface SimSnapshot {
  tick: number;
  time: number;
  period: string | null;
  finished: boolean;
  score: Record<Alliance, number>;
  robots: RobotSnapshot[];
  pieces: PieceSnapshot[];
  goals: GoalSnapshot[];
  stations: StationSnapshot[];
}

interface PieceRecord {
  id: number;
  type: string;
  shape: PieceShape;
  /** Measured value from the piece type, or undefined to use the carpet's. */
  rollingResistance: number | undefined;
  state: PieceState;
  body: RigidBody | null;
  heldBy: string | null;
  /** The robot that last released this piece cannot recapture it until this tick. */
  recaptureBlockedFor: string | null;
  recaptureBlockedUntil: number;
  /** For processing and out-of-bounds pieces: when and where they return to the field. */
  returnTick: number;
  returnGoal: Goal | null;
  returnPosition: [number, number, number] | null;
}

interface StationRecord {
  station: HumanPlayerStation;
  /** Ids of pieces the human player holds, fed in order. */
  supply: number[];
  /** Tick when the current feed finishes, or null if idle. */
  feedDoneTick: number | null;
}

interface OneSidedRecord {
  normal: [number, number, number];
  center: [number, number, number];
  reach: number;
  /** Bodies behind the obstacle this step; they pass through it. */
  passing: Set<number>;
}

interface RobotRecord {
  entry: RobotEntry;
  body: RigidBody;
  stored: number[];
  releaseWasPressed: boolean;
}

interface PeriodWindow {
  id: string;
  startTick: number;
  endTick: number;
}

/**
 * Creates a headless 3D simulation for a game pack. Call initPhysics() first,
 * or use createSimulation(), which does it for you.
 */
export class Simulation {
  readonly pack: GamePack;
  readonly random: SeededRandom;

  private readonly world: World;
  private readonly robots: RobotRecord[] = [];
  private readonly pieces: PieceRecord[] = [];
  private readonly periods: PeriodWindow[];
  private readonly mechanics: MechanicInstance[];
  private readonly events: SimEvent[] = [];
  private readonly score: Record<Alliance, number> = { red: 0, blue: 0 };
  private readonly stations: StationRecord[] = [];
  /** One-sided obstacles keyed by collider handle. */
  private readonly oneSided = new Map<number, OneSidedRecord>();
  private readonly hooks: RAPIER.PhysicsHooks;
  /** Rapier ignores physics hooks unless an event queue is passed with them. */
  private readonly eventQueue: RAPIER.EventQueue;
  /** Pieces scored so far in each goal, for goal capacity. */
  private readonly goalCounts = new Map<string, number>();
  private tickCount = 0;
  private periodIndex = 0;
  private disposed = false;

  constructor(options: SimulationOptions) {
    const { pack, robots } = options;
    this.pack = pack;
    this.random = new SeededRandom(options.seed ?? 1);

    const ids = new Set<string>();
    for (const robot of robots) {
      if (ids.has(robot.id)) throw new Error(`duplicate robot id "${robot.id}"`);
      ids.add(robot.id);
      const violations = checkRobotRules(robot.spec, pack.robotRules);
      if (violations.length > 0) {
        const detail = violations
          .map((v) => `${v.rule} (limit ${v.limit}, actual ${v.actual.toFixed(3)})`)
          .join('; ');
        throw new Error(`robot "${robot.id}" breaks robot rules: ${detail}`);
      }
      const preload = robot.preload ?? 0;
      const maxPreload = pack.preload?.maxPerRobot ?? 0;
      if (preload > maxPreload) {
        throw new Error(
          `robot "${robot.id}" preloads ${preload} pieces; the limit is ${maxPreload}`,
        );
      }
      if (preload > robot.spec.intake.capacity) {
        throw new Error(`robot "${robot.id}" preloads more pieces than its capacity`);
      }
    }

    let tick = 0;
    this.periods = pack.match.periods.map((p) => {
      const window = {
        id: p.id,
        startTick: tick,
        endTick: tick + Math.round(p.durationSeconds * SIM_HZ),
      };
      tick = window.endTick;
      return window;
    });

    this.mechanics = pack.mechanics.map((id) => {
      const module = getMechanic(id);
      if (!module) throw new Error(`unknown mechanic "${id}"`);
      return module.create(pack);
    });

    this.world = new RAPIER.World({ x: 0, y: 0, z: -GRAVITY });
    this.world.timestep = SIM_STEP_SECONDS;
    this.hooks = {
      filterContactPair: (c1, c2, b1, b2) => {
        const a = this.oneSided.get(c1);
        const b = this.oneSided.get(c2);
        if ((a && a.passing.has(b2)) || (b && b.passing.has(b1))) return null;
        return RAPIER.SolverFlags.COMPUTE_IMPULSE;
      },
      filterIntersectionPair: () => true,
    };
    this.eventQueue = new RAPIER.EventQueue(true);

    this.buildField();
    for (const spawn of pack.pieceSpawns) {
      const [x, y, z] = spawn.position;
      this.addPiece(spawn.type, x, y, z, true, rotationToQuaternion(spawn.rotation));
    }
    for (const area of pack.pieceSpawnAreas) {
      for (const [x, y, z] of this.gridPositions(area.type, area.box, area.count, area.jitter)) {
        this.addPiece(area.type, x, y, z);
      }
    }

    for (const entry of robots) {
      const robot = this.createRobot(entry);
      for (let i = 0; i < (entry.preload ?? 0) && pack.preload; i++) {
        const piece = this.addPiece(pack.preload.type, 0, 0, 0, false);
        piece.state = 'stored';
        piece.heldBy = entry.id;
        robot.stored.push(piece.id);
      }
      this.robots.push(robot);
    }

    for (const station of pack.humanPlayerStations) {
      const record: StationRecord = { station, supply: [], feedDoneTick: null };
      for (let i = 0; i < station.supply; i++) {
        const piece = this.addPiece(station.pieceType, 0, 0, 0, false);
        piece.state = 'station';
        record.supply.push(piece.id);
      }
      this.stations.push(record);
    }

    const first = this.periods[0];
    if (first) this.events.push({ tick: 0, type: 'periodStarted', period: first.id });
  }

  get tick(): number {
    return this.tickCount;
  }

  get finished(): boolean {
    return this.periodIndex >= this.periods.length;
  }

  get currentPeriod(): string | null {
    return this.periods[this.periodIndex]?.id ?? null;
  }

  /** Every event since the match began, in order. */
  getEvents(): readonly SimEvent[] {
    return this.events;
  }

  /**
   * Advances the simulation by one fixed step. Robots without input receive
   * IDLE_INPUT. `humanPlayers` is keyed by human player station id; stations
   * without input stay idle.
   */
  step(
    inputs: Readonly<Record<string, RobotInput>> = {},
    humanPlayers: Readonly<Record<string, HumanPlayerInput>> = {},
  ): void {
    if (this.disposed) throw new Error('simulation has been disposed');
    if (this.finished) return;

    for (const robot of this.robots) {
      const input = inputs[robot.entry.id] ?? IDLE_INPUT;
      this.applyDrive(robot, input);
      if (input.intake) this.tryIntake(robot);
      if (input.release && !robot.releaseWasPressed) this.release(robot);
      robot.releaseWasPressed = input.release;
    }
    this.updateStations(humanPlayers);

    if (this.oneSided.size > 0) {
      this.updateOneSided();
      this.world.step(this.eventQueue, this.hooks);
    } else {
      this.world.step();
    }
    this.applyRollingResistance();
    this.tickCount += 1;
    this.returnProcessedPieces();
    this.checkOutOfBounds();
    this.returnOutOfBoundsPieces();
    this.checkScoring();
    this.advancePeriod();
  }

  snapshot(): SimSnapshot {
    const context = this.context();
    return {
      tick: this.tickCount,
      time: this.tickCount * SIM_STEP_SECONDS,
      period: this.currentPeriod,
      finished: this.finished,
      score: { ...this.score },
      robots: this.robots.map((r) => {
        const t = r.body.translation();
        const v = r.body.linvel();
        return {
          id: r.entry.id,
          alliance: r.entry.alliance,
          pose: { x: t.x, y: t.y, z: t.z, yaw: yawOf(r.body) },
          velocity: { x: v.x, y: v.y },
          storedPieces: [...r.stored],
        };
      }),
      pieces: this.pieces.map((p) => {
        const t = p.body?.translation();
        const q = p.body?.rotation();
        return {
          id: p.id,
          type: p.type,
          state: p.state,
          position: t ? { x: t.x, y: t.y, z: t.z } : null,
          rotation: q ? { x: q.x, y: q.y, z: q.z, w: q.w } : null,
          heldBy: p.heldBy,
        };
      }),
      goals: this.pack.field.goals.map((g) => ({
        id: g.id,
        alliance: g.creditAlliance,
        active: context ? this.isGoalActive(g, context) : false,
      })),
      stations: this.stations.map((s) => ({
        id: s.station.id,
        alliance: s.station.alliance,
        supply: s.supply.length,
        feeding: s.feedDoneTick !== null,
      })),
    };
  }

  /** Frees the physics world. The simulation cannot be used afterward. */
  dispose(): void {
    if (this.disposed) return;
    this.world.free();
    this.eventQueue.free();
    this.disposed = true;
  }

  private context(): MechanicContext | null {
    const window = this.periods[this.periodIndex];
    if (!window) return null;
    return {
      tick: this.tickCount,
      period: window.id,
      previousPeriod: this.periods[this.periodIndex - 1]?.id ?? null,
      ticksIntoPeriod: this.tickCount - window.startTick,
      random: this.random,
    };
  }

  private isGoalActive(goal: Goal, context: MechanicContext): boolean {
    return this.mechanics.every((m) => m.isGoalActive?.(goal, context) ?? true);
  }

  private buildField(): void {
    const { size, wallHeight, obstacles, carpet, wallSurface } = this.pack.field;
    const [length, width] = size;
    const fixedBox = (
      surface: Surface,
      cx: number,
      cy: number,
      cz: number,
      hx: number,
      hy: number,
      hz: number,
    ) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz),
      );
      this.world.createCollider(withSurface(RAPIER.ColliderDesc.cuboid(hx, hy, hz), surface), body);
    };

    const t = 0.5; // half-thickness of floor and walls
    fixedBox(carpet, length / 2, width / 2, -t, length / 2 + 2 * t, width / 2 + 2 * t, t);
    const wall = (cx: number, cy: number, hx: number, hy: number) =>
      fixedBox(wallSurface, cx, cy, wallHeight / 2, hx, hy, wallHeight / 2);
    wall(-t, width / 2, t, width / 2 + 2 * t);
    wall(length + t, width / 2, t, width / 2 + 2 * t);
    wall(length / 2, -t, length / 2, t);
    wall(length / 2, width + t, length / 2, t);

    for (const obstacle of obstacles) this.addObstacle(obstacle);
  }

  private addObstacle(obstacle: Obstacle): void {
    const { shape } = obstacle;
    const surface = obstacle.surface ?? DEFAULT_STRUCTURE_SURFACE;
    const [cx, cy, cz] = shape.center;
    const [sx, sy, sz] = shape.size;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(cx, cy, cz)
        .setRotation(rotationToQuaternion(shape.rotation)),
    );
    let desc: RAPIER.ColliderDesc;
    if (shape.kind === 'box') {
      desc = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
    } else {
      desc = ridgeCollider(shape.ridgeAxis, sx, sy, sz);
    }
    if (obstacle.oneSided) desc.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    const collider = this.world.createCollider(withSurface(desc, surface), body);
    if (obstacle.oneSided) {
      const [nx, ny, nz] = obstacle.oneSided.normal;
      const length = Math.hypot(nx, ny, nz);
      this.oneSided.set(collider.handle, {
        normal: [nx / length, ny / length, nz / length],
        center: [cx, cy, cz],
        reach: Math.hypot(sx, sy, sz) / 2 + ONE_SIDED_MARGIN,
        passing: new Set(),
      });
    }
  }

  /**
   * Before each physics step, lists the bodies behind each one-sided obstacle.
   * The contact filter lets those bodies pass through; bodies in front collide.
   */
  private updateOneSided(): void {
    const bodies: RigidBody[] = this.robots.map((r) => r.body);
    for (const piece of this.pieces) if (piece.body) bodies.push(piece.body);
    for (const record of this.oneSided.values()) {
      record.passing.clear();
      const [cx, cy, cz] = record.center;
      const [nx, ny, nz] = record.normal;
      for (const body of bodies) {
        const p = body.translation();
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dz = p.z - cz;
        if (Math.abs(dx) > record.reach || Math.abs(dy) > record.reach) continue;
        if (Math.hypot(dx, dy, dz) > record.reach) continue;
        if (dx * nx + dy * ny + dz * nz < 0) record.passing.add(body.handle);
      }
    }
  }

  /** Evenly spaced positions filling a box from the floor up, one layer at a time. */
  private gridPositions(
    type: string,
    box: Box,
    count: number,
    jitter: number,
  ): [number, number, number][] {
    const pieceType = this.pack.pieceTypes.find((t) => t.id === type);
    if (!pieceType) throw new Error(`unknown piece type "${type}"`);
    const radius = boundingRadius(pieceType.shape);
    const spacing = radius * 2 * 1.02;
    const [cx, cy, cz] = box.center;
    const [sx, sy, sz] = box.size;
    const columns = Math.max(1, Math.floor(sx / spacing));
    const rows = Math.max(1, Math.floor(sy / spacing));
    const startX = cx - ((columns - 1) * spacing) / 2;
    const startY = cy - ((rows - 1) * spacing) / 2;
    const floorZ = cz - sz / 2 + radius;

    const positions: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(i / (columns * rows));
      const inLayer = i % (columns * rows);
      const offset = jitter > 0 ? () => this.random.range(-jitter, jitter) : () => 0;
      positions.push([
        startX + (inLayer % columns) * spacing + offset(),
        startY + Math.floor(inLayer / columns) * spacing + offset(),
        floorZ + layer * spacing,
      ]);
    }
    return positions;
  }

  private addPiece(
    type: string,
    x: number,
    y: number,
    z: number,
    onField = true,
    rotation: Quaternion = IDENTITY_QUATERNION,
  ): PieceRecord {
    const pieceType = this.pack.pieceTypes.find((t) => t.id === type);
    if (!pieceType) throw new Error(`unknown piece type "${type}"`);
    const record: PieceRecord = {
      id: this.pieces.length,
      type,
      shape: pieceType.shape,
      rollingResistance: pieceType.rollingResistance,
      state: 'field',
      body: onField ? this.createPieceBody(type, x, y, z, { x: 0, y: 0, z: 0 }, rotation) : null,
      heldBy: null,
      recaptureBlockedFor: null,
      recaptureBlockedUntil: 0,
      returnTick: 0,
      returnGoal: null,
      returnPosition: null,
    };
    this.pieces.push(record);
    return record;
  }

  private createPieceBody(
    typeId: string,
    x: number,
    y: number,
    z: number,
    velocity: { x: number; y: number; z: number },
    rotation: Quaternion = IDENTITY_QUATERNION,
  ): RigidBody {
    const type = this.pack.pieceTypes.find((t) => t.id === typeId);
    if (!type) throw new Error(`unknown piece type "${typeId}"`);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation(rotation)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setCcdEnabled(true),
    );
    const { shape } = type;
    const collider =
      shape.kind === 'sphere'
        ? RAPIER.ColliderDesc.ball(shape.radius)
        : shape.kind === 'box'
          ? RAPIER.ColliderDesc.cuboid(shape.size[0] / 2, shape.size[1] / 2, shape.size[2] / 2)
          : RAPIER.ColliderDesc.cylinder(shape.length / 2, shape.radius).setRotation(CYLINDER_TO_Z);
    this.world.createCollider(withSurface(collider.setMass(type.mass), type), body);
    // New bodies can otherwise join a sleeping island and hang in midair.
    body.wakeUp();
    return body;
  }

  private createRobot(entry: RobotEntry): RobotRecord {
    const { frame, mass } = entry.spec;
    const { x, y, yaw } = entry.start;
    const r = Math.min(ROBOT_EDGE_RADIUS, frame.height / 4, frame.width / 4, frame.length / 4);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, frame.height / 2)
        .setRotation({ x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) })
        // Robots only turn about z for now. Tipping arrives with the bot creator.
        .enabledRotations(false, false, true)
        .setCanSleep(false),
    );
    this.world.createCollider(
      withSurface(
        RAPIER.ColliderDesc.roundCuboid(
          frame.length / 2 - r,
          frame.width / 2 - r,
          frame.height / 2 - r,
          r,
        ).setMass(mass),
        ROBOT_SURFACE,
      ),
      body,
    );
    return { entry, body, stored: [], releaseWasPressed: false };
  }

  private applyDrive(robot: RobotRecord, input: RobotInput): void {
    const { maxSpeed, maxAcceleration, maxTurnRate } = robot.entry.spec;
    let { x: dx, y: dy } = input.drive;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) {
      dx /= magnitude;
      dy /= magnitude;
    }

    const current = robot.body.linvel();
    const targetX = dx * maxSpeed;
    const targetY = dy * maxSpeed;
    const changeX = targetX - current.x;
    const changeY = targetY - current.y;
    const change = Math.hypot(changeX, changeY);
    const maxChange = maxAcceleration * SIM_STEP_SECONDS;
    const scale = change > maxChange ? maxChange / change : 1;

    robot.body.setLinvel(
      { x: current.x + changeX * scale, y: current.y + changeY * scale, z: current.z },
      true,
    );

    // Rotation ramps toward its target the same way translation does, limited
    // by angular acceleration, so turning eases in and out instead of snapping.
    const targetOmega = clamp(input.rotate, -1, 1) * maxTurnRate;
    const currentOmega = robot.body.angvel().z;
    const maxOmegaChange =
      (robot.entry.spec.maxAngularAcceleration ?? DEFAULT_ANGULAR_ACCELERATION) * SIM_STEP_SECONDS;
    const omegaChange = clamp(targetOmega - currentOmega, -maxOmegaChange, maxOmegaChange);
    robot.body.setAngvel({ x: 0, y: 0, z: currentOmega + omegaChange }, true);
  }

  private tryIntake(robot: RobotRecord): void {
    const { frame, intake } = robot.entry.spec;
    const t = robot.body.translation();
    const yaw = yawOf(robot.body);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const floor = t.z - frame.height / 2;

    for (const piece of this.pieces) {
      if (robot.stored.length >= intake.capacity) return;
      if (piece.state !== 'field' || !piece.body) continue;
      if (
        piece.recaptureBlockedFor === robot.entry.id &&
        this.tickCount < piece.recaptureBlockedUntil
      ) {
        continue;
      }
      const p = piece.body.translation();
      const relX = p.x - t.x;
      const relY = p.y - t.y;
      const forward = relX * cos + relY * sin;
      const side = -relX * sin + relY * cos;
      const inFront = forward >= frame.length / 2 && forward <= frame.length / 2 + intake.reach;
      const height = p.z - floor;
      if (
        inFront &&
        Math.abs(side) <= intake.width / 2 &&
        height >= -0.05 &&
        height <= frame.height
      ) {
        this.world.removeRigidBody(piece.body);
        piece.body = null;
        piece.state = 'stored';
        piece.heldBy = robot.entry.id;
        robot.stored.push(piece.id);
        this.events.push({
          tick: this.tickCount,
          type: 'pieceAcquired',
          pieceId: piece.id,
          robotId: robot.entry.id,
        });
      }
    }
  }

  private release(robot: RobotRecord): void {
    const pieceId = robot.stored.shift();
    if (pieceId === undefined) return;
    const piece = this.pieces[pieceId];
    if (!piece) return;

    const { frame, release } = robot.entry.spec;
    const t = robot.body.translation();
    const v = robot.body.linvel();
    const yaw = yawOf(robot.body);
    const radius = boundingRadius(piece.shape);
    const offset = frame.length / 2 + radius + 0.02;
    const horizontal = release.speed * Math.cos(release.pitch);
    const floor = t.z - frame.height / 2;
    // Cylinders leave with their axis along the launch direction, the way a
    // coral slides off an end effector onto a branch.
    const rotation =
      piece.shape.kind === 'cylinder'
        ? rotationToQuaternion([0, Math.PI / 2 - release.pitch, yaw])
        : IDENTITY_QUATERNION;

    piece.body = this.createPieceBody(
      piece.type,
      t.x + Math.cos(yaw) * offset,
      t.y + Math.sin(yaw) * offset,
      floor + release.height,
      {
        x: v.x + Math.cos(yaw) * horizontal,
        y: v.y + Math.sin(yaw) * horizontal,
        z: release.speed * Math.sin(release.pitch),
      },
      rotation,
    );
    piece.state = 'field';
    piece.heldBy = null;
    piece.recaptureBlockedFor = robot.entry.id;
    piece.recaptureBlockedUntil = this.tickCount + Math.round(RECAPTURE_COOLDOWN_SECONDS * SIM_HZ);
    this.events.push({
      tick: this.tickCount,
      type: 'pieceReleased',
      pieceId: piece.id,
      robotId: robot.entry.id,
    });
  }

  private checkScoring(): void {
    const context = this.context();
    if (context === null) return;

    for (const piece of this.pieces) {
      if (piece.state !== 'field' || !piece.body) continue;
      const p = piece.body.translation();
      let goal: Goal | undefined;
      let rules: GamePack['scoring'] = [];
      for (const candidate of this.pack.field.goals) {
        if (!boxContains(candidate.box, p.x, p.y, p.z)) continue;
        if (candidate.capacity !== undefined) {
          if ((this.goalCounts.get(candidate.id) ?? 0) >= candidate.capacity) continue;
        }
        rules = this.pack.scoring.filter(
          (r) =>
            r.goals.includes(candidate.id) && (!r.pieceTypes || r.pieceTypes.includes(piece.type)),
        );
        if (rules.length > 0) {
          goal = candidate;
          break;
        }
      }
      if (!goal) continue;

      const active = this.isGoalActive(goal, context);
      this.world.removeRigidBody(piece.body);
      piece.body = null;
      if (goal.recycle) {
        piece.state = 'processing';
        piece.returnGoal = goal;
        piece.returnTick = this.tickCount + Math.round(goal.recycle.delaySeconds * SIM_HZ);
      } else {
        piece.state = 'scored';
        this.goalCounts.set(goal.id, (this.goalCounts.get(goal.id) ?? 0) + 1);
      }

      for (const rule of rules) {
        const points = active ? pointsFor(rule, context.period) : 0;
        this.score[goal.creditAlliance] += points;
        this.events.push({
          tick: this.tickCount,
          type: 'pieceScored',
          pieceId: piece.id,
          goal: goal.id,
          rule: rule.id,
          alliance: goal.creditAlliance,
          active,
          points,
        });
      }
      const info = { goal, alliance: goal.creditAlliance, pieceType: piece.type, active };
      for (const mechanic of this.mechanics) mechanic.onPieceScored?.(info, context);
    }
  }

  /**
   * Rolling resistance.
   *
   * Rapier models sliding friction and angular inertia but not rolling
   * resistance, so a true rolling ball would coast on carpet almost forever.
   * We leave the ball's spin alone so friction can spin it up naturally (it
   * grips the carpet and starts rolling instead of scrubbing), and apply only
   * a gentle drag: a small deceleration proportional to rollingResistance,
   * which slightly slows a rolling ball over a long distance. The ball keeps
   * its stored spin, so it rolls slower but for longer. Below a crawl we stop
   * it outright so hundreds of settled pieces can sleep and stay cheap.
   */
  private applyRollingResistance(): void {
    const { carpet } = this.pack.field;
    for (const piece of this.pieces) {
      if (piece.state !== 'field' || !piece.body || piece.shape.kind === 'box') continue;
      if (piece.body.isSleeping()) continue;
      // Spheres always roll; a cylinder rolls only while lying on its side,
      // which is when its center is one radius above the carpet.
      const p = piece.body.translation();
      if (p.z > piece.shape.radius + CARPET_CONTACT_TOLERANCE) continue;

      const v = piece.body.linvel();
      const speed = Math.hypot(v.x, v.y);
      if (speed === 0) continue;

      const resistance = piece.rollingResistance ?? carpet.rollingResistance;
      const decel = resistance * GRAVITY * SIM_STEP_SECONDS;
      const next = speed - decel;

      if (next < ROLLING_STOP_SPEED) {
        // Settle: stop translating and spinning so the body can sleep.
        piece.body.setLinvel({ x: 0, y: 0, z: v.z }, false);
        const w = piece.body.angvel();
        piece.body.setAngvel({ x: 0, y: 0, z: w.z * 0.5 }, false);
        continue;
      }

      // Gentle drag on translation only. Spin is left to Rapier's friction so
      // the ball keeps rolling and loses speed slowly.
      const ratio = next / speed;
      piece.body.setLinvel({ x: v.x * ratio, y: v.y * ratio, z: v.z }, false);
    }
  }

  private returnProcessedPieces(): void {
    for (const piece of this.pieces) {
      if (piece.state !== 'processing' || this.tickCount < piece.returnTick) continue;
      const exit = piece.returnGoal?.recycle?.exit;
      if (!exit) continue;
      this.placeAtExit(piece, exit);
      piece.returnGoal = null;
    }
  }

  /** Puts a piece onto the field at a random point in an exit, moving at the exit's velocity. */
  private placeAtExit(piece: PieceRecord, exit: PieceExit): void {
    const [cx, cy, cz] = exit.box.center;
    const [sx, sy, sz] = exit.box.size;
    const [vx, vy, vz] = exit.velocity;
    piece.body = this.createPieceBody(
      piece.type,
      cx + this.random.range(-sx / 2, sx / 2),
      cy + this.random.range(-sy / 2, sy / 2),
      cz + this.random.range(-sz / 2, sz / 2),
      { x: vx, y: vy, z: vz },
      rotationToQuaternion(exit.rotation),
    );
    piece.state = 'field';
    piece.heldBy = null;
  }

  /**
   * Human player stations. While a station's feed input is held, the human
   * player spends `feedSeconds` on each piece, then it appears at the exit.
   * Letting go cancels the piece in progress.
   */
  private updateStations(inputs: Readonly<Record<string, HumanPlayerInput>>): void {
    for (const record of this.stations) {
      const feed = inputs[record.station.id]?.feed ?? false;
      if (!feed || record.supply.length === 0) {
        record.feedDoneTick = null;
        continue;
      }
      const feedTicks = Math.max(1, Math.round(record.station.feedSeconds * SIM_HZ));
      record.feedDoneTick ??= this.tickCount + feedTicks;
      if (this.tickCount < record.feedDoneTick) continue;

      const piece = this.pieces[record.supply.shift()!]!;
      this.placeAtExit(piece, record.station.exit);
      this.events.push({
        tick: this.tickCount,
        type: 'pieceFed',
        pieceId: piece.id,
        station: record.station.id,
      });
      // Still held: the next piece starts right away.
      record.feedDoneTick = record.supply.length > 0 ? this.tickCount + feedTicks : null;
    }
  }

  /**
   * Out-of-bounds re-entry. A piece whose center leaves the field rectangle
   * (over a wall) or drops through the floor is taken out of play, then put
   * back on the carpet after a delay, the way a referee would.
   */
  private checkOutOfBounds(): void {
    const [length, width] = this.pack.field.size;
    const rule = this.pack.field.outOfBounds;
    for (const piece of this.pieces) {
      if (piece.state !== 'field' || !piece.body) continue;
      const p = piece.body.translation();
      const outside = p.x < 0 || p.x > length || p.y < 0 || p.y > width;
      if (!outside && p.z >= OUT_OF_BOUNDS_FLOOR) continue;

      const v = piece.body.linvel();
      const rest = restHeight(piece.shape);
      let target: [number, number];
      if (rule.mode === 'exitPoint') {
        target = [p.x, p.y];
      } else {
        // Where the piece would come down, from its height and velocity now.
        const rise = p.z - rest;
        const t =
          rise > 0 || v.z > 0
            ? (v.z + Math.sqrt(v.z * v.z + 2 * GRAVITY * Math.max(rise, 0))) / GRAVITY
            : 0;
        target = [p.x + v.x * t, p.y + v.y * t];
      }

      let position: [number, number, number];
      const zone =
        rule.mode === 'zone'
          ? nearest(rule.zones, (z) =>
              Math.hypot(z.box.center[0] - target[0], z.box.center[1] - target[1]),
            )
          : undefined;
      if (zone) {
        const [cx, cy, cz] = zone.box.center;
        const [sx, sy, sz] = zone.box.size;
        position = [
          cx + this.random.range(-sx / 2, sx / 2),
          cy + this.random.range(-sy / 2, sy / 2),
          Math.max(cz - sz / 2, 0) + rest + 0.01,
        ];
      } else {
        // Nearest point inside the field, far enough from the wall to fit the piece.
        const inset = boundingRadius(piece.shape) + RETURN_CLEARANCE;
        position = [
          clamp(target[0], inset, length - inset),
          clamp(target[1], inset, width - inset),
          rest + 0.01,
        ];
      }

      this.world.removeRigidBody(piece.body);
      piece.body = null;
      piece.state = 'outOfBounds';
      piece.returnPosition = position;
      piece.returnTick = this.tickCount + Math.round(rule.delaySeconds * SIM_HZ);
      this.events.push({ tick: this.tickCount, type: 'pieceLeftField', pieceId: piece.id });
    }
  }

  private returnOutOfBoundsPieces(): void {
    for (const piece of this.pieces) {
      if (piece.state !== 'outOfBounds' || this.tickCount < piece.returnTick) continue;
      const [x, y, z] = piece.returnPosition!;
      const rotation = piece.shape.kind === 'cylinder' ? LYING_CYLINDER : IDENTITY_QUATERNION;
      piece.body = this.createPieceBody(piece.type, x, y, z, { x: 0, y: 0, z: 0 }, rotation);
      piece.state = 'field';
      piece.returnPosition = null;
      this.events.push({ tick: this.tickCount, type: 'pieceReturned', pieceId: piece.id });
    }
  }

  private advancePeriod(): void {
    const window = this.periods[this.periodIndex];
    if (!window || this.tickCount < window.endTick) return;
    this.periodIndex += 1;
    const next = this.periods[this.periodIndex];
    if (next) {
      this.events.push({ tick: this.tickCount, type: 'periodStarted', period: next.id });
    } else {
      this.events.push({ tick: this.tickCount, type: 'matchEnded' });
    }
  }
}

/** Loads physics if needed, then creates a simulation. */
export async function createSimulation(options: SimulationOptions): Promise<Simulation> {
  await initPhysics();
  return new Simulation(options);
}

function yawOf(body: RigidBody): number {
  const q = body.rotation();
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
}

function boundingRadius(shape: PieceShape): number {
  switch (shape.kind) {
    case 'sphere':
      return shape.radius;
    case 'box':
      return Math.hypot(...shape.size) / 2;
    case 'cylinder':
      return Math.hypot(shape.radius * 2, shape.length) / 2;
  }
}

/** Height of a piece's center when it rests on the carpet as the engine returns it. */
function restHeight(shape: PieceShape): number {
  switch (shape.kind) {
    case 'sphere':
      return shape.radius;
    case 'box':
      return shape.size[2] / 2;
    case 'cylinder':
      return shape.radius; // returned lying on its side
  }
}

/** Triangular prism collider for a ridge obstacle, in the obstacle's own frame. */
function ridgeCollider(axis: 'x' | 'y', sx: number, sy: number, sz: number): RAPIER.ColliderDesc {
  // Base fills the box footprint, peak runs along the ridge axis at the top.
  // The base is sunk slightly below the box so a robot sliding on the floor meets the
  // sloped face instead of the zero-height toe edge, which would stop it dead.
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const base = -hz - RIDGE_SINK;
  const points =
    axis === 'y'
      ? [-hx, -hy, base, hx, -hy, base, 0, -hy, hz, -hx, hy, base, hx, hy, base, 0, hy, hz]
      : [-hx, -hy, base, -hx, hy, base, -hx, 0, hz, hx, -hy, base, hx, hy, base, hx, 0, hz];
  const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
  if (!hull) throw new Error('could not build ridge obstacle');
  return hull;
}

function nearest<T>(items: readonly T[], distance: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestDistance = Infinity;
  for (const item of items) {
    const d = distance(item);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
