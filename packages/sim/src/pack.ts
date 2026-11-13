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
 * Orientation as [roll, pitch, yaw] in radians, matching WPILib's Rotation3d:
 * rotate about the field x axis by roll, then about y by pitch, then about z by
 * yaw (all fixed field axes). Positive pitch tips +x downward, so a branch
 * angled 35 degrees upward has pitch -35 degrees, as in WPILib field code.
 */
const RotationSchema = vec3;
export type Rotation = z.output<typeof RotationSchema>;

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
export const FRC_CARPET: Carpet = { friction: 0.8, restitution: 0.4, rollingResistance: 0.05 };

/** Default for walls and field structures (polycarbonate, aluminum, steel). */
export const DEFAULT_STRUCTURE_SURFACE: Surface = { friction: 0.4, restitution: 0.5 };

export const AllianceSchema = z.enum(['red', 'blue']);
export type Alliance = z.output<typeof AllianceSchema>;

/** Axis-aligned box. `size` is the full extent along x, y, and z. */
const BoxSchema = z.object({ center: vec3, size: size3 });
export type Box = z.output<typeof BoxSchema>;

/** A box that may be rotated about its center. `size` is measured in the box's own axes. */
const OrientedBoxSchema = BoxSchema.extend({ rotation: RotationSchema.optional() });
export type OrientedBox = z.output<typeof OrientedBoxSchema>;

/**
 * Solid field geometry.
 * - box: a solid box.
 * - ridge: a triangular prism filling the bounding box, with its peak line
 *   running along `ridgeAxis` at the top center. Used for bumps and ramps.
 * Both may set `rotation` to turn the shape about its center (angled panels,
 * the reef's branches). Without it the shape is axis-aligned.
 */
const ObstacleShapeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('box'),
    center: vec3,
    size: size3,
    rotation: RotationSchema.optional(),
  }),
  z.object({
    kind: z.literal('ridge'),
    center: vec3,
    size: size3,
    ridgeAxis: z.enum(['x', 'y']),
    rotation: RotationSchema.optional(),
  }),
]);
export type ObstacleShape = z.output<typeof ObstacleShapeSchema>;

/**
 * Piece shapes. A cylinder's axis runs along the piece's own z axis, so an
 * unrotated cylinder stands upright. Hollow tubes are modeled as solid.
 */
const PieceShapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sphere'), radius: positive }),
  z.object({ kind: z.literal('box'), size: size3 }),
  z.object({ kind: z.literal('cylinder'), radius: positive, length: positive }),
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

/** Where pieces enter the field: a random point in `box`, moving at `velocity`. */
const PieceExitSchema = z.object({
  box: BoxSchema,
  velocity: vec3,
  /** Orientation of pieces as they appear. Defaults to unrotated. */
  rotation: RotationSchema.optional(),
});
export type PieceExit = z.output<typeof PieceExitSchema>;

const GoalSchema = z.object({
  id,
  /** Scoring volume. May be rotated, for example along an angled branch. */
  box: OrientedBoxSchema,
  creditAlliance: AllianceSchema,
  /**
   * Most pieces this goal can ever hold, such as 1 for a REEFSCAPE branch.
   * Once full, pieces pass through the volume without scoring. Omit for no limit.
   * Recycled pieces are not counted, because they leave the goal.
   */
  capacity: z.number().int().positive().optional(),
  /**
   * If set, scored pieces come back onto the field after a delay instead of
   * leaving the match. They appear at a random point in `exit.box` moving at
   * `exit.velocity`.
   */
  recycle: z
    .object({
      delaySeconds: nonNegative,
      exit: PieceExitSchema,
    })
    .optional(),
});
export type Goal = z.output<typeof GoalSchema>;

/**
 * A human player who holds a supply of pieces and feeds them onto the field
 * (REBUILT outposts, REEFSCAPE coral stations). While the player's feed input
 * is held, one piece appears at `exit` every `feedSeconds`.
 */
const HumanPlayerStationSchema = z.object({
  id,
  alliance: AllianceSchema,
  pieceType: id,
  /** Pieces the human player holds at the start of the match. */
  supply: z.number().int().nonnegative(),
  /** Time for the human player to put one piece onto the field. */
  feedSeconds: positive,
  exit: PieceExitSchema,
});
export type HumanPlayerStation = z.output<typeof HumanPlayerStationSchema>;

/**
 * What happens to a piece whose center leaves the field (over a wall, or
 * through the floor). After `delaySeconds` it returns, resting on the carpet:
 * - nearestEdge: at the point inside the field nearest to where it would land
 * - zone: at a random point in the re-entry zone nearest to where it would land
 * - exitPoint: just inside the field where it crossed the boundary
 */
const OutOfBoundsSchema = z.object({
  mode: z.enum(['nearestEdge', 'zone', 'exitPoint']).default('nearestEdge'),
  delaySeconds: nonNegative.default(2),
  /** Re-entry zones for mode "zone". */
  zones: z.array(z.object({ id, box: BoxSchema })).default([]),
});
export type OutOfBounds = z.output<typeof OutOfBoundsSchema>;
/** Default: a referee walks over and puts the piece back at the nearest edge. */
export const DEFAULT_OUT_OF_BOUNDS: OutOfBounds = {
  mode: 'nearestEdge',
  delaySeconds: 2,
  zones: [],
};

const ObstacleSchema = z.object({
  id,
  shape: ObstacleShapeSchema,
  /** Defaults to DEFAULT_STRUCTURE_SURFACE. */
  surface: SurfaceSchema.optional(),
  /**
   * Makes the obstacle one-sided, like a net that stops shots from behind a
   * goal. It blocks only bodies whose center is on the side `normal` points to;
   * bodies on the other side pass through it.
   */
  oneSided: z.object({ normal: vec3 }).optional(),
});
export type Obstacle = z.output<typeof ObstacleSchema>;

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
      obstacles: z.array(ObstacleSchema).default([]),
      goals: z.array(GoalSchema).min(1),
      /** Named areas used for display and future rules. They have no physics. */
      zones: z.array(ZoneSchema).default([]),
      /** How pieces that leave the field come back. Defaults to DEFAULT_OUT_OF_BOUNDS. */
      outOfBounds: OutOfBoundsSchema.default(DEFAULT_OUT_OF_BOUNDS),
    }),
    pieceTypes: z.array(PieceTypeSchema).min(1),
    /** Individually placed pieces, optionally rotated (an upright or lying coral). */
    pieceSpawns: z
      .array(z.object({ type: id, position: vec3, rotation: RotationSchema.optional() }))
      .default([]),
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
    /** Human players who feed pieces onto the field. */
    humanPlayerStations: z.array(HumanPlayerStationSchema).default([]),
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
      pack.humanPlayerStations.map((s) => s.id),
      ['humanPlayerStations'],
      'human player station',
    );
    checkUnique(
      pack.field.outOfBounds.zones.map((z) => z.id),
      ['field', 'outOfBounds', 'zones'],
      're-entry zone',
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

    pack.humanPlayerStations.forEach((station, i) => {
      knownPiece(station.pieceType, ['humanPlayerStations', i, 'pieceType']);
      if (!insideField(station.exit.box.center)) {
        issue(['humanPlayerStations', i, 'exit'], 'station exit is outside the field');
      }
    });

    pack.field.obstacles.forEach((obstacle, i) => {
      const n = obstacle.oneSided?.normal;
      if (n && Math.hypot(...n) === 0) {
        issue(['field', 'obstacles', i, 'oneSided', 'normal'], 'normal must not be zero');
      }
    });

    const outOfBounds = pack.field.outOfBounds;
    if (outOfBounds.mode === 'zone' && outOfBounds.zones.length === 0) {
      issue(['field', 'outOfBounds', 'zones'], 'mode "zone" needs at least one re-entry zone');
    }
    outOfBounds.zones.forEach((zone, i) => {
      if (!insideField(zone.box.center)) {
        issue(['field', 'outOfBounds', 'zones', i, 'box'], 're-entry zone is outside the field');
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

/** A unit quaternion {x, y, z, w}. */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const IDENTITY_QUATERNION: Quaternion = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

/** Converts a pack rotation [roll, pitch, yaw] (WPILib Rotation3d convention) to a quaternion. */
export function rotationToQuaternion(rotation: Rotation | undefined): Quaternion {
  if (!rotation) return { ...IDENTITY_QUATERNION };
  const [roll, pitch, yaw] = rotation;
  const cr = Math.cos(roll / 2);
  const sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  // q = qz(yaw) * qy(pitch) * qx(roll)
  return {
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  };
}

/** Rotates vector v by unit quaternion q. */
export function rotateVector(
  q: Quaternion,
  v: readonly [number, number, number],
): [number, number, number] {
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [
    vx + q.w * tx + (q.y * tz - q.z * ty),
    vy + q.w * ty + (q.z * tx - q.x * tz),
    vz + q.w * tz + (q.x * ty - q.y * tx),
  ];
}

/** True if a point lies inside a box, honoring its rotation if it has one. */
export function boxContains(box: OrientedBox, x: number, y: number, z: number): boolean {
  const [cx, cy, cz] = box.center;
  const [sx, sy, sz] = box.size;
  let dx = x - cx;
  let dy = y - cy;
  let dz = z - cz;
  if (box.rotation) {
    const q = rotationToQuaternion(box.rotation);
    [dx, dy, dz] = rotateVector({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, [dx, dy, dz]);
  }
  return Math.abs(dx) <= sx / 2 && Math.abs(dy) <= sy / 2 && Math.abs(dz) <= sz / 2;
}
