import { z } from 'zod';
import { getMechanic, knownMechanicIds } from './mechanics';

/**
 * Game pack format, version 1.
 *
 * A game pack describes one season: field, game pieces, match timing, scoring,
 * and robot rules. All values use SI units (m, kg, s, rad) and WPILib field
 * coordinates: origin at the blue alliance wall corner, +x toward red, +y left
 * when standing behind the blue wall, +z up. See docs/PACK_FORMAT.md.
 */

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ids use lowercase letters, digits, and dashes');
const positive = z.number().positive();
const nonNegative = z.number().nonnegative();
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const size3 = z.tuple([positive, positive, positive]);

export const AllianceSchema = z.enum(['red', 'blue']);
export type Alliance = z.output<typeof AllianceSchema>;

/** Axis-aligned box. `size` is the full extent along x, y, and z. */
const BoxSchema = z.object({ center: vec3, size: size3 });
export type Box = z.output<typeof BoxSchema>;

const PieceShapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sphere'), radius: positive }),
  z.object({ kind: z.literal('box'), size: size3 }),
]);
export type PieceShape = z.output<typeof PieceShapeSchema>;

const PieceTypeSchema = z.object({
  id,
  name: z.string().min(1),
  shape: PieceShapeSchema,
  mass: positive,
  friction: nonNegative,
  restitution: z.number().min(0).max(1),
});

const ScoringRuleSchema = z.object({
  id,
  when: z.literal('pieceEntersGoal'),
  goals: z.array(id).min(1),
  /** Piece types this rule applies to. Omit to apply to every type. */
  pieceTypes: z.array(id).min(1).optional(),
  /** Points awarded, keyed by match period id. Missing periods award 0. */
  points: z.record(z.string(), z.number().int()),
});
export type ScoringRule = z.output<typeof ScoringRuleSchema>;

export const GamePackSchema = z
  .object({
    formatVersion: z.literal(1),
    id,
    name: z.string().min(1),
    season: z.number().int(),
    source: z.object({
      manualRevision: z.string().min(1),
      url: z.url().optional(),
    }),
    field: z.object({
      /** Field length (x) and width (y). */
      size: z.tuple([positive, positive]),
      wallHeight: positive,
      obstacles: z.array(z.object({ id, box: BoxSchema })).default([]),
      goals: z.array(z.object({ id, box: BoxSchema, creditAlliance: AllianceSchema })).min(1),
    }),
    pieceTypes: z.array(PieceTypeSchema).min(1),
    pieceSpawns: z.array(z.object({ type: id, position: vec3 })),
    match: z.object({
      periods: z.array(z.object({ id, durationSeconds: positive })).min(1),
    }),
    scoring: z.array(ScoringRuleSchema).min(1),
    robotRules: z.object({
      maxFramePerimeter: positive,
      maxHeight: positive,
      maxExtension: nonNegative,
      maxMass: positive,
    }),
    mechanics: z.array(id).default([]),
  })
  .superRefine((pack, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    const checkUnique = (ids: string[], path: (string | number)[], label: string) => {
      const seen = new Set<string>();
      ids.forEach((value, index) => {
        if (seen.has(value)) issue([...path, index, 'id'], `duplicate ${label} id "${value}"`);
        seen.add(value);
      });
    };

    checkUnique(
      pack.field.goals.map((g) => g.id),
      ['field', 'goals'],
      'goal',
    );
    checkUnique(
      pack.field.obstacles.map((o) => o.id),
      ['field', 'obstacles'],
      'obstacle',
    );
    checkUnique(
      pack.pieceTypes.map((p) => p.id),
      ['pieceTypes'],
      'piece type',
    );
    checkUnique(
      pack.match.periods.map((p) => p.id),
      ['match', 'periods'],
      'period',
    );
    checkUnique(
      pack.scoring.map((s) => s.id),
      ['scoring'],
      'scoring rule',
    );

    const goalIds = new Set(pack.field.goals.map((g) => g.id));
    const pieceIds = new Set(pack.pieceTypes.map((p) => p.id));
    const periodIds = new Set(pack.match.periods.map((p) => p.id));
    const [length, width] = pack.field.size;

    pack.pieceSpawns.forEach((spawn, i) => {
      if (!pieceIds.has(spawn.type)) {
        issue(['pieceSpawns', i, 'type'], `unknown piece type "${spawn.type}"`);
      }
      const [x, y, z] = spawn.position;
      if (x < 0 || x > length || y < 0 || y > width || z < 0) {
        issue(['pieceSpawns', i, 'position'], 'spawn position is outside the field');
      }
    });

    pack.scoring.forEach((rule, i) => {
      rule.goals.forEach((goal, j) => {
        if (!goalIds.has(goal)) issue(['scoring', i, 'goals', j], `unknown goal "${goal}"`);
      });
      rule.pieceTypes?.forEach((type, j) => {
        if (!pieceIds.has(type)) {
          issue(['scoring', i, 'pieceTypes', j], `unknown piece type "${type}"`);
        }
      });
      for (const period of Object.keys(rule.points)) {
        if (!periodIds.has(period)) {
          issue(['scoring', i, 'points', period], `unknown match period "${period}"`);
        }
      }
    });

    pack.mechanics.forEach((mechanic, i) => {
      if (!getMechanic(mechanic)) {
        const known = knownMechanicIds();
        issue(
          ['mechanics', i],
          `unknown mechanic "${mechanic}" (known: ${known.length ? known.join(', ') : 'none'})`,
        );
      }
    });
  });

export type GamePack = z.output<typeof GamePackSchema>;

export class GamePackError extends Error {
  override readonly name = 'GamePackError';
}

/**
 * Validates raw pack data (for example, parsed JSON) and returns a typed pack.
 * Throws GamePackError with a readable list of every problem found.
 */
export function loadGamePack(data: unknown): GamePack {
  const result = GamePackSchema.safeParse(data);
  if (!result.success) {
    throw new GamePackError(`Invalid game pack:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Points a scoring rule awards in a given match period. */
export function pointsFor(rule: ScoringRule, periodId: string): number {
  return rule.points[periodId] ?? 0;
}

/** True if a point lies inside an axis-aligned box. */
export function boxContains(box: Box, x: number, y: number, z: number): boolean {
  const [cx, cy, cz] = box.center;
  const [sx, sy, sz] = box.size;
  return Math.abs(x - cx) <= sx / 2 && Math.abs(y - cy) <= sy / 2 && Math.abs(z - cz) <= sz / 2;
}
