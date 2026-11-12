import { beforeAll, describe, expect, it } from 'vitest';
import { SIM_HZ } from './constants';
import { createSimulation, initPhysics, Simulation } from './simulation';
import { SeededRandom } from './rng';
import { driveToward, input, TEST_ROBOT_SPEC, testArena, testRobot } from './testing/fixtures';

beforeAll(async () => {
  await initPhysics();
});

/**
 * Scripted robot: drive to the ball with the intake on, drive to a release
 * point in front of the goal, release once, then wait for the score.
 * Returns the simulation after scoring (or after the step budget runs out).
 */
function runScoringScript(sim: Simulation, startDelayTicks = 0): Simulation {
  for (let i = 0; i < startDelayTicks; i++) sim.step();

  let phase: 'collect' | 'approach' | 'release' | 'wait' = 'collect';
  for (let i = 0; i < 20 * SIM_HZ && !sim.finished; i++) {
    const snap = sim.snapshot();
    const robot = snap.robots[0]!;
    if (phase === 'collect') {
      // Stop with the ball inside the intake area (front edge 0.4 m ahead of center).
      const { drive } = driveToward(snap, robot.id, 2.4, 2.5);
      sim.step({
        [robot.id]: input({ drive: { x: Math.max(drive.x, 0.4), y: drive.y }, intake: true }),
      });
      if (sim.snapshot().robots[0]!.storedPieces.length === 1) phase = 'approach';
    } else if (phase === 'approach') {
      const { drive, distance } = driveToward(snap, robot.id, 4.9, 2.5);
      const speed = Math.hypot(robot.velocity.x, robot.velocity.y);
      sim.step({ [robot.id]: input({ drive }) });
      if (distance < 0.05 && speed < 0.1) phase = 'release';
    } else if (phase === 'release') {
      sim.step({ [robot.id]: input({ release: true }) });
      phase = 'wait';
    } else {
      sim.step();
      if (sim.snapshot().score.blue > 0) break;
    }
  }
  return sim;
}

describe('Simulation', () => {
  it('starts in the first period with pieces on the field', async () => {
    const sim = await createSimulation({ pack: testArena(), robots: [testRobot()] });
    const snap = sim.snapshot();
    expect(snap.period).toBe('auto');
    expect(snap.score).toEqual({ red: 0, blue: 0 });
    expect(snap.pieces).toEqual([
      expect.objectContaining({ id: 0, type: 'ball', state: 'field', heldBy: null }),
    ]);
    expect(snap.robots[0]!.pose.z).toBeCloseTo(0.25, 2);
    sim.dispose();
  });

  it('keeps an idle ball resting on the floor under 3D gravity', async () => {
    const sim = await createSimulation({ pack: testArena(), robots: [] });
    for (let i = 0; i < SIM_HZ; i++) sim.step();
    const ball = sim.snapshot().pieces[0]!;
    expect(ball.position!.z).toBeCloseTo(0.075, 2);
    expect(ball.position!.x).toBeCloseTo(3, 2);
    sim.dispose();
  });

  it('respects the acceleration limit', async () => {
    const sim = await createSimulation({ pack: testArena(), robots: [testRobot()] });
    sim.step({ 'blue-1': input({ drive: { x: 1, y: 0 } }) });
    const speed = sim.snapshot().robots[0]!.velocity.x;
    expect(speed).toBeGreaterThan(0);
    // Rapier stores velocities as 32-bit floats, so allow a tiny rounding margin.
    expect(speed).toBeLessThanOrEqual(TEST_ROBOT_SPEC.maxAcceleration / SIM_HZ + 1e-5);
    sim.dispose();
  });

  it('scores autonomous points for a scripted robot', async () => {
    const sim = runScoringScript(
      await createSimulation({ pack: testArena(), robots: [testRobot()] }),
    );
    const snap = sim.snapshot();
    expect(snap.score).toEqual({ red: 0, blue: 4 });
    expect(snap.pieces[0]!.state).toBe('scored');
    expect(snap.time).toBeLessThan(15);
    expect(sim.getEvents().map((e) => e.type)).toEqual([
      'periodStarted',
      'pieceAcquired',
      'pieceReleased',
      'pieceScored',
    ]);
    sim.dispose();
  });

  it('scores teleop points after autonomous ends', async () => {
    const pack = testArena();
    const sim = runScoringScript(
      await createSimulation({ pack, robots: [testRobot()] }),
      15 * SIM_HZ,
    );
    expect(sim.snapshot().period).toBe('teleop');
    expect(sim.snapshot().score).toEqual({ red: 0, blue: 2 });
    sim.dispose();
  });

  it('replays identically from the same seed and inputs', async () => {
    const runs = await Promise.all(
      [1, 2].map(async () => {
        const sim = runScoringScript(
          await createSimulation({ pack: testArena(), robots: [testRobot()], seed: 42 }),
        );
        for (let i = 0; i < SIM_HZ; i++) sim.step();
        const result = JSON.stringify({
          snap: sim.snapshot(),
          events: sim.getEvents(),
          r: sim.random.next(),
        });
        sim.dispose();
        return result;
      }),
    );
    expect(runs[0]).toBe(runs[1]);
  });

  it('ends the match after the last period', async () => {
    const sim = await createSimulation({ pack: testArena(), robots: [] });
    for (let i = 0; i < 150 * SIM_HZ + 10; i++) sim.step();
    expect(sim.finished).toBe(true);
    expect(sim.snapshot().period).toBeNull();
    expect(sim.getEvents().at(-1)).toEqual({ tick: 150 * SIM_HZ, type: 'matchEnded' });
    sim.dispose();
  });

  it('rejects robots that break the pack rules', async () => {
    const oversized = testRobot({
      spec: { ...TEST_ROBOT_SPEC, frame: { length: 1.5, width: 1, height: 0.5 } },
    });
    await expect(createSimulation({ pack: testArena(), robots: [oversized] })).rejects.toThrow(
      /breaks robot rules: maxFramePerimeter/,
    );
  });

  it('rejects duplicate robot ids', async () => {
    await expect(
      createSimulation({ pack: testArena(), robots: [testRobot(), testRobot()] }),
    ).rejects.toThrow(/duplicate robot id/);
  });
});

describe('SeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new SeededRandom(7);
    const b = new SeededRandom(7);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });

  it('stays in range', () => {
    const rng = new SeededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
