# Game pack format (version 1)

A game pack describes one season so the season-agnostic engine can play it. Packs are **data only** and never contain code. The schema lives in [`packages/sim/src/pack.ts`](../packages/sim/src/pack.ts); load packs with `loadGamePack(data)`, which reports every problem at once.

A complete small example is the engine's test fixture, [`test-arena.json`](../packages/sim/src/testing/test-arena.json).

## Units and coordinates

- SI units only: meters, kilograms, seconds, radians.
- WPILib field coordinates: origin at the blue alliance wall corner, +x toward red, +y to the left when standing behind the blue wall, +z up.
- Boxes are axis-aligned: `center` is `[x, y, z]` and `size` is the full extent `[x, y, z]`.
- ids use lowercase letters, digits, and dashes, for example `blue-low-goal`.

## Top-level fields

| Field                   | Meaning                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `formatVersion`         | Always `1` for this format.                                                                               |
| `id`, `name`, `season`  | Pack identity. `season` is the competition year.                                                          |
| `source.manualRevision` | Which manual or Team Update this pack is based on. Required, so packs can be rechecked when rules change. |
| `source.url`            | Optional link to the official manual. Link to it rather than copying it.                                  |
| `field`                 | Field size, walls, obstacles, and goals (below).                                                          |
| `pieceTypes`            | Game piece definitions (below).                                                                           |
| `pieceSpawns`           | Where pieces start: `{ "type": "<piece id>", "position": [x, y, z] }`.                                    |
| `match.periods`         | Ordered match periods: `{ "id": "auto", "durationSeconds": 15 }`.                                         |
| `scoring`               | Scoring rules (below).                                                                                    |
| `robotRules`            | `maxFramePerimeter`, `maxHeight`, `maxExtension`, `maxMass`.                                              |
| `mechanics`             | Optional list of engine mechanic module ids this season needs. Defaults to `[]`.                          |

## Field

```json
"field": {
  "size": [16.5, 8.1],
  "wallHeight": 0.5,
  "obstacles": [{ "id": "bump", "box": { "center": [5, 0.6, 0.05], "size": [1, 1, 0.1] } }],
  "goals": [
    { "id": "blue-hub", "box": { "center": [4.6, 4.0, 1.8], "size": [1, 1, 0.4] }, "creditAlliance": "blue" }
  ]
}
```

- The engine adds the floor and perimeter walls automatically from `size` and `wallHeight`.
- **Obstacles** are solid boxes robots and pieces collide with.
- **Goals** are invisible scoring volumes. A free piece whose center enters a goal box is scored and removed. `creditAlliance` receives the points. Goals are not solid; add obstacles for any physical structure around them.

## Piece types

```json
{
  "id": "ball",
  "name": "Foam ball",
  "shape": { "kind": "sphere", "radius": 0.075 },
  "mass": 0.2,
  "friction": 0.6,
  "restitution": 0.3
}
```

Shapes are `{ "kind": "sphere", "radius": r }` or `{ "kind": "box", "size": [x, y, z] }`. `restitution` (bounciness) is between 0 and 1. More shapes will be added when a pack needs them.

## Scoring rules

```json
{
  "id": "hub-score",
  "when": "pieceEntersGoal",
  "goals": ["blue-hub"],
  "pieceTypes": ["ball"],
  "points": { "auto": 4, "teleop": 2 }
}
```

- `when` is currently always `pieceEntersGoal`. More triggers (endgame parking, thresholds, ranking points) will be added when a pack needs them.
- `pieceTypes` is optional; omit it to count every piece type.
- `points` is keyed by match period id. Periods not listed award 0.

## Mechanics

Some seasons have mechanics data cannot express, such as goals that switch between active and inactive. Those are implemented as reviewed engine code in [`mechanics.ts`](../packages/sim/src/mechanics.ts) and enabled by id. A pack that lists an unknown mechanic fails to load. No mechanic modules exist yet.

## Validation

`loadGamePack` checks types and ranges, then cross-references: unique ids, spawns using known piece types and lying inside the field, scoring rules naming known goals, piece types, and periods, and mechanics the engine implements.

## Not yet in the format

Planned for later milestones: visual meshes and collision meshes from CAD, non-box obstacles and ramps, endgame and ranking-point rules, human-player stations, and starting zones.
