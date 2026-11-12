import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-deterministic-compat';
import { SIM_HZ, SIM_STEP_SECONDS } from './constants';
import { boxContains, pointsFor, type Alliance, type GamePack, type PieceShape } from './pack';
import { checkRobotRules, IDLE_INPUT, type RobotInput, type RobotSpec } from './robot';
import { SeededRandom } from './rng';

export const GRAVITY = 9.81;

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
}

export interface SimulationOptions {
  pack: GamePack;
  robots: RobotEntry[];
  seed?: number;
}

export type PieceState = 'field' | 'stored' | 'scored';

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

export interface SimSnapshot {
  tick: number;
  time: number;
  period: string | null;
  finished: boolean;
  score: Record<Alliance, number>;
  robots: RobotSnapshot[];
  pieces: PieceSnapshot[];
}

interface PieceRecord {
  id: number;
  type: string;
  shape: PieceShape;
  state: PieceState;
  body: RigidBody | null;
  heldBy: string | null;
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

    this.world = new RAPIER.World({ x: 0, y: 0, z: -GRAVITY });
    this.world.timestep = SIM_STEP_SECONDS;

    this.buildField();
    pack.pieceSpawns.forEach((spawn, index) => {
      const type = pack.pieceTypes.find((t) => t.id === spawn.type);
      if (!type) throw new Error(`unknown piece type "${spawn.type}"`);
      const record: PieceRecord = {
        id: index,
        type: type.id,
        shape: type.shape,
        state: 'field',
        body: null,
        heldBy: null,
      };
      const [x, y, z] = spawn.position;
      record.body = this.createPieceBody(type.id, x, y, z, { x: 0, y: 0, z: 0 });
      this.pieces.push(record);
    });

    for (const entry of robots) this.robots.push(this.createRobot(entry));

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
    this.checkScoring();
    this.advancePeriod();
  }

  snapshot(): SimSnapshot {
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
    };
  }

  /** Frees the physics world. The simulation cannot be used afterward. */
  dispose(): void {
    if (this.disposed) return;
    this.world.free();
    this.disposed = true;
  }

  private buildField(): void {
    const { size, wallHeight, obstacles } = this.pack.field;
    const [length, width] = size;
    const fixed = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz),
      );
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8), body);
    };

    const t = 0.5; // half-thickness of floor and walls
    fixed(length / 2, width / 2, -t, length / 2 + 2 * t, width / 2 + 2 * t, t);
    fixed(-t, width / 2, wallHeight / 2, t, width / 2 + 2 * t, wallHeight / 2);
    fixed(length + t, width / 2, wallHeight / 2, t, width / 2 + 2 * t, wallHeight / 2);
    fixed(length / 2, -t, wallHeight / 2, length / 2, t, wallHeight / 2);
    fixed(length / 2, width + t, wallHeight / 2, length / 2, t, wallHeight / 2);

    for (const obstacle of obstacles) {
      const [cx, cy, cz] = obstacle.box.center;
      const [sx, sy, sz] = obstacle.box.size;
      fixed(cx, cy, cz, sx / 2, sy / 2, sz / 2);
    }
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
      collider.setMass(type.mass).setFriction(type.friction).setRestitution(type.restitution),
      body,
    );
    return body;
  }

  private createRobot(entry: RobotEntry): RobotRecord {
    const { frame, mass } = entry.spec;
    const { x, y, yaw } = entry.start;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, frame.height / 2)
        .setRotation({ x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) })
        // Milestone 1 robots only turn about z. Tipping arrives with the bot creator.
        .enabledRotations(false, false, true)
        .setCanSleep(false),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(frame.length / 2, frame.width / 2, frame.height / 2)
        .setMass(mass)
        .setFriction(0.1),
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

    for (const piece of this.pieces) {
      if (robot.stored.length >= intake.capacity) return;
      if (piece.state !== 'field' || !piece.body) continue;
      const p = piece.body.translation();
      const relX = p.x - t.x;
      const relY = p.y - t.y;
      const forward = relX * cos + relY * sin;
      const side = -relX * sin + relY * cos;
      const inFront = forward >= frame.length / 2 && forward <= frame.length / 2 + intake.reach;
      if (inFront && Math.abs(side) <= intake.width / 2 && p.z <= frame.height) {
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

    piece.body = this.createPieceBody(
      piece.type,
      t.x + Math.cos(yaw) * offset,
      t.y + Math.sin(yaw) * offset,
      release.height,
      {
        x: v.x + Math.cos(yaw) * horizontal,
        y: v.y + Math.sin(yaw) * horizontal,
        z: release.speed * Math.sin(release.pitch),
      },
    );
    piece.state = 'field';
    piece.heldBy = null;
    this.events.push({
      tick: this.tickCount,
      type: 'pieceReleased',
      pieceId: piece.id,
      robotId: robot.entry.id,
    });
  }

  private checkScoring(): void {
    const period = this.currentPeriod;
    if (period === null) return;

    for (const piece of this.pieces) {
      if (piece.state !== 'field' || !piece.body) continue;
      const p = piece.body.translation();
      const goal = this.pack.field.goals.find((g) => boxContains(g.box, p.x, p.y, p.z));
      if (!goal) continue;

      const rules = this.pack.scoring.filter(
        (r) => r.goals.includes(goal.id) && (!r.pieceTypes || r.pieceTypes.includes(piece.type)),
      );
      if (rules.length === 0) continue;

      this.world.removeRigidBody(piece.body);
      piece.body = null;
      piece.state = 'scored';
      for (const rule of rules) {
        const points = pointsFor(rule, period);
        this.score[goal.creditAlliance] += points;
        this.events.push({
          tick: this.tickCount,
          type: 'pieceScored',
          pieceId: piece.id,
          goal: goal.id,
          rule: rule.id,
          alliance: goal.creditAlliance,
          points,
        });
      }
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
