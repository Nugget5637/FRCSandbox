import { z } from 'zod';
import { getMechanic, knownMechanicIds } from './mechanics';

/**
 * Game pack format, version 1 (pre-release draft; may change until the first
 * public release).
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

/**
 * Surface material. When two surfaces touch, the engine combines their values
 * with the geometric mean: friction = sqrt(a.friction * b.friction), and the
 * same for restitution. A piece therefore interacts correctly with carpet,
 * structures, robots, and other pieces from its own values alone.
 */
const SurfaceSchema = z.object({
  friction: nonNegative,
  restitution: z.number().min(0).max(1),
});
export type Surface = z.output<typeof SurfaceSchema>;

/**
 * Carpet adds rolling resistance: the deceleration of a round piece rolling on
 * it, as a fraction of gravity (stopping distance = v^2 / (2 * c * g)).
 */
const CarpetSchema = SurfaceSchema.extend({ rollingResistance: nonNegative });
export type Carpet = z.output<typeof CarpetSchema>;

/**
 * Standard FRC field carpet (Shaw Philadelphia Commercial Neyland II 20, low
 * pile, used 2024-2027). FIRST publishes no friction measurements, so these
 * are estimates; see docs/PACK_FORMAT.md for how to measure them.
 */
export const FRC_CARPET: Carpet = { friction: 0.8, restitution: 0.4, rollingResistance: 0.08 };

/** Default for walls and field structures (polycarbonate, aluminum, steel). */
export const DEFAULT_STRUCTURE_SURFACE: Surface = { friction: 0.4, restitution: 0.5 };

export const AllianceSchema = z.enum(['red', 'blue']);
export type Alliance = z.output<typeof AllianceSchema>;

/** Axis-aligned box. `size` is the full extent along x, y, and z. */
const BoxSchema = z.object({ center: vec3, size: size3 });
export type Box = z.output<typeof BoxSchema>;

/**
 * Solid field geometry.
 * - box: an axis-aligned solid box.
 * - ridge: a triangular prism filling the bounding box, with its peak line
 *   running along `ridgeAxis` at the top center. Used for bumps and ramps.
 */
const ObstacleShapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('box'), center: vec3, size: size3 }),
  z.object({
    kind: z.literal('ridge'),
    center: vec3,
    size: size3,
    ridgeAxis: z.enum(['x', 'y']),
  }),
]);
export type ObstacleShape = z.output<typeof ObstacleShapeSchema>;

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
  /** The piece's own surface. Combined with whatever it touches. */
  friction: nonNegative,
  restitution: z.number().min(0).max(1),
  /**
   * Optional measured rolling resistance for this piece on the field carpet.
   * Omit it to use the carpet's value, which applies to every round piece.
   */
  rollingResistance: nonNegative.optional(),
});

const GoalSchema = z.object({
  id,
  box: BoxSchema,
  creditAlliance: AllianceSchema,
  /**
   * If set, scored pieces come back onto the field after a delay instead of
   * leaving the match. They appear at a random point in `exit.box` moving at
   * `exit.velocity`.
   */
  recycle: z
    .object({
      delaySeconds: nonNegative,
      exit: z.object({ box: BoxSchema, velocity: vec3 }),
    })
    .optional(),
});
export type Goal = z.output<typeof GoalSchema>;

const ZoneSchema = z.object({
  id,
  kind: z.enum(['allianceZone', 'neutralZone', 'other']),
  alliance: AllianceSchema.optional(),
  box: BoxSchema,
});
export type Zone = z.output<typeof ZoneSchema>;

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
      /** Floor material. Defaults to standard FRC carpet. */
      carpet: CarpetSchema.default(FRC_CARPET),
      /** Material of the perimeter walls. */
      wallSurface: SurfaceSchema.default(DEFAULT_STRUCTURE_SURFACE),
      obstacles: z
        .array(
          z.object({
            id,
            shape: ObstacleShapeSchema,
            /** Defaults to DEFAULT_STRUCTURE_SURFACE. */
            surface: SurfaceSchema.optional(),
          }),
        )
        .default([]),
      goals: z.array(GoalSchema).min(1),
      /** Named areas used for display and future rules. They have no physics. */
      zones: z.array(ZoneSchema).default([]),
    }),
    pieceTypes: z.array(PieceTypeSchema).min(1),
    /** Individually placed pieces. */
    pieceSpawns: z.array(z.object({ type: id, position: vec3 })).default([]),
    /** Pieces arranged in a grid inside a box, filling layers from the bottom. */
    pieceSpawnAreas: z
      .array(
        z.object({
          id,
          type: id,
          box: BoxSchema,
          count: z.number().int().positive(),
          /** Random offset applied to each position, in meters. */
          jitter: nonNegative.default(0),
        }),
      )
      .default([]),
    /** Pieces a robot may hold at the start of the match. */
    preload: z.object({ type: id, maxPerRobot: z.number().int().nonnegative() }).optional(),
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
      pack.field.zones.map((z) => z.id),
      ['field', 'zones'],
      'zone',
    );
    checkUnique(
      pack.pieceTypes.map((p) => p.id),
      ['pieceTypes'],
      'piece type',
    );
    checkUnique(
      pack.pieceSpawnAreas.map((a) => a.id),
      ['pieceSpawnAreas'],
      'spawn area',
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
    const insideField = ([x, y, z]: readonly number[]) =>
      x! >= 0 && x! <= length && y! >= 0 && y! <= width && z! >= 0;
    const knownPiece = (type: string, path: (string | number)[]) => {
      if (!pieceIds.has(type)) issue(path, `unknown piece type "${type}"`);
    };

    pack.pieceSpawns.forEach((spawn, i) => {
      knownPiece(spawn.type, ['pieceSpawns', i, 'type']);
      if (!insideField(spawn.position)) {
        issue(['pieceSpawns', i, 'position'], 'spawn position is outside the field');
      }
    });

    pack.pieceSpawnAreas.forEach((area, i) => {
      knownPiece(area.type, ['pieceSpawnAreas', i, 'type']);
      if (!insideField(area.box.center)) {
        issue(['pieceSpawnAreas', i, 'box'], 'spawn area is outside the field');
      }
    });

    if (pack.preload) knownPiece(pack.preload.type, ['preload', 'type']);

    pack.field.goals.forEach((goal, i) => {
      if (goal.recycle && !insideField(goal.recycle.exit.box.center)) {
        issue(['field', 'goals', i, 'recycle', 'exit'], 'recycle exit is outside the field');
      }
    });

    pack.scoring.forEach((rule, i) => {
      rule.goals.forEach((goal, j) => {
        if (!goalIds.has(goal)) issue(['scoring', i, 'goals', j], `unknown goal "${goal}"`);
      });
      rule.pieceTypes?.forEach((type, j) => knownPiece(type, ['scoring', i, 'pieceTypes', j]));
      for (const period of Object.keys(rule.points)) {
        if (!periodIds.has(period)) {
          issue(['scoring', i, 'points', period], `unknown match period "${period}"`);
        }
      }
    });

    pack.mechanics.forEach((mechanic, i) => {
      const module = getMechanic(mechanic);
      if (!module) {
        const known = knownMechanicIds();
        issue(
          ['mechanics', i],
          `unknown mechanic "${mechanic}" (known: ${known.length ? known.join(', ') : 'none'})`,
        );
        return;
      }
      for (const problem of module.validate?.(pack) ?? []) {
        issue(['mechanics', i], `${mechanic}: ${problem}`);
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
