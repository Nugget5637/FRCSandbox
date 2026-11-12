# Game pack format (version 1, draft)

A game pack describes one season so the season-agnostic engine can play it. Packs are **data only** and never contain code. The schema lives in [`packages/sim/src/pack.ts`](../packages/sim/src/pack.ts); load packs with `loadGamePack(data)`, which reports every problem at once.

Version 1 is a draft and may change until the first public release. Milestone 2 (REBUILT) added obstacle shapes, zones, spawn areas, preloads, and goal recycling.

Examples:

- [`game-packs/rebuilt-2026`](../game-packs/rebuilt-2026/): a full season. Its `pack.json` is generated from cited measurements by `generate.mjs`.
- [`test-arena.json`](../packages/sim/src/testing/test-arena.json): the smallest useful pack.

## Units and coordinates

- SI units only: meters, kilograms, seconds, radians.
- WPILib field coordinates: origin at the blue alliance wall corner, +x toward red, +y to the left when standing behind the blue wall, +z up.
- Boxes are axis-aligned: `center` is `[x, y, z]` and `size` is the full extent `[x, y, z]`.
- ids use lowercase letters, digits, and dashes, for example `blue-hub`.

## Top-level fields

| Field                   | Meaning                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `formatVersion`         | Always `1` for this format.                                                                               |
| `id`, `name`, `season`  | Pack identity. `season` is the competition year.                                                          |
| `source.manualRevision` | Which manual or Team Update this pack is based on. Required, so packs can be rechecked when rules change. |
| `source.url`            | Optional link to official material. Link to it rather than copying it.                                    |
| `field`                 | Field size, walls, obstacles, goals, and zones (below).                                                   |
| `pieceTypes`            | Game piece definitions (below).                                                                           |
| `pieceSpawns`           | Individually placed pieces: `{ "type": "fuel", "position": [x, y, z] }`. Optional.                        |
| `pieceSpawnAreas`       | Pieces arranged in a grid inside a box (below). Optional.                                                 |
| `preload`               | `{ "type": "fuel", "maxPerRobot": 8 }`. Pieces a robot may hold at the start. Optional.                   |
| `match.periods`         | Ordered match periods: `{ "id": "auto", "durationSeconds": 20 }`.                                         |
| `scoring`               | Scoring rules (below).                                                                                    |
| `robotRules`            | `maxFramePerimeter`, `maxHeight`, `maxExtension`, `maxMass`.                                              |
| `mechanics`             | Engine mechanic modules this season needs (below). Defaults to `[]`.                                      |

## Field

The engine adds the floor and perimeter walls from `size` and `wallHeight`.

### Obstacles

Solid geometry robots and pieces collide with:

```json
{ "id": "blue-hub-base", "shape": { "kind": "box", "center": [4.62, 4.03, 0.72], "size": [1.19, 1.19, 1.44] } }
{ "id": "blue-bump-left", "shape": { "kind": "ridge", "ridgeAxis": "y", "center": [4.62, 5.56, 0.08], "size": [1.13, 1.85, 0.17] } }
```

- `box`: an axis-aligned solid box. Raise its center to make overhead structures, like a trench arm robots can drive under.
- `ridge`: a triangular prism filling the box, with its peak line along `ridgeAxis` at the top. Used for bumps and two-sided ramps.

### Goals

Goals are invisible scoring volumes. A free piece whose center enters a goal box is scored and removed. `creditAlliance` receives the points. Add obstacles for any physical structure around a goal.

```json
{
  "id": "blue-hub",
  "box": { "center": [4.62, 4.03, 1.63], "size": [1, 1, 0.39] },
  "creditAlliance": "blue",
  "recycle": {
    "delaySeconds": 1,
    "exit": {
      "box": { "center": [5.32, 4.03, 0.1], "size": [0.05, 0.95, 0.02] },
      "velocity": [1.5, 0, 0]
    }
  }
}
```

`recycle` is optional. With it, scored pieces return to the field after `delaySeconds` at a random point in `exit.box`, moving at `exit.velocity`. While waiting, a piece's state is `processing`.

### Zones

Named areas with no physics, used for display now and for future rules: `{ "id": "neutral-zone", "kind": "neutralZone", "box": {...} }`. `kind` is `allianceZone`, `neutralZone`, or `other`, with an optional `alliance`.

## Pieces

### Piece types

```json
{
  "id": "fuel",
  "name": "FUEL",
  "shape": { "kind": "sphere", "radius": 0.075 },
  "mass": 0.215,
  "friction": 0.7,
  "restitution": 0.35
}
```

Shapes are `{ "kind": "sphere", "radius": r }` or `{ "kind": "box", "size": [x, y, z] }`. `restitution` (bounciness) is between 0 and 1.

### Spawn areas

```json
{
  "id": "neutral-zone",
  "type": "fuel",
  "box": { "center": [8.27, 4.03, 0.075], "size": [1.83, 5.23, 0.15] },
  "count": 360,
  "jitter": 0.01
}
```

Pieces fill a grid inside the box, one layer at a time from the bottom. `jitter` adds a seeded random offset in meters, so layouts vary by seed but replay exactly.

## Scoring rules

```json
{
  "id": "fuel-blue-hub",
  "when": "pieceEntersGoal",
  "goals": ["blue-hub"],
  "pieceTypes": ["fuel"],
  "points": { "auto": 1, "endgame": 1 }
}
```

- `when` is currently always `pieceEntersGoal`.
- `pieceTypes` is optional; omit it to count every piece type.
- `points` is keyed by match period id. Periods not listed award 0.
- If a mechanic marks the goal inactive, the piece is still scored (and recycled) but awards 0 points. The `pieceScored` event records `active: false`.

## Mechanics

Some seasons have mechanics data cannot express. Those are reviewed engine code in [`packages/sim/src/mechanics/`](../packages/sim/src/mechanics/), enabled by id. A mechanic can validate the pack, decide whether a goal is active, and react to scored pieces. A pack that lists an unknown mechanic, or fails a mechanic's validation, does not load.

| Mechanic             | Season | What it does                                                                                                                    |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `rebuilt-hub-shifts` | 2026   | Hubs alternate active and inactive during alliance shifts, based on which alliance scored more fuel in AUTO (manual Table 6-3). |

## Validation

`loadGamePack` checks types and ranges, then cross-references: unique ids; spawns, spawn areas, and recycle exits inside the field; known piece types everywhere they are named; scoring rules naming known goals and periods; and mechanics the engine implements, including each mechanic's own checks.

## Not yet in the format

Found while building REBUILT, planned for later milestones:

- Robot-state scoring (climbing levels, parking) and threshold bonuses such as ranking points
- Human-player stations that feed pieces onto the field
- Rules that depend on where a robot is, such as shooting only from the alliance zone
- Non-box goal shapes (hexagonal openings), meshes from CAD, and one-sided ramps
- Starting positions and zones the engine enforces
