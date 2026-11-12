import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-deterministic-compat';
import { SIM_HZ, SIM_STEP_SECONDS } from './constants';
import { getMechanic, type MechanicContext, type MechanicInstance } from './mechanics';
import {
  boxContains,
  pointsFor,
  type Alliance,
  type Box,
  type GamePack,
  type Goal,
  type ObstacleShape,
  type PieceShape,
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

export interface SimulationOptions {
  pack: GamePack;
  robots: RobotEntry[];
  seed?: number;
}

/**
 * field: loose on the field. stored: held by a robot. processing: inside a
 * recycling goal, about to return to the field. scored: removed from play.
 */
export type PieceState = 'field' | 'stored' | 'processing' | 'scored';

export type SimEvent =
  | { tick: number; type: 'periodStarted'; period: string }
  | { tick: number; type: 'matchEnded' }
  | { tick: number; type: 'pieceAcquired'; pieceId: number; robotId: string }
  | { tick: number; type: 'pieceReleased'; pieceId: number; robotId: string }
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
  heldBy: string | null;
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
}

interface PieceRecord {
  id: number;
  type: string;
  shape: PieceShape;
  state: PieceState;
  body: RigidBody | null;
  heldBy: string | null;
  /** The robot that last released this piece cannot recapture it until this tick. */
  recaptureBlockedFor: string | null;
  recaptureBlockedUntil: number;
  /** For processing pieces: when and where they return to the field. */
  returnTick: number;
  returnGoal: Goal | null;
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

    this.buildField();
    for (const spawn of pack.pieceSpawns) {
      const [x, y, z] = spawn.position;
      this.addPiece(spawn.type, x, y, z);
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

  /** Advances the simulation by one fixed step. Robots without input receive IDLE_INPUT. */
  step(inputs: Readonly<Record<string, RobotInput>> = {}): void {
    if (this.disposed) throw new Error('simulation has been disposed');
    if (this.finished) return;

    for (const robot of this.robots) {
      const input = inputs[robot.entry.id] ?? IDLE_INPUT;
      this.applyDrive(robot, input);
      if (input.intake) this.tryIntake(robot);
      if (input.release && !robot.releaseWasPressed) this.release(robot);
      robot.releaseWasPressed = input.release;
    }

    this.world.step();
    this.tickCount += 1;
    this.returnProcessedPieces();
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
        return {
          id: p.id,
          type: p.type,
          state: p.state,
          position: t ? { x: t.x, y: t.y, z: t.z } : null,
          heldBy: p.heldBy,
        };
      }),
      goals: this.pack.field.goals.map((g) => ({
        id: g.id,
        alliance: g.creditAlliance,
        active: context ? this.isGoalActive(g, context) : false,
      })),
    };
  }

  /** Frees the physics world. The simulation cannot be used afterward. */
  dispose(): void {
    if (this.disposed) return;
    this.world.free();
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
    const { size, wallHeight, obstacles } = this.pack.field;
    const [length, width] = size;
    const fixedBox = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz),
      );
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8), body);
    };

    const t = 0.5; // half-thickness of floor and walls
    fixedBox(length / 2, width / 2, -t, length / 2 + 2 * t, width / 2 + 2 * t, t);
    fixedBox(-t, width / 2, wallHeight / 2, t, width / 2 + 2 * t, wallHeight / 2);
    fixedBox(length + t, width / 2, wallHeight / 2, t, width / 2 + 2 * t, wallHeight / 2);
    fixedBox(length / 2, -t, wallHeight / 2, length / 2, t, wallHeight / 2);
    fixedBox(length / 2, width + t, wallHeight / 2, length / 2, t, wallHeight / 2);

    for (const obstacle of obstacles) this.addObstacle(obstacle.shape);
  }

  private addObstacle(shape: ObstacleShape): void {
    const [cx, cy, cz] = shape.center;
    const [sx, sy, sz] = shape.size;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz),
    );
    if (shape.kind === 'box') {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setFriction(0.8),
        body,
      );
      return;
    }
    // Triangular prism: base fills the box footprint, peak runs along ridgeAxis at the top.
    // The base is sunk slightly below the box so a robot sliding on the floor meets the
    // sloped face instead of the zero-height toe edge, which would stop it dead.
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const base = -hz - RIDGE_SINK;
    const points =
      shape.ridgeAxis === 'y'
        ? [-hx, -hy, base, hx, -hy, base, 0, -hy, hz, -hx, hy, base, hx, hy, base, 0, hy, hz]
        : [-hx, -hy, base, -hx, hy, base, -hx, 0, hz, hx, -hy, base, hx, hy, base, hx, 0, hz];
    const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
    if (!hull) throw new Error('could not build ridge obstacle');
    this.world.createCollider(hull.setFriction(0.8), body);
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

  private addPiece(type: string, x: number, y: number, z: number, onField = true): PieceRecord {
    const pieceType = this.pack.pieceTypes.find((t) => t.id === type);
    if (!pieceType) throw new Error(`unknown piece type "${type}"`);
    const record: PieceRecord = {
      id: this.pieces.length,
      type,
      shape: pieceType.shape,
      state: 'field',
      body: onField ? this.createPieceBody(type, x, y, z, { x: 0, y: 0, z: 0 }) : null,
      heldBy: null,
      recaptureBlockedFor: null,
      recaptureBlockedUntil: 0,
      returnTick: 0,
      returnGoal: null,
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
  ): RigidBody {
    const type = this.pack.pieceTypes.find((t) => t.id === typeId);
    if (!type) throw new Error(`unknown piece type "${typeId}"`);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setCcdEnabled(true),
    );
    const collider =
      type.shape.kind === 'sphere'
        ? RAPIER.ColliderDesc.ball(type.shape.radius)
        : RAPIER.ColliderDesc.cuboid(
            type.shape.size[0] / 2,
            type.shape.size[1] / 2,
            type.shape.size[2] / 2,
          );
    this.world.createCollider(
      collider
        .setMass(type.mass)
        .setFriction(type.friction)
        // Max outranks the robots' Min rule, so pieces keep their grip against robots.
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setRestitution(type.restitution),
      body,
    );
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
      RAPIER.ColliderDesc.roundCuboid(
        frame.length / 2 - r,
        frame.width / 2 - r,
        frame.height / 2 - r,
        r,
      )
        .setMass(mass)
        // Robots are driven by setting velocity, not by wheel friction. Zero friction lets
        // the box-shaped body slide up ramps instead of sticking to them.
        .setFriction(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),
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
    robot.body.setAngvel({ x: 0, y: 0, z: clamp(input.rotate, -1, 1) * maxTurnRate }, true);
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
      const goal = this.pack.field.goals.find((g) => boxContains(g.box, p.x, p.y, p.z));
      if (!goal) continue;

      const rules = this.pack.scoring.filter(
        (r) => r.goals.includes(goal.id) && (!r.pieceTypes || r.pieceTypes.includes(piece.type)),
      );
      if (rules.length === 0) continue;

      const active = this.isGoalActive(goal, context);
      this.world.removeRigidBody(piece.body);
      piece.body = null;
      if (goal.recycle) {
        piece.state = 'processing';
        piece.returnGoal = goal;
        piece.returnTick = this.tickCount + Math.round(goal.recycle.delaySeconds * SIM_HZ);
      } else {
        piece.state = 'scored';
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

  private returnProcessedPieces(): void {
    for (const piece of this.pieces) {
      if (piece.state !== 'processing' || this.tickCount < piece.returnTick) continue;
      const exit = piece.returnGoal?.recycle?.exit;
      if (!exit) continue;
      const [cx, cy, cz] = exit.box.center;
      const [sx, sy, sz] = exit.box.size;
      const [vx, vy, vz] = exit.velocity;
      piece.body = this.createPieceBody(
        piece.type,
        cx + this.random.range(-sx / 2, sx / 2),
        cy + this.random.range(-sy / 2, sy / 2),
        cz + this.random.range(-sz / 2, sz / 2),
        { x: vx, y: vy, z: vz },
      );
      piece.state = 'field';
      piece.returnGoal = null;
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
  return shape.kind === 'sphere' ? shape.radius : Math.hypot(...shape.size) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
