import { beforeAll, describe, expect, it } from 'vitest';
import reefscapeData from '../../../../game-packs/reefscape-2025/pack.json';
import { SIM_HZ } from '../constants';
import { GRAVITY, initPhysics, Simulation, type RobotEntry } from '../simulation';
import { loadGamePack, type GamePack } from '../pack';
import type { RobotInput, RobotSpec } from '../robot';

const pack: GamePack = loadGamePack(reefscapeData);
const IN = 0.0254;

beforeAll(async () => {
  await initPhysics();
});

/** A legal REEFSCAPE robot: 28 in square (112 in perimeter), 36 in tall, 50 kg. */
function robotSpec(overrides: Partial<RobotSpec> = {}): RobotSpec {
  return {
    frame: { length: 0.7112, width: 0.7112, height: 0.9144 },
    mass: 50,
    maxSpeed: 4.5,
    maxAcceleration: 6,
    maxTurnRate: 6,
    intake: { reach: 0.25, width: 0.6, capacity: 1 },
    release: { height: 0.75, speed: 0.3, pitch: 0 },
    ...overrides,
  };
}

function input(partial: Partial<RobotInput>): RobotInput {
  return { drive: { x: 0, y: 0 }, rotate: 0, intake: false, release: false, ...partial };
}

/** Launch speed that lands a piece at the target from a given horizontal distance and rise. */
function launchSpeed(distance: number, rise: number, pitch: number): number {
  const cos = Math.cos(pitch);
  return Math.sqrt(
    (GRAVITY * distance * distance) / (2 * cos * cos * (distance * Math.tan(pitch) - rise)),
  );
}

const goal = (id: string) => pack.field.goals.find((g) => g.id === id)!;
/** Blue reef center: midpoint of AprilTags 18 and 21 in the WPILib 2025 layout. */
const REEF = { x: (3.6576 + 5.321) / 2, y: 4.0259 };
/** Face 0 of the blue reef (AprilTag 18) faces the blue alliance wall. */
const FACE0_X = 3.6576;
/** Distance from a robot's center to where it releases a coral. */
const coralReleaseOffset = (spec: RobotSpec) =>
  spec.frame.length / 2 + Math.hypot(4.5 * IN, 11.875 * IN) / 2 + 0.02;

function events(sim: Simulation, type: string) {
  return sim.getEvents().filter((e) => e.type === type);
}

describe('REEFSCAPE pack data', () => {
  it('loads and validates', () => {
    expect(pack.id).toBe('reefscape-2025');
    expect(pack.mechanics).toEqual([]);
    // Manual 6.4: 15 s AUTO plus 2:15 TELEOP.
    expect(pack.match.periods).toEqual([
      { id: 'auto', durationSeconds: 15 },
      { id: 'teleop', durationSeconds: 135 },
    ]);
  });

  it('matches the official field size and staging counts', () => {
    expect(pack.field.size).toEqual([17.548, 8.052]);
    const spawned = (type: string) => pack.pieceSpawns.filter((s) => s.type === type).length;
    // Manual 6.3.4: 126 coral (6 on marks, up to 6 preloaded, the rest at coral
    // stations) and 18 algae (12 on the reefs, 6 on the coral marks).
    const stationCoral = pack.humanPlayerStations.reduce((n, s) => n + s.supply, 0);
    expect(spawned('coral')).toBe(6);
    expect(stationCoral).toBe(114);
    expect(pack.preload).toEqual({ type: 'coral', maxPerRobot: 1 });
    expect(spawned('coral') + stationCoral + 6 * pack.preload!.maxPerRobot).toBe(126);
    expect(spawned('algae')).toBe(18);
    expect(pack.humanPlayerStations.map((s) => [s.id, s.supply])).toEqual([
      ['blue-coral-station-right', 29],
      ['red-coral-station-right', 29],
      ['blue-coral-station-left', 28],
      ['red-coral-station-left', 28],
    ]);
  });

  it('places 12 one-coral branches per level on each reef, around the AprilTag center', () => {
    for (const level of ['l2', 'l3', 'l4']) {
      const blue = pack.field.goals.filter((g) => g.id.startsWith(`blue-reef-${level}-`));
      expect(blue).toHaveLength(12);
      expect(blue.every((g) => g.capacity === 1 && g.box.rotation)).toBe(true);
      const cx = blue.reduce((n, g) => n + g.box.center[0], 0) / 12;
      const cy = blue.reduce((n, g) => n + g.box.center[1], 0) / 12;
      expect(cx).toBeCloseTo(REEF.x, 3);
      expect(cy).toBeCloseTo(REEF.y, 3);
    }
    expect(pack.field.goals.filter((g) => g.id.startsWith('red-reef-l1-'))).toHaveLength(6);
  });

  it('uses the Table 6-2 point values', () => {
    const rule = (id: string) => pack.scoring.find((s) => s.id === id)!.points;
    expect(rule('blue-coral-l1')).toEqual({ auto: 3, teleop: 2 });
    expect(rule('blue-coral-l2')).toEqual({ auto: 4, teleop: 3 });
    expect(rule('blue-coral-l3')).toEqual({ auto: 6, teleop: 4 });
    expect(rule('blue-coral-l4')).toEqual({ auto: 7, teleop: 5 });
    expect(rule('red-algae-processor')).toEqual({ auto: 6, teleop: 6 });
    expect(rule('red-algae-net')).toEqual({ auto: 4, teleop: 4 });
  });

  it('enforces the 2025 robot rules', () => {
    const entry = (spec: RobotSpec, preload = 0): RobotEntry => ({
      id: 'b1',
      alliance: 'blue',
      spec,
      start: { x: 7.8, y: 2, yaw: 0 },
      preload,
    });
    // R104: 120 in perimeter, 3 ft 6 in tall. 31 in square is 124 in around.
    const wide = robotSpec({ frame: { length: 0.7874, width: 0.7874, height: 0.9 } });
    expect(() => new Simulation({ pack, robots: [entry(wide)] })).toThrow(/maxFramePerimeter/);
    const tall = robotSpec({ frame: { length: 0.7, width: 0.7, height: 1.1 } });
    expect(() => new Simulation({ pack, robots: [entry(tall)] })).toThrow(/maxHeight/);
    const heavy = robotSpec({ mass: 53 });
    expect(() => new Simulation({ pack, robots: [entry(heavy)] })).toThrow(/maxMass/);
    const twoCoral = robotSpec({ intake: { reach: 0.25, width: 0.6, capacity: 2 } });
    expect(() => new Simulation({ pack, robots: [entry(twoCoral, 2)] })).toThrow(/limit is 1/);
  });
});

describe('REEFSCAPE in the engine', () => {
  it('keeps staged coral and algae in place, including algae resting on the reef', () => {
    const sim = new Simulation({ pack, robots: [] });
    const start = sim.snapshot().pieces.filter((p) => p.state === 'field');
    expect(start).toHaveLength(24);
    for (let i = 0; i < 5 * SIM_HZ; i++) sim.step();
    const end = sim.snapshot().pieces.filter((p) => p.state === 'field');
    expect(end).toHaveLength(24);
    for (const piece of end) {
      const before = start.find((p) => p.id === piece.id)!.position!;
      const moved = Math.hypot(
        piece.position!.x - before.x,
        piece.position!.y - before.y,
        piece.position!.z - before.z,
      );
      expect(moved).toBeLessThan(0.05);
    }
    expect(events(sim, 'pieceScored')).toHaveLength(0);
    sim.dispose();
  });

  it('scores a preloaded coral in the L1 trough during AUTO', () => {
    const spec = robotSpec();
    // Front bumper 5 cm from reef face 0; the coral drops onto the trough.
    const startX = FACE0_X - 0.05 - spec.frame.length / 2;
    const robot: RobotEntry = {
      id: 'b1',
      alliance: 'blue',
      spec,
      start: { x: startX, y: REEF.y, yaw: 0 },
      preload: 1,
    };
    const sim = new Simulation({ pack, robots: [robot] });
    sim.step({ b1: input({ release: true }) });
    for (let i = 0; i < 2 * SIM_HZ; i++) sim.step();
    const scored = events(sim, 'pieceScored');
    expect(scored).toHaveLength(1);
    expect(scored[0]).toMatchObject({ goal: 'blue-reef-l1-face0', points: 3, alliance: 'blue' });
    expect(sim.snapshot().score).toEqual({ red: 0, blue: 3 });
    sim.dispose();
  });

  it('scores a coral shot onto an L2 branch, and the branch then holds no more', () => {
    const target = goal('blue-reef-l2-face0-right');
    const [tx, ty, tz] = target.box.center;
    const pitch = (35 * Math.PI) / 180;
    const base = robotSpec();
    // Two robots aim at the same branch end from different spots.
    const shooter = (id: string, x: number, y: number): RobotEntry => {
      const yaw = Math.atan2(ty - y, tx - x);
      const distance = Math.hypot(tx - x, ty - y) - coralReleaseOffset(base);
      const speed = launchSpeed(distance, tz - base.release.height, pitch);
      return {
        id,
        alliance: 'blue',
        spec: { ...base, release: { height: base.release.height, speed, pitch } },
        start: { x, y, yaw },
        preload: 1,
      };
    };
    /** Shoots b1 then b2 and returns the scoring events on the target branch. */
    const twoShots = (p: GamePack) => {
      const sim = new Simulation({
        pack: p,
        robots: [shooter('b1', 2.6, ty), shooter('b2', 2.6, ty + 0.9)],
      });
      const onBranch = () =>
        events(sim, 'pieceScored').filter((e) => e.type === 'pieceScored' && e.goal === target.id);
      const shoot = (id: string) => {
        sim.step({ [id]: input({ release: true }) });
        for (let i = 0; i < 2 * SIM_HZ; i++) sim.step();
      };
      shoot('b1');
      const afterFirst = [...onBranch()];
      shoot('b2');
      const afterSecond = [...onBranch()];
      sim.dispose();
      return { afterFirst, afterSecond };
    };

    const { afterFirst, afterSecond } = twoShots(pack);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]).toMatchObject({ rule: 'blue-coral-l2', points: 4 });
    expect(afterSecond).toHaveLength(1);

    // Control: without the one-coral capacity, the second shot would also count.
    const unlimited: GamePack = {
      ...pack,
      field: {
        ...pack.field,
        goals: pack.field.goals.map((g) => ({ ...g, capacity: undefined })),
      },
    };
    expect(twoShots(unlimited).afterSecond).toHaveLength(2);
  });

  it('lets a human player feed coral through the coral station', () => {
    const sim = new Simulation({ pack, robots: [] });
    const feed = { 'blue-coral-station-right': { feed: true } };
    for (let i = 0; i < 3.5 * SIM_HZ; i++) sim.step({}, feed);
    expect(events(sim, 'pieceFed')).toHaveLength(3);
    for (let i = 0; i < 2 * SIM_HZ; i++) sim.step();
    const snap = sim.snapshot();
    expect(snap.stations.find((s) => s.id === 'blue-coral-station-right')!.supply).toBe(26);
    const fed = snap.pieces.filter((p) => p.type === 'coral' && p.state === 'field' && p.id >= 24);
    expect(fed).toHaveLength(3);
    // They land on the carpet in front of the blue right-corner station.
    for (const p of fed) {
      expect(p.position!.x).toBeGreaterThan(0.8);
      expect(p.position!.x).toBeLessThan(2.5);
      expect(p.position!.y).toBeLessThan(2);
      expect(p.position!.z).toBeLessThan(0.2);
    }
    sim.dispose();
  });
});
