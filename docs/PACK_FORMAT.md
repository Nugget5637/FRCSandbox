# Game pack format (version 1, draft)

A game pack describes one season so the season-agnostic engine can play it. Packs are **data only** and never contain code. The schema lives in [`packages/sim/src/pack.ts`](../packages/sim/src/pack.ts); load packs with `loadGamePack(data)`, which reports every problem at once.

Version 1 is a draft and may change until the first public release. Milestone 2 (REBUILT) added obstacle shapes, zones, spawn areas, preloads, and goal recycling. Milestone 5 (REEFSCAPE) added rotations, cylinder pieces, goal capacity, one-sided obstacles, human player stations, and out-of-bounds re-entry. Every Milestone 5 field is optional, so older packs load unchanged.

Examples:

- [`game-packs/rebuilt-2026`](../game-packs/rebuilt-2026/): a full season. Its `pack.json` is generated from cited measurements by `generate.mjs`.
- [`game-packs/reefscape-2025`](../game-packs/reefscape-2025/): a second full season, built the same way.
- [`test-arena.json`](../packages/sim/src/testing/test-arena.json): the smallest useful pack.

## Units and coordinates

- SI units only: meters, kilograms, seconds, radians.
- WPILib field coordinates: origin at the blue alliance wall corner, +x toward red, +y to the left when standing behind the blue wall, +z up.
- Boxes are axis-aligned unless they have a `rotation`: `center` is `[x, y, z]` and `size` is the full extent `[x, y, z]`, measured in the box's own axes.
- `rotation` is `[roll, pitch, yaw]` in radians, the same convention as WPILib's `Rotation3d`: rotate about field x by roll, then field y by pitch, then field z by yaw. Positive pitch tips +x downward, so a pipe angled 35° upward has pitch `-0.6109` (−35°), exactly as in team field-constant code. A shape rotates about its own center.
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
| `humanPlayerStations`   | Human players who feed pieces onto the field (below). Optional.                                           |
| `match.periods`         | Ordered match periods: `{ "id": "auto", "durationSeconds": 20 }`.                                         |
| `scoring`               | Scoring rules (below).                                                                                    |
| `robotRules`            | `maxFramePerimeter`, `maxHeight`, `maxExtension`, `maxMass`.                                              |
| `mechanics`             | Engine mechanic modules this season needs (below). Defaults to `[]`.                                      |

## Field

The engine adds the floor and perimeter walls from `size` and `wallHeight`. `field.outOfBounds` sets how pieces that leave the field come back (below).

### Obstacles

Solid geometry robots and pieces collide with:

```json
{ "id": "blue-hub-base", "shape": { "kind": "box", "center": [4.62, 4.03, 0.72], "size": [1.19, 1.19, 1.44] } }
{ "id": "blue-bump-left", "shape": { "kind": "ridge", "ridgeAxis": "y", "center": [4.62, 5.56, 0.08], "size": [1.13, 1.85, 0.17] } }
```

- `box`: a solid box. Raise its center to make overhead structures, like a trench arm robots can drive under.
- `ridge`: a triangular prism filling the box, with its peak line along `ridgeAxis` at the top. Used for bumps and two-sided ramps.

Both shapes take an optional `rotation`. REBUILT's hub funnel panels and REEFSCAPE's branches, coral stations, and hexagonal reef (three boxes turned 60° apart) use it:

```json
{
  "id": "blue-reef-l2-face0-right",
  "shape": {
    "kind": "box",
    "center": [3.8334, 3.8609, 0.7092],
    "size": [0.3048, 0.0422, 0.0422],
    "rotation": [0, -0.6109, 3.1416]
  }
}
```

#### One-sided obstacles

`oneSided` makes an obstacle block only from one side, like the net behind a REBUILT hub that stops shots from the neutral zone:

```json
{
  "id": "blue-hub-net",
  "shape": { "kind": "box", "center": [5.48, 4.03, 2.44], "size": [0.02, 1.48, 1.23] },
  "oneSided": { "normal": [1, 0, 0] }
}
```

Bodies (pieces and robots) whose center is on the side `normal` points to collide with it. Bodies on the other side pass through. The side is checked before every physics step, so a piece that has passed through does not get pushed back. `normal` is in field coordinates and must not be zero.

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

`recycle` is optional. With it, scored pieces return to the field after `delaySeconds` at a random point in `exit.box`, moving at `exit.velocity`. While waiting, a piece's state is `processing`. An exit may also set `rotation` for the pieces it releases.

A goal's `box` may have a `rotation`, so it can follow an angled branch. `capacity` (optional) is the most pieces the goal can ever hold: a REEFSCAPE branch takes one coral, so its goals set `"capacity": 1`. Once a goal is full, pieces pass through its volume without scoring. Recycled pieces are not counted, because they leave the goal.

### Out-of-bounds re-entry

A piece leaves the field when its center goes outside the field rectangle (over a wall) or falls 0.5 m below the carpet. It is taken out of play (state `outOfBounds`, event `pieceLeftField`), then put back on the carpet at rest after `delaySeconds` (event `pieceReturned`), the way a referee would:

```json
"outOfBounds": { "mode": "nearestEdge", "delaySeconds": 2 }
```

| `mode`        | Where the piece comes back                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `nearestEdge` | Inside the field at the point nearest to where it would land, from its height and velocity when it left. Default. |
| `zone`        | A random point in the re-entry zone nearest to where it would land. List zones in `zones: [{ "id", "box" }]`.     |
| `exitPoint`   | Just inside the field where it crossed the boundary.                                                              |

Omit `outOfBounds` to get `nearestEdge` after 2 seconds. Pieces return far enough from the wall to fit (their bounding radius plus 5 cm). Spheres come back as they were; cylinders come back lying on their side. The engine does not check for obstacles at the return point. REBUILT and REEFSCAPE both use `exitPoint` with a 3 s delay, because both manuals (section 6.8) say field staff return pieces "approximately at the point of exit".

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

Shapes are `{ "kind": "sphere", "radius": r }`, `{ "kind": "box", "size": [x, y, z] }`, or `{ "kind": "cylinder", "radius": r, "length": l }`. A cylinder's axis runs along the piece's own z axis, so an unrotated cylinder stands upright. Hollow tubes such as REEFSCAPE coral are modeled as solid cylinders. `friction` and `restitution` (bounciness, 0 to 1) describe the piece's own surface; see [Surfaces and carpet](#surfaces-and-carpet). `rollingResistance` is optional.

Individual `pieceSpawns` may set `rotation`, for example to lay a cylinder on its side. When a robot releases a cylinder, its axis points along the launch direction (the robot's heading tilted up by the release pitch), the way a coral slides off an end effector onto a branch.

### Human player stations

A human player holds a supply of pieces and feeds them onto the field:

```json
{
  "id": "blue-outpost",
  "alliance": "blue",
  "pieceType": "fuel",
  "supply": 24,
  "feedSeconds": 0.25,
  "exit": {
    "box": { "center": [0.1251, 0.666, 0.8026], "size": [0.02, 0.6576, 0.02] },
    "velocity": [1.4489, 0, -0.3882]
  }
}
```

Station pieces exist from the start with state `station`. The feed is an input, like robot controls, so matches still replay from their inputs: `sim.step(robotInputs, { "blue-outpost": { feed: true } })`. While `feed` is held, the human player spends `feedSeconds` on each piece, then it appears at a random point in `exit.box` moving at `exit.velocity` (event `pieceFed`), and the next one starts. Letting go cancels the piece in progress. `exit.rotation` orients the pieces, for example coral lying across a coral station opening. Snapshots list each station's remaining `supply` and whether it is `feeding`.

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

## Surfaces and carpet

Every surface has its own `friction` and `restitution`. When two surfaces touch, the engine combines them with the **geometric mean**:

```text
friction    = sqrt(a.friction    * b.friction)
restitution = sqrt(a.restitution * b.restitution)
```

So a game piece only needs its own values. The same piece type behaves correctly against the carpet, field structures, robots, and other pieces in any pack.

| Surface         | Set by                                 | Default                                                                     |
| --------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| Carpet          | `field.carpet`                         | Standard FRC carpet (below)                                                 |
| Perimeter walls | `field.wallSurface`                    | friction 0.4, restitution 0.5                                               |
| Each obstacle   | `obstacles[].surface`                  | friction 0.4, restitution 0.5                                               |
| Each piece type | `pieceTypes[].friction`, `restitution` | Required                                                                    |
| Robots          | Engine                                 | friction 0, restitution 0.2 (robots are driven by velocity, not wheel grip) |

### Carpet

```json
"carpet": { "friction": 0.8, "restitution": 0.4, "rollingResistance": 0.08 }
```

Omit `carpet` to use the standard FRC carpet: Shaw Philadelphia Commercial Neyland II 20, used on official fields from 2024 through 2027. Its values are estimates, because FIRST publishes no measurements.

`rollingResistance` is what stops a rolling ball. The physics engine has no rolling friction, so without it a ball would roll on carpet almost forever. Each step, every round piece touching the carpet slows by `rollingResistance × 9.81 m/s²`. A ball rolling at speed `v` stops after about `v² / (2 × rollingResistance × 9.81)` meters. This applies automatically to every sphere piece in every pack, and to cylinders lying on their side. Box pieces and upright cylinders slide instead, and their friction against the carpet stops them.

A piece type can set its own `rollingResistance` when it has been measured on carpet, for example a soft ball that rolls a shorter distance than the carpet default.

### Measuring surfaces

Rough measurements beat guesses. On real field carpet:

- **Friction:** tilt a carpet-covered board until the piece starts to slide. The combined friction is `tan(angle)`, and the piece's own value is `combined² / carpet friction`.
- **Rolling resistance:** roll a ball off a ramp onto flat carpet. With speed `v` at the bottom of the ramp and rolling distance `d`, `rollingResistance = v² / (2 × 9.81 × d)`.
- **Restitution:** drop the piece from height `h0` onto carpet and measure the bounce height `h1`. The combined value is `sqrt(h1 / h0)`.

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

`loadGamePack` checks types and ranges, then cross-references: unique ids; spawns, spawn areas, recycle exits, station exits, and re-entry zones inside the field; a re-entry zone when the mode is `zone`; non-zero one-sided normals; known piece types everywhere they are named; scoring rules naming known goals and periods; and mechanics the engine implements, including each mechanic's own checks.

## Not yet in the format

Found while building REBUILT and REEFSCAPE, planned for later milestones:

- Robot-state scoring (climbing, parking, leaving the starting line) and threshold bonuses such as ranking points
- Rules that depend on where a robot is, such as shooting only from the alliance zone, and fouls
- Scored pieces that stay visible where they scored (a coral on its branch). Today a scored piece leaves the field.
- Scoring that depends on contact, such as REEFSCAPE coral counting only while no robot or algae touches it, and removing points when a scored piece is knocked off
- Goals that pass pieces to a human player (REEFSCAPE algae through the processor), and human players throwing pieces into goals
- Non-box goal shapes (hexagonal openings), meshes from CAD, hollow pieces, and one-sided ramps
- Starting positions and zones the engine enforces
