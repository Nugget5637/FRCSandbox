import { describe, expect, it } from 'vitest';
import { boxContains, GamePackError, loadGamePack, pointsFor } from './pack';
import { checkRobotRules } from './robot';
import { rawTestArena, TEST_ROBOT_SPEC, testArena } from './testing/fixtures';

type Raw = ReturnType<typeof rawTestArena> & Record<string, any>;

function expectInvalid(mutate: (pack: Raw) => void, message: RegExp) {
  const raw = rawTestArena() as Raw;
  mutate(raw);
  expect(() => loadGamePack(raw)).toThrow(GamePackError);
  expect(() => loadGamePack(raw)).toThrow(message);
}

describe('loadGamePack', () => {
  it('accepts the test arena and fills defaults', () => {
    const pack = testArena();
    expect(pack.id).toBe('test-arena');
    expect(pack.field.goals).toHaveLength(1);
    expect(pack.mechanics).toEqual([]);
  });

  it('rejects an unsupported format version', () => {
    expectInvalid((p) => (p.formatVersion = 2), /formatVersion/);
  });

  it('rejects negative sizes', () => {
    expectInvalid((p) => (p.field.size = [-1, 5]), /field\.size/);
  });

  it('rejects duplicate ids', () => {
    expectInvalid(
      (p) => p.match.periods.push({ id: 'auto', durationSeconds: 5 }),
      /duplicate period id "auto"/,
    );
  });

  it('rejects scoring rules that reference unknown goals', () => {
    expectInvalid((p) => (p.scoring[0].goals = ['missing-goal']), /unknown goal "missing-goal"/);
  });

  it('rejects points for unknown match periods', () => {
    expectInvalid((p) => (p.scoring[0].points.endgame = 3), /unknown match period "endgame"/);
  });

  it('rejects spawns outside the field', () => {
    expectInvalid((p) => (p.pieceSpawns[0].position = [20, 2, 0.1]), /outside the field/);
  });

  it('rejects mechanics the engine does not implement', () => {
    expectInvalid((p) => (p.mechanics = ['hub-shifts']), /unknown mechanic "hub-shifts"/);
  });
});

describe('scoring helpers', () => {
  it('awards period-specific points and 0 for unlisted periods', () => {
    const rule = testArena().scoring[0]!;
    expect(pointsFor(rule, 'auto')).toBe(4);
    expect(pointsFor(rule, 'teleop')).toBe(2);
    expect(pointsFor(rule, 'other')).toBe(0);
  });

  it('tests containment in a box', () => {
    const box = {
      center: [0, 0, 0] as [number, number, number],
      size: [2, 2, 2] as [number, number, number],
    };
    expect(boxContains(box, 0.9, -0.9, 1)).toBe(true);
    expect(boxContains(box, 1.1, 0, 0)).toBe(false);
  });
});

describe('checkRobotRules', () => {
  const rules = testArena().robotRules;

  it('passes a legal robot', () => {
    expect(checkRobotRules(TEST_ROBOT_SPEC, rules)).toEqual([]);
  });

  it('reports every broken rule', () => {
    const spec = {
      ...TEST_ROBOT_SPEC,
      frame: { length: 1.2, width: 1, height: 1.5 },
      mass: 80,
    };
    expect(checkRobotRules(spec, rules).map((v) => v.rule)).toEqual([
      'maxFramePerimeter',
      'maxHeight',
      'maxMass',
    ]);
  });
});
