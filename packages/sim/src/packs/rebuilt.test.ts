import { beforeAll, describe, expect, it } from 'vitest';
import rebuiltData from '../../../../game-packs/rebuilt-2026/pack.json';
import { SIM_HZ } from '../constants';
import { HUB_GRACE_TICKS, rebuiltHubShifts } from '../mechanics/rebuilt-hub-shifts';
import type { MechanicContext } from '../mechanics';
import { GRAVITY, initPhysics, Simulation, type RobotEntry } from '../simulation';
import { loadGamePack, type GamePack } from '../pack';
import type { RobotInput, RobotSpec } from '../robot';
import { SeededRandom } from '../rng';

const pack: GamePack = loadGamePack(rebuiltData);

beforeAll(async () => {
  await initPhysics();
});

/** A legal REBUILT robot: 27 in square (108 in perimeter), 20 in tall, 50 kg. */
function robotSpec(overrides: Partial<RobotSpec> = {}): RobotSpec {
  return {
    frame: { length: 0.6858, width: 0.6858, height: 0.5 },
    mass: 50,
    maxSpeed: 4.5,
    maxAcceleration: 6,
    maxTurnRate: 6,
    intake: { reach: 0.25, width: 0.6, capacity: 40 },
    release: { height: 0.5, speed: 6, pitch: (60 * Math.PI) / 180 },
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

const hub = pack.field.goals.find((g) => g.id === 'blue-hub')!;

describe('REBUILT pack data', () => {
  it('loads and validates', () => {
    expect(pack.id).toBe('rebuilt-2026');
    expect(pack.mechanics).toEqual(['rebuilt-hub-shifts']);
    expect(pack.match.periods.reduce((t, p) => t + p.durationSeconds, 0)).toBe(160);
  });

  it('matches the official field size and staging counts', () => {
    expect(pack.field.size).toEqual([16.541, 8.069]);
    expect(pack.pieceSpawnAreas.map((a) => [a.id, a.count])).toEqual([
      ['blue-depot', 24],
      ['red-depot', 24],
      ['neutral-zone', 360],
    ]);
    expect(pack.preload).toEqual({ type: 'fuel', maxPerRobot: 8 });
  });

  it('places the hubs where the official AprilTags put them', () => {
    // Blue hub tags 18-21 and 24-27 surround (4.626, 4.035) in the WPILib 2026 layout.
    expect(hub.box.center[0]).toBeCloseTo(4.626, 1);
    expect(hub.box.center[1]).toBeCloseTo(4.035, 2);
  });

  it('enforces the 2026 robot rules', () => {
    const tooBig: RobotEntry = {
      id: 'too-big',
      alliance: 'blue',
      spec: robotSpec({ frame: { length: 0.75, width: 0.75, height: 0.5 } }),
      start: { x: 2, y: 2, yaw: 0 },
    };
    expect(() => new Simulation({ pack, robots: [tooBig] })).toThrow(/maxFramePerimeter/);
    const overloaded = { ...tooBig, id: 'overloaded', spec: robotSpec(), preload: 9 };
    expect(() => new Simulation({ pack, robots: [overloaded] })).toThrow(/limit is 8/);
  });
});

describe('REBUILT hub shifts', () => {
  const hubs = Object.fromEntries(pack.field.goals.map((g) => [g.creditAlliance, g]));

  function contextFor(period: string, ticksIntoPeriod = 600, seed = 1): MechanicContext {
    const index = pack.match.periods.findIndex((p) => p.id === period);
    return {
      tick: 0,
      period,
      previousPeriod: pack.match.periods[index - 1]?.id ?? null,
      ticksIntoPeriod,
      random: new SeededRandom(seed),
    };
  }

  function activeTable(autoBlue: number, autoRed: number) {
    const shifts = rebuiltHubShifts.create(pack);
    const auto = contextFor('auto');
    for (let i = 0; i < autoBlue; i++)
      shifts.onPieceScored!(
        { goal: hubs.blue!, alliance: 'blue', pieceType: 'fuel', active: true },
        auto,
      );
    for (let i = 0; i < autoRed; i++)
      shifts.onPieceScored!(
        { goal: hubs.red!, alliance: 'red', pieceType: 'fuel', active: true },
        auto,
      );
    return pack.match.periods.map((p) => {
      const ctx = contextFor(p.id);
      return `${p.id}:${shifts.isGoalActive!(hubs.blue!, ctx) ? 'B' : '-'}${shifts.isGoalActive!(hubs.red!, ctx) ? 'R' : '-'}`;
    });
  }

  it('matches manual Table 6-3 when blue wins AUTO', () => {
    expect(activeTable(5, 2)).toEqual([
      'auto:BR',
      'transition:BR',
      'shift-1:-R',
      'shift-2:B-',
      'shift-3:-R',
      'shift-4:B-',
      'endgame:BR',
    ]);
  });

  it('matches manual Table 6-3 when red wins AUTO', () => {
    expect(activeTable(1, 4)).toEqual([
      'auto:BR',
      'transition:BR',
      'shift-1:B-',
      'shift-2:-R',
      'shift-3:B-',
      'shift-4:-R',
      'endgame:BR',
    ]);
  });

  it('keeps a hub counting for 3 seconds after it deactivates', () => {
    const shifts = rebuiltHubShifts.create(pack);
    shifts.onPieceScored!(
      { goal: hubs.blue!, alliance: 'blue', pieceType: 'fuel', active: true },
      contextFor('auto'),
    );
    // Blue won AUTO, so blue is inactive in SHIFT 1 but was active in TRANSITION.
    expect(shifts.isGoalActive!(hubs.blue!, contextFor('shift-1', HUB_GRACE_TICKS - 1))).toBe(true);
    expect(shifts.isGoalActive!(hubs.blue!, contextFor('shift-1', HUB_GRACE_TICKS))).toBe(false);
  });

  it('breaks an AUTO tie with the seeded random generator', () => {
    const pick = (seed: number) => {
      const shifts = rebuiltHubShifts.create(pack);
      return shifts.isGoalActive!(hubs.blue!, contextFor('shift-1', 600, seed))
        ? 'red-inactive'
        : 'blue-inactive';
    };
    expect(pick(1)).toBe(pick(1));
    const outcomes = new Set(Array.from({ length: 20 }, (_, seed) => pick(seed)));
    expect(outcomes).toEqual(new Set(['red-inactive', 'blue-inactive']));
  });
});

describe('REBUILT in the engine', () => {
  it('stages 408 fuel on the field plus preloads', () => {
    const robot: RobotEntry = {
      id: 'b1',
      alliance: 'blue',
      spec: robotSpec(),
      start: { x: 2, y: 2, yaw: 0 },
      preload: 8,
    };
    const sim = new Simulation({ pack, robots: [robot] });
    const snap = sim.snapshot();
    expect(snap.pieces.filter((p) => p.state === 'field')).toHaveLength(408);
    expect(snap.robots[0]!.storedPieces).toHaveLength(8);
    expect(snap.goals.map((g) => g.active)).toEqual([true, true]);
    sim.dispose();
  });

  it('scores preloaded fuel in AUTO and recycles it into the neutral zone', () => {
    // A steep 70-degree shot from 2 m back clears the 72 in rim and drops into the opening.
    const startX = 2.0;
    const base = robotSpec();
    const spec = { ...base, release: { ...base.release, pitch: (70 * Math.PI) / 180 } };
    const releaseX = startX + spec.frame.length / 2 + 0.095;
    const target = hub.box.center;
    const speed = launchSpeed(
      target[0] - releaseX,
      target[2] - spec.release.height,
      spec.release.pitch,
    );
    const robot: RobotEntry = {
      id: 'b1',
      alliance: 'blue',
      spec: { ...spec, release: { ...spec.release, speed } },
      start: { x: startX, y: target[1], yaw: 0 },
      preload: 8,
    };
    const sim = new Simulation({ pack, robots: [robot] });

    for (let i = 0; i < 6 * SIM_HZ; i++) {
      sim.step({ b1: input({ release: i % 20 === 0 }) });
    }

    const scored = sim.getEvents().filter((e) => e.type === 'pieceScored');
    expect(scored).toHaveLength(8);
    expect(scored.every((e) => e.type === 'pieceScored' && e.active && e.points === 1)).toBe(true);
    expect(sim.snapshot().score).toEqual({ red: 0, blue: 8 });

    // Every scored fuel came back out of the hub on the neutral-zone side.
    const snap = sim.snapshot();
    const returned = snap.pieces.filter((p) =>
      scored.some((e) => e.type === 'pieceScored' && e.pieceId === p.id),
    );
    expect(returned.every((p) => p.state === 'field' && p.position!.x > hub.box.center[0])).toBe(
      true,
    );
    sim.dispose();
  });

  it('lets a robot drive over a bump', () => {
    const bump = pack.field.obstacles.find((o) => o.id === 'blue-bump-left')!.shape;
    const robot: RobotEntry = {
      id: 'b1',
      alliance: 'blue',
      spec: robotSpec(),
      start: { x: 3.4, y: bump.center[1], yaw: 0 },
    };
    const sim = new Simulation({ pack, robots: [robot] });
    let maxZ = 0;
    for (let i = 0; i < 3 * SIM_HZ; i++) {
      sim.step({ b1: input({ drive: { x: 0.6, y: 0 } }) });
      maxZ = Math.max(maxZ, sim.snapshot().robots[0]!.pose.z);
    }
    const pose = sim.snapshot().robots[0]!.pose;
    expect(pose.x).toBeGreaterThan(bump.center[0] + bump.size[0]);
    expect(maxZ).toBeGreaterThan(0.25 + 0.1); // it rose up the ramp
    expect(pose.z).toBeCloseTo(0.25, 1); // and came back down
    sim.dispose();
  });

  it('lets short robots through the trench and blocks tall ones', () => {
    const arm = pack.field.obstacles.find((o) => o.id === 'blue-trench-arm-left')!.shape;
    const finalX = (height: number) => {
      const robot: RobotEntry = {
        id: 'b1',
        alliance: 'blue',
        spec: robotSpec({ frame: { length: 0.6858, width: 0.6858, height } }),
        start: { x: 3.4, y: arm.center[1], yaw: 0 },
      };
      const sim = new Simulation({ pack, robots: [robot] });
      for (let i = 0; i < 2 * SIM_HZ; i++) sim.step({ b1: input({ drive: { x: 0.6, y: 0 } }) });
      const x = sim.snapshot().robots[0]!.pose.x;
      sim.dispose();
      return x;
    };
    expect(finalX(0.5)).toBeGreaterThan(arm.center[0] + 0.5); // 0.5 m fits under 0.565 m
    expect(finalX(0.7)).toBeLessThan(arm.center[0]); // 0.7 m is legal but too tall
  });
});

describe('REBUILT Milestone 5 additions', () => {
  const net = pack.field.obstacles.find((o) => o.id === 'blue-hub-net')!;

  /** Fires one preloaded fuel flat at net height and returns the lowest x it reached. */
  function flatShot(startX: number, yaw: number): number {
    const robot: RobotEntry = {
      id: 'b1',
      alliance: 'blue',
      spec: robotSpec({ release: { height: 2.4, speed: 7, pitch: 0 } }),
      start: { x: startX, y: hub.box.center[1], yaw },
      preload: 1,
    };
    const sim = new Simulation({ pack, robots: [robot] });
    sim.step({ b1: input({ release: true }) });
    const id = sim
      .snapshot()
      .pieces.find((p) => p.heldBy === null && p.state === 'field' && p.position!.z > 2)!.id;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < SIM_HZ; i++) {
      sim.step();
      const p = sim.snapshot().pieces[id]!;
      if (p.position) {
        minX = Math.min(minX, p.position.x);
        maxX = Math.max(maxX, p.position.x);
      }
    }
    sim.dispose();
    return yaw === 0 ? maxX : minX;
  }

  it('has a one-sided net behind each hub that stops shots from the neutral zone', () => {
    expect(net.oneSided).toEqual({ normal: [1, 0, 0] });
    expect(pack.field.obstacles.find((o) => o.id === 'red-hub-net')!.oneSided).toEqual({
      normal: [-1, 0, 0],
    });
    // From the neutral zone, shooting back toward the blue hub: stopped at the net.
    expect(flatShot(7.5, Math.PI)).toBeGreaterThan(net.shape.center[0]);
    // From the alliance side the same shot passes the net plane.
    expect(flatShot(2.5, 0)).toBeGreaterThan(net.shape.center[0] + 0.5);
  });

  it('has angled funnel panels inside both hub openings', () => {
    const panels = pack.field.obstacles.filter((o) => o.id.includes('hub-panel'));
    expect(panels).toHaveLength(8);
    expect(panels.every((o) => o.shape.rotation !== undefined)).toBe(true);
  });

  it('gives each outpost 24 fuel that the human player feeds onto the field', () => {
    expect(pack.humanPlayerStations.map((s) => [s.id, s.supply])).toEqual([
      ['blue-outpost', 24],
      ['red-outpost', 24],
    ]);
    const sim = new Simulation({ pack, robots: [] });
    for (let i = 0; i <= SIM_HZ; i++) sim.step({}, { 'blue-outpost': { feed: true } });
    const fed = sim.getEvents().filter((e) => e.type === 'pieceFed');
    expect(fed).toHaveLength(4); // one every 0.25 s, the fourth at 1.0 s
    for (let i = 0; i < SIM_HZ; i++) sim.step();
    const snap = sim.snapshot();
    expect(snap.stations[0]).toMatchObject({ id: 'blue-outpost', supply: 20 });
    for (const e of fed) {
      const p = snap.pieces[e.type === 'pieceFed' ? e.pieceId : 0]!;
      expect(p.state).toBe('field');
      expect(p.position!.x).toBeLessThan(3);
      expect(p.position!.y).toBeLessThan(1.5);
    }
    sim.dispose();
  });

  it('puts fuel that leaves the field back near its exit point after 3 seconds', () => {
    expect(pack.field.outOfBounds).toEqual({ mode: 'exitPoint', delaySeconds: 3, zones: [] });
    const robot: RobotEntry = {
      id: 'b1',
      alliance: 'blue',
      spec: robotSpec({ release: { height: 0.6, speed: 6, pitch: 0.7 } }),
      start: { x: 1.5, y: 6.5, yaw: Math.PI / 2 },
      preload: 1,
    };
    const sim = new Simulation({ pack, robots: [robot] });
    sim.step({ b1: input({ release: true }) });
    for (let i = 0; i < 5 * SIM_HZ; i++) sim.step();
    const left = sim.getEvents().find((e) => e.type === 'pieceLeftField');
    const back = sim.getEvents().find((e) => e.type === 'pieceReturned');
    expect(left).toBeDefined();
    expect(back!.tick - left!.tick).toBe(3 * SIM_HZ);
    const piece = sim.snapshot().pieces[left!.type === 'pieceLeftField' ? left!.pieceId : 0]!;
    expect(piece.state).toBe('field');
    expect(piece.position!.y).toBeGreaterThan(pack.field.size[1] - 0.3);
    expect(piece.position!.x).toBeCloseTo(1.5, 0);
    sim.dispose();
  });
});
