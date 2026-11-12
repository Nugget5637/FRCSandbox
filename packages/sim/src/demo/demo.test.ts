import { describe, expect, it } from 'vitest';
import { SIM_HZ } from '../constants';
import { createSimulation } from '../simulation';
import { createDemoController, DEMO_ROBOT, demoArena } from './demo';

describe('debug demo', () => {
  it('the scripted robot scores every ball in the demo arena', async () => {
    const sim = await createSimulation({ pack: demoArena(), robots: [DEMO_ROBOT] });
    const controller = createDemoController();
    const total = sim.pack.pieceSpawns.length;

    for (let i = 0; i < 90 * SIM_HZ && !sim.finished; i++) {
      sim.step({ [DEMO_ROBOT.id]: controller.next(sim.snapshot()) });
      if (sim.snapshot().pieces.every((p) => p.state === 'scored')) break;
    }

    const snap = sim.snapshot();
    expect(snap.pieces.filter((p) => p.state === 'scored')).toHaveLength(total);
    expect(snap.score.blue).toBeGreaterThanOrEqual(total * 2);
    sim.dispose();
  });
});
