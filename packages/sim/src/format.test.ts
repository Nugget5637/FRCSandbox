import { beforeAll, describe, expect, it } from 'vitest';
import { SIM_HZ } from './constants';
import { boxContains, loadGamePack, rotateVector, rotationToQuaternion } from './pack';
import { initPhysics, Simulation, type RobotEntry } from './simulation';
import { input, rawTestArena, TEST_ROBOT_SPEC, testRobot } from './testing/fixtures';

/**
 * Milestone 5 format features on the small test arena: rotated boxes, goal
 * capacity, cylinder pieces, one-sided obstacles, out-of-bounds re-entry, and
 * human player stations.
 */

beforeAll(async () => {
  await initPhysics();
});

type Raw = ReturnType<typeof rawTestArena> & {
  field: Record<string, unknown> & { obstacles: unknown[]; goals: Record<string, unknown>[] };
  pieceTypes: unknown[];
  pieceSpawns: unknown[];
};

function arena(edit: (raw: Raw) => void) {
  const raw = rawTestArena() as Raw;
  edit(raw);
  return loadGamePack(raw);
}

const CORAL = {
  id: 'coral',
  name: 'Tube',
  shape: { kind: 'cylinder', radius: 0.057, length: 0.3 },
  mass: 0.65,
  friction: 0.35,
  restitution: 0.25,
};

/** A robot that throws its stored pieces with the given release settings. */
function thrower(release: RobotEntry['spec']['release'], start: RobotEntry['start']): RobotEntry {
  return testRobot({ spec: { ...TEST_ROBOT_SPEC, release }, start, preload: 1 });
}

function run(sim: Simulation, seconds: number, inputs = {}, humanPlayers = {}) {
  for (let i = 0; i < seconds * SIM_HZ; i++) sim.step(inputs, humanPlayers);
}

describe('rotations', () => {
  it('follows the WPILib Rotation3d convention', () => {
    // Pitch -35 degrees tips +x upward, as for a REEFSCAPE branch.
    const up = rotateVector(rotationToQuaternion([0, (-35 * Math.PI) / 180, 0]), [1, 0, 0]);
    expect(up[0]).toBeCloseTo(Math.cos((35 * Math.PI) / 180));
    expect(up[2]).toBeCloseTo(Math.sin((35 * Math.PI) / 180));
    // Yaw is applied last, about the field z axis.
    const turned = rotateVector(rotationToQuaternion([0, -Math.PI / 2, Math.PI / 2]), [0, 0, 1]);
    expect(turned.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, -1, 0]);
  });

  it('checks containment in a rotated goal box', () => {
    const box = {
      center: [0, 0, 0] as [number, number, number],
      size: [2, 0.2, 0.2] as [number, number, number],
    };
    const rotated = { ...box, rotation: [0, 0, Math.PI / 2] as [number, number, number] };
    expect(boxContains(box, 0.9, 0, 0)).toBe(true);
    expect(boxContains(rotated, 0.9, 0, 0)).toBe(false);
    expect(boxContains(rotated, 0, 0.9, 0)).toBe(true);
  });

  it('rotates obstacles in the physics world', () => {
    // A wall turned 90 degrees now spans y instead of x and stops the robot.
    const pack = arena((raw) => {
      raw.field.obstacles.push({
        id: 'wall',
        shape: {
          kind: 'box',
          center: [3, 2.5, 0.5],
          size: [3, 0.1, 1],
          rotation: [0, 0, Math.PI / 2],
        },
      });
    });
    const sim = new Simulation({ pack, robots: [testRobot()] });
    run(sim, 2, { 'blue-1': input({ drive: { x: 1, y: 0 } }) });
    expect(sim.snapshot().robots[0]!.pose.x).toBeLessThan(3 - 0.4 + 0.02);
    sim.dispose();
  });
});

describe('goal capacity', () => {
  it('stops scoring once a goal is full', () => {
    const pack = arena((raw) => {
      raw.field.goals[0]!.capacity = 1;
      raw.pieceSpawns = [
        { type: 'ball', position: [6.1, 2.5, 0.3] },
        { type: 'ball', position: [6.1, 2.2, 0.3] },
      ];
    });
    const sim = new Simulation({ pack, robots: [] });
    run(sim, 0.2);
    const scored = sim.getEvents().filter((e) => e.type === 'pieceScored');
    expect(scored).toHaveLength(1);
    expect(sim.snapshot().pieces.filter((p) => p.state === 'field')).toHaveLength(1);
    sim.dispose();
  });
});

describe('cylinder pieces', () => {
  it('stands upright by default and lies down when rotated', () => {
    const pack = arena((raw) => {
      raw.pieceTypes.push(CORAL);
      raw.pieceSpawns = [
        { type: 'coral', position: [2, 1, 0.152] },
        { type: 'coral', position: [2, 3, 0.058], rotation: [0, Math.PI / 2, 0] },
      ];
    });
    const sim = new Simulation({ pack, robots: [] });
    run(sim, 2);
    const [upright, lying] = sim.snapshot().pieces;
    expect(upright!.position!.z).toBeCloseTo(0.15, 2);
    expect(lying!.position!.z).toBeCloseTo(0.057, 2);
    sim.dispose();
  });

  it('rolls on its side and slows on carpet', () => {
    const pack = arena((raw) => {
      raw.pieceTypes.push(CORAL);
      raw.pieceSpawns = [];
    });
    // Released pieces point along the launch direction; turn it sideways by
    // driving the robot along y so the tube rolls across the field.
    const robot = thrower({ height: 0.1, speed: 2, pitch: 0 }, { x: 2, y: 1, yaw: Math.PI / 2 });
    const sim = new Simulation({
      pack: { ...pack, preload: { type: 'coral', maxPerRobot: 1 } },
      robots: [robot],
    });
    sim.step({ 'blue-1': input({ release: true }) });
    run(sim, 6);
    const tube = sim.snapshot().pieces[0]!;
    expect(tube.state).toBe('field');
    expect(tube.position!.y).toBeGreaterThan(1.8);
    expect(tube.position!.y).toBeLessThan(5);
    sim.dispose();
  });
});

describe('one-sided obstacles', () => {
  const pack = arena((raw) => {
    raw.pieceSpawns = [];
    raw.field.obstacles.push({
      id: 'net',
      shape: { kind: 'box', center: [5, 2.5, 1.5], size: [0.02, 3, 2] },
      oneSided: { normal: [1, 0, 0] },
    });
  });

  function shotFinalX(startX: number, yaw: number): number {
    const robot = thrower({ height: 1.3, speed: 6, pitch: 0.2 }, { x: startX, y: 2.5, yaw });
    const sim = new Simulation({
      pack: { ...pack, preload: { type: 'ball', maxPerRobot: 1 } },
      robots: [robot],
    });
    let x = 0;
    sim.step({ 'blue-1': input({ release: true }) });
    for (let i = 0; i < 0.6 * SIM_HZ; i++) {
      sim.step();
      x = sim.snapshot().pieces.find((p) => p.state === 'field')?.position?.x ?? x;
    }
    sim.dispose();
    return x;
  }

  it('blocks pieces coming from the side its normal faces', () => {
    expect(shotFinalX(8, Math.PI)).toBeGreaterThan(5);
  });

  it('lets pieces from the other side through', () => {
    expect(shotFinalX(2, 0)).toBeGreaterThan(5.5);
  });
});

describe('out-of-bounds re-entry', () => {
  /** Throws the preloaded ball over the y = 0 wall and reports where it comes back. */
  function overTheWall(rule: Record<string, unknown> | undefined) {
    const pack = arena((raw) => {
      raw.pieceSpawns = [];
      if (rule) raw.field.outOfBounds = rule;
    });
    const robot = thrower({ height: 0.8, speed: 4, pitch: 0.6 }, { x: 3, y: 1, yaw: -Math.PI / 2 });
    const sim = new Simulation({
      pack: { ...pack, preload: { type: 'ball', maxPerRobot: 1 } },
      robots: [robot],
    });
    sim.step({ 'blue-1': input({ release: true }) });
    let left = -1;
    let returned = -1;
    for (let i = 0; i < 6 * SIM_HZ; i++) {
      sim.step();
      for (const e of sim.getEvents()) {
        if (e.type === 'pieceLeftField' && left < 0) left = e.tick;
        if (e.type === 'pieceReturned' && returned < 0) returned = e.tick;
      }
      if (returned >= 0) break;
    }
    const piece = sim.snapshot().pieces[0]!;
    sim.dispose();
    return { left, returned, piece };
  }

  it('defaults to the nearest edge after 2 seconds', () => {
    const { left, returned, piece } = overTheWall(undefined);
    expect(left).toBeGreaterThan(0);
    expect(returned - left).toBe(2 * SIM_HZ);
    expect(piece.state).toBe('field');
    expect(piece.position!.y).toBeCloseTo(0.075 + 0.05, 1);
    expect(piece.position!.x).toBeCloseTo(3, 0);
  });

  it('can return pieces to a fixed zone', () => {
    const { piece } = overTheWall({
      mode: 'zone',
      delaySeconds: 1,
      zones: [{ id: 'return', box: { center: [9, 4, 0.1], size: [0.2, 0.2, 0.2] } }],
    });
    expect(piece.position!.x).toBeCloseTo(9, 0);
    expect(piece.position!.y).toBeCloseTo(4, 0);
  });

  it('can return pieces at the exit point', () => {
    const { piece } = overTheWall({ mode: 'exitPoint', delaySeconds: 0.5 });
    expect(piece.position!.y).toBeLessThan(0.2);
    expect(piece.position!.x).toBeCloseTo(3, 0);
  });

  it('rejects a zone rule without zones', () => {
    expect(() =>
      arena((raw) => {
        raw.field.outOfBounds = { mode: 'zone' };
      }),
    ).toThrow(/re-entry zone/);
  });
});

describe('human player stations', () => {
  const pack = arena((raw) => {
    raw.pieceSpawns = [];
    raw.humanPlayerStations = [
      {
        id: 'blue-station',
        alliance: 'blue',
        pieceType: 'ball',
        supply: 3,
        feedSeconds: 0.5,
        exit: { box: { center: [0.2, 4.5, 0.6], size: [0.02, 0.2, 0.02] }, velocity: [1, 0, 0] },
      },
    ];
  });

  it('feeds one piece per feed time while held, until the supply runs out', () => {
    const sim = new Simulation({ pack, robots: [] });
    expect(sim.snapshot().stations).toEqual([
      { id: 'blue-station', alliance: 'blue', supply: 3, feeding: false },
    ]);
    const feed = { 'blue-station': { feed: true } };
    run(sim, 0.5 - 2 / SIM_HZ, {}, feed);
    expect(sim.getEvents().filter((e) => e.type === 'pieceFed')).toHaveLength(0);
    run(sim, 3 / SIM_HZ, {}, feed);
    expect(sim.getEvents().filter((e) => e.type === 'pieceFed')).toHaveLength(1);
    run(sim, 3, {}, feed);
    const fed = sim.getEvents().filter((e) => e.type === 'pieceFed');
    expect(fed).toHaveLength(3);
    const snap = sim.snapshot();
    expect(snap.stations[0]!.supply).toBe(0);
    expect(snap.pieces.every((p) => p.state === 'field' && p.position!.x > 0.2)).toBe(true);
    sim.dispose();
  });

  it('does nothing without input', () => {
    const sim = new Simulation({ pack, robots: [] });
    run(sim, 2);
    expect(sim.snapshot().pieces.every((p) => p.state === 'station')).toBe(true);
    sim.dispose();
  });

  it('rejects a station for an unknown piece type', () => {
    expect(() =>
      arena((raw) => {
        raw.humanPlayerStations = [
          {
            id: 's',
            alliance: 'red',
            pieceType: 'nope',
            supply: 1,
            feedSeconds: 1,
            exit: { box: { center: [1, 1, 1], size: [0.1, 0.1, 0.1] }, velocity: [0, 0, 0] },
          },
        ];
      }),
    ).toThrow(/unknown piece type "nope"/);
  });
});
