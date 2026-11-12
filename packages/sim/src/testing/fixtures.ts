import { loadGamePack, type GamePack } from '../pack';
import type { RobotEntry } from '../simulation';
import type { RobotInput, RobotSpec } from '../robot';
import type { SimSnapshot } from '../simulation';
import arena from './test-arena.json';

/** Returns a fresh deep copy of the raw test-arena data, safe to modify in tests. */
export function rawTestArena(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(arena)) as Record<string, unknown>;
}

export function testArena(): GamePack {
  return loadGamePack(rawTestArena());
}

export const TEST_ROBOT_SPEC: RobotSpec = {
  frame: { length: 0.8, width: 0.8, height: 0.5 },
  mass: 50,
  maxSpeed: 4,
  maxAcceleration: 8,
  maxTurnRate: 6,
  intake: { reach: 0.25, width: 0.6, capacity: 3 },
  release: { height: 0.3, speed: 3, pitch: 0 },
};

export function testRobot(overrides: Partial<RobotEntry> = {}): RobotEntry {
  return {
    id: 'blue-1',
    alliance: 'blue',
    spec: TEST_ROBOT_SPEC,
    start: { x: 1, y: 2.5, yaw: 0 },
    ...overrides,
  };
}

/** Field-relative drive command toward a point, slowing near it. */
export function driveToward(snapshot: SimSnapshot, robotId: string, x: number, y: number) {
  const robot = snapshot.robots.find((r) => r.id === robotId);
  if (!robot) throw new Error(`no robot "${robotId}"`);
  const dx = x - robot.pose.x;
  const dy = y - robot.pose.y;
  const distance = Math.hypot(dx, dy);
  const speed = Math.min(1, distance * 1.5);
  return {
    drive:
      distance > 1e-6 ? { x: (dx / distance) * speed, y: (dy / distance) * speed } : { x: 0, y: 0 },
    distance,
  };
}

export function input(partial: Partial<RobotInput>): RobotInput {
  return { drive: { x: 0, y: 0 }, rotate: 0, intake: false, release: false, ...partial };
}
