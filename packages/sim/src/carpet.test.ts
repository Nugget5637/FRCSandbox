import { beforeAll, describe, expect, it } from 'vitest';
import { SIM_HZ } from './constants';
import { FRC_CARPET, loadGamePack } from './pack';
import { combineSurfaces, initPhysics, Simulation, type RobotEntry } from './simulation';
import { rawTestArena, TEST_ROBOT_SPEC } from './testing/fixtures';

beforeAll(async () => {
  await initPhysics();
});

type Raw = Record<string, any>;

/** The test arena with one piece type swapped in and the field emptied. */
function arenaWith(piece: Raw, carpet?: Raw): Raw {
  const raw = rawTestArena() as Raw;
  raw.pieceTypes = [{ id: 'ball', name: 'Test piece', mass: 0.2, ...piece }];
  raw.pieceSpawns = [];
  raw.field.obstacles = [];
  if (carpet) raw.field.carpet = carpet;
  return raw;
}

/**
 * Launches one preloaded piece along the floor from a robot at x = 1, in a lane
 * clear of the goal, and returns the farthest distance it reaches in 6 seconds.
 */
function travel(raw: Raw, speed = 2): number {
  raw.preload = { type: 'ball', maxPerRobot: 1 };
  const pack = loadGamePack(raw);
  const robot: RobotEntry = {
    id: 'blue-1',
    alliance: 'blue',
    spec: { ...TEST_ROBOT_SPEC, release: { height: 0.12, speed, pitch: 0 } },
    start: { x: 1, y: 1, yaw: 0 },
    preload: 1,
  };
  const sim = new Simulation({ pack, robots: [robot] });
  sim.step({ 'blue-1': { drive: { x: 0, y: 0 }, rotate: 0, intake: false, release: true } });
  const startX = sim.snapshot().pieces[0]!.position!.x;
  let farthest = 0;
  for (let i = 0; i < 6 * SIM_HZ; i++) {
    sim.step();
    const piece = sim.snapshot().pieces[0]!;
    if (piece.state !== 'field') throw new Error(`piece left the field (${piece.state})`);
    farthest = Math.max(farthest, piece.position!.x - startX);
  }
  sim.dispose();
  return farthest;
}

const sphere = { shape: { kind: 'sphere', radius: 0.075 }, friction: 0.7, restitution: 0.3 };
const block = { shape: { kind: 'box', size: [0.15, 0.15, 0.15] }, restitution: 0 };

describe('carpet material', () => {
  it('defaults to standard FRC carpet when a pack does not specify one', () => {
    const pack = loadGamePack(arenaWith(sphere));
    expect(pack.field.carpet).toEqual(FRC_CARPET);
  });

  it('combines surfaces with the geometric mean', () => {
    const pair = combineSurfaces({ friction: 0.7, restitution: 0.3 }, FRC_CARPET);
    expect(pair.friction).toBeCloseTo(Math.sqrt(0.7 * 0.8), 6);
    expect(pair.restitution).toBeCloseTo(Math.sqrt(0.3 * 0.4), 6);
  });

  it("uses each piece's own friction against the carpet", () => {
    // Before this fix the floor forced at least 0.8 friction on every piece,
    // so a frictionless piece stopped as fast as a grippy one.
    const slick = travel(arenaWith({ ...block, friction: 0 }));
    const grippy = travel(arenaWith({ ...block, friction: 1 }));
    expect(slick).toBeGreaterThan(grippy * 3);
  });

  it('stops rolling balls through rolling resistance', () => {
    const rolling = travel(arenaWith(sphere));
    expect(rolling).toBeGreaterThan(0.5);
    expect(rolling).toBeLessThan(3);

    const noResistance = travel(arenaWith(sphere, { ...FRC_CARPET, rollingResistance: 0 }));
    expect(noResistance).toBeGreaterThan(rolling * 2);
  });

  it('rolls shorter on a rougher carpet', () => {
    const normal = travel(arenaWith(sphere));
    const rough = travel(arenaWith(sphere, { ...FRC_CARPET, rollingResistance: 0.16 }));
    // Rolling distance is v^2 / (2 c g), so doubling c roughly halves it.
    expect(rough).toBeLessThan(normal * 0.65);
    expect(rough).toBeGreaterThan(normal * 0.35);
  });

  it("lets a piece override the carpet's rolling resistance with a measured value", () => {
    const fromCarpet = travel(arenaWith(sphere));
    const measured = travel(arenaWith({ ...sphere, rollingResistance: 0.16 }));
    expect(measured).toBeLessThan(fromCarpet * 0.65);
  });
});
