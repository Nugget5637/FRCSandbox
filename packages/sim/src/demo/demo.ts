import { loadGamePack, type GamePack } from '../pack';
import type { RobotInput, RobotSpec } from '../robot';
import type { RobotEntry, SimSnapshot } from '../simulation';
import arena from './demo-arena.json';

/**
 * Temporary demo content for the debug view. Replaced by real game packs and
 * the 3D view in Milestones 2 and 3.
 */

export function demoArena(): GamePack {
  return loadGamePack(arena);
}

export const DEMO_ROBOT_SPEC: RobotSpec = {
  frame: { length: 0.8, width: 0.8, height: 0.5 },
  mass: 50,
  maxSpeed: 4,
  maxAcceleration: 8,
  maxTurnRate: 6,
  intake: { reach: 0.25, width: 0.8, capacity: 3 },
  release: { height: 0.3, speed: 3, pitch: 0 },
};

/** Demo arena width (y), used to keep the robot off the walls. */
const FIELD_WIDTH = 5;

export const DEMO_ROBOT: RobotEntry = {
  id: 'blue-1',
  alliance: 'blue',
  spec: DEMO_ROBOT_SPEC,
  start: { x: 1, y: 2.5, yaw: 0 },
};

/** Where the scripted robot stops to release into the demo goal. */
const RELEASE_POINT = { x: 4.9, y: 2.5 };
/** Home spot once every ball is scored. */
const HOME = { x: 1, y: 2.5 };

export type DemoPhase = 'collect' | 'score' | 'home';

export interface DemoController {
  readonly phase: DemoPhase;
  next(snapshot: SimSnapshot): RobotInput;
}

/**
 * Scripted robot for the demo: collect balls until full (or none are left),
 * drive to the release point, release them one at a time, and repeat.
 */
export function createDemoController(robotId: string = DEMO_ROBOT.id): DemoController {
  let phase: DemoPhase = 'collect';

  return {
    get phase() {
      return phase;
    },
    next(snapshot) {
      const robot = snapshot.robots.find((r) => r.id === robotId);
      if (!robot) throw new Error(`no robot "${robotId}"`);
      const capacity = DEMO_ROBOT_SPEC.intake.capacity;
      const stored = robot.storedPieces.length;
      const free = snapshot.pieces.filter((p) => p.state === 'field' && p.position);
      const rotate = clamp(-robot.pose.yaw * 3, -1, 1);

      if (phase === 'collect' && (stored >= capacity || (stored > 0 && free.length === 0))) {
        phase = 'score';
      } else if (phase === 'score' && stored === 0) {
        phase = free.length > 0 ? 'collect' : 'home';
      } else if (phase === 'home' && free.length > 0) {
        phase = 'collect';
      }

      if (phase === 'collect') {
        let target = free[0]?.position;
        let best = Infinity;
        for (const piece of free) {
          const p = piece.position!;
          const d = Math.hypot(p.x - robot.pose.x, p.y - robot.pose.y);
          if (d < best) {
            best = d;
            target = p;
          }
        }
        if (!target) return idle(rotate);
        // Line up behind the ball (staying off the walls), then drive straight in.
        const half = DEMO_ROBOT_SPEC.frame.width / 2 + 0.02;
        const laneY = clamp(target.y, half, FIELD_WIDTH - half);
        const lined = Math.abs(robot.pose.y - laneY) < 0.05;
        const behind = robot.pose.x < target.x - 0.45;
        const drive =
          lined && behind
            ? driveToward(robot.pose, target.x - 0.5, laneY)
            : driveToward(robot.pose, Math.max(target.x - 1, half), laneY);
        return { drive, rotate, intake: true, release: false };
      }

      if (phase === 'score') {
        const { x, y } = RELEASE_POINT;
        const drive = driveToward(robot.pose, x, y);
        const distance = Math.hypot(x - robot.pose.x, y - robot.pose.y);
        const speed = Math.hypot(robot.velocity.x, robot.velocity.y);
        const aligned = Math.abs(robot.pose.yaw) < 0.05;
        const ready = distance < 0.05 && speed < 0.1 && aligned;
        // Toggle release each tick so every press is a new rising edge.
        return { drive, rotate, intake: false, release: ready && snapshot.tick % 8 === 0 };
      }

      return {
        drive: driveToward(robot.pose, HOME.x, HOME.y),
        rotate,
        intake: false,
        release: false,
      };
    },
  };
}

function driveToward(pose: { x: number; y: number }, x: number, y: number) {
  const dx = x - pose.x;
  const dy = y - pose.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) return { x: 0, y: 0 };
  const speed = Math.min(1, distance * 1.5);
  return { x: (dx / distance) * speed, y: (dy / distance) * speed };
}

function idle(rotate: number): RobotInput {
  return { drive: { x: 0, y: 0 }, rotate, intake: false, release: false };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
