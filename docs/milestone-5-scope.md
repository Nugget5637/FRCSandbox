# Milestone 5 scope: second pack (REEFSCAPE) and deferred format features

Milestone 5's headline task is a second game pack (2025 REEFSCAPE) to prove the pack format is game-agnostic. Along the way it adds pack-format features that earlier milestones deferred to it, because REEFSCAPE needs new geometry anyway and these are cheaper to design together than one at a time.

## Core task

- A REEFSCAPE pack in `game-packs/reefscape-2025/`, built the same way as REBUILT: a `generate.mjs` that cites every measurement, plus a `SOURCES.md`. Sources: 2025 Game Manual, WPILib 2025 AprilTag layout, 2025 inspection checklist, and public team field constants for details the manual omits.
- Tests like `packages/sim/src/packs/rebuilt.test.ts`.
- An `npm run packs:reefscape` script.

## Format features REEFSCAPE needs

- **Cylinder-shaped pieces** (coral is a PVC tube). Only spheres and boxes exist today.
- **Rotated boxes and goals** (the reef's angled scoring branches on four levels). Everything is axis-aligned today.

## Features deferred into this milestone

These came up during Milestones 2 and 3 and were parked here on purpose.

- **Hub panels and net (from Milestone 2/3 feedback).** The REBUILT hub is currently a plain box with an open top. Add the angled top panels (needs rotated/angled walls, which REEFSCAPE also needs) and the back net that blocks fuel shot from illegal angles (a one-sided blocker). Noted when the owner saw the 3D hub had no panels or net.
- **Human player station (from Milestone 3 feedback).** No human player, no fuel storage at the station, and no way to feed fuel onto the field, the way frsim.com's REBUILT does through the outpost. Needs a human-player station, a fuel supply, and a timed feed action in the pack format. Both REBUILT and REEFSCAPE need this.
- **Out-of-bounds re-entry (from owner question, 2026-11-11).** When a piece leaves the field (for example a shot that clips a wall), return it the way a referee would. Make it a pack-format rule with a choice of behavior:
  - nearest point on the field boundary (simple, predictable)
  - a fixed re-entry zone defined by the game
  - the exact exit point (least realistic)
  - Suggested default: nearest edge after a short delay, to mimic a referee walking over. Decide the delay and placement when building it; the realistic version is barely more work than instant return.

## Still NOT in Milestone 5

These wait for later milestones:

- Tower/cage climbing and robot-state scoring (needs the bot creator's mechanisms, Milestone 4).
- Ranking-point threshold bonuses.
- Fouls and position-based scoring restrictions.
- Real per-module swerve (Milestone 4, since it reads the robot's module layout from the bot creator).

## When REEFSCAPE reveals more gaps

Expect the pack to hit things this list didn't predict, exactly as REBUILT did. Add each one here (or to `docs/workstreams/reefscape.md` if a second account is building it), then fold it into the format.
