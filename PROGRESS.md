# FRC Sandbox: progress tracker

This file is the source of truth for project status. Each work session updates the status table and appends a dated entry to the log. Import [docs/milestones.csv](docs/milestones.csv) into Google Sheets (File → Import) whenever you want the spreadsheet to match this file.

**Scope:** single-player browser sandbox. Multiplayer is out of scope.
**Status values:** Not started, In progress, Blocked, Done

## Milestone status

| #   | Milestone                        | Status      | %   | Last updated | Note                                 |
| --- | -------------------------------- | ----------- | --- | ------------ | ------------------------------------ |
| 0   | Project skeleton & plan          | Done        | 100 | 2026-11-11   | Tooling, CI, plan, steering          |
| 1   | Core engine & pack format        | Done        | 100 | 2026-11-11   | 3D Rapier engine, pack v1, 23 tests  |
| 2   | REBUILT pack (by hand)           | Done        | 100 | 2026-11-11   | Cited pack, hub shifts, 36 tests     |
| 3   | 3D rendering & driving           | Done        | 100 | 2026-11-11   | Three.js, 3 cameras, touch, 47 tests |
| 4   | 3D bot creator mode              | Not started | 0   | —            | Core player experience               |
| 5   | Second pack (by hand)            | Done        | 100 | 2026-11-13   | REEFSCAPE, 2nd account, 79 tests     |
| 6   | Application shell & presentation | Not started | 0   | —            | Menus, game picker, style, feel      |
| 7   | CAD pipeline                     | Not started | 0   | —            | After the format is proven           |
| 8   | Manual-reading assist            | Not started | 0   | —            | Human-verified drafts                |

## Milestone 0 checklist

- [x] npm workspaces monorepo with `packages/sim` and `apps/client`
- [x] Strict TypeScript shared config
- [x] `sim` package cannot use DOM APIs (verified: a probe file using `document` fails typecheck)
- [x] Vite client that builds and imports `@frcsandbox/sim` across the workspace boundary
- [x] Placeholder page with canvas and WebGL2 detection
- [x] Vitest with first engine tests (3 passing)
- [x] Prettier formatting and `npm run check`
- [x] GitHub Actions CI running format, typecheck, tests, and build
- [x] `docs/PLAN.md` with scope, architecture, conventions, workflow, and decision log
- [x] `.kiro/steering/project.md` so future sessions load the rules automatically
- [ ] Owner runs `npm run dev` and confirms the page in a real browser
- [ ] Owner chooses a license

## Milestone 1 checklist

- [x] Chose libraries: Rapier 3D (deterministic build) for physics, Three.js for rendering (installed in Milestone 3)
- [x] Game pack format v1 with validation and cross-reference checks (`docs/PACK_FORMAT.md`)
- [x] Mechanic module registry; packs naming unknown mechanics fail to load
- [x] Robot spec and robot-rule checks (perimeter, height, mass)
- [x] Fixed-timestep 3D simulation: floor, walls, obstacles, gravity, pieces, robots
- [x] Field-relative driving with acceleration and turn-rate limits
- [x] Intake capture zone, piece storage, release with launch speed and angle
- [x] Goal volumes, period-specific points, alliance score
- [x] Match periods and an event log (period start, acquire, release, score, match end)
- [x] Seeded random numbers; same seed and inputs replay identically (tested)
- [x] Headless test: scripted robot collects a ball and scores 4 points in auto, 2 in teleop
- [ ] Robot tipping (rotations other than yaw are locked until the bot creator)
- [ ] Extension limits (`maxExtension` is stored but not checked until mechanisms exist)

## Milestone 3 checklist

- [x] Three.js WebGL2 renderer: carpet, structures, ramps, goals, instanced game pieces
- [x] Placeholder robot mesh (real geometry comes with the bot creator in M4)
- [x] Chase camera (locked behind the robot, robot-relative driving)
- [x] Broadcast camera (behind the blue wall, follows the robot, quartic ease-out zoom at the alliance line, field-relative)
- [x] Driver station cameras 1-3 (eye height behind the wall, field-relative)
- [x] Tab cycles cameras; each sets its natural control frame
- [x] Keyboard, gamepad, and on-screen touch controls
- [x] HUD: score, clock, hub status, event log, controls
- [x] Fixed-timestep loop with interpolated rendering
- [x] Bundle split so physics/three/app load in parallel
- [x] 47 tests (42 engine + 5 renderer scene-graph and camera)
- [ ] Owner confirms visuals and camera feel in a browser (I can't screenshot in the sandbox)
- [ ] Phone performance check on a real device

## Milestone 2 checklist

- [x] REBUILT pack generated from cited measurements (`game-packs/rebuilt-2026/generate.mjs`, `SOURCES.md`)
- [x] Field, hubs, bumps, trenches, and tower placed from the official AprilTag layout and the arena chapter
- [x] 408 fuel staged in depots and the neutral zone, plus up to 8 preloaded per robot
- [x] Match periods and point values from manual Tables 6-2 and 6-4
- [x] `rebuilt-hub-shifts` mechanic matching manual Table 6-3, with the 3-second window and random tiebreak
- [x] Format additions found by building the pack: ridge obstacles, zones, spawn areas, preloads, goal recycling, mechanic hooks
- [x] Engine tests on the real pack: scoring and recycling, driving over a bump, trench height limit
- [x] Debug view can show the REBUILT field (`?pack=rebuilt` or press T)
- [ ] Tower climbing, ranking points, human players, fouls (need later milestones; listed in `SOURCES.md`)
- [ ] `maxExtension` value checked against rule R106

## Credit notes

- Measured costs from the owner (Kiro usage page): M0 = 17.52, M1 = 18.03, M2 = 38.64, carpet fix = 17.59. Estimates had been about 4x too high.
- Remaining estimates were rescaled to roughly 0.3x the originals: M3 ~90, M4 ~135, M5 ~50, M6 ~90, M7 ~60, M8 ~105. Budget 500-700 total for fix-up rounds.
- Use the measured cost to recalibrate later estimates.
- Switching to 3D raised the estimates for Milestones 1–5 and 8 by about 370 credits combined (see `docs/milestones.csv`). Milestone 4 changed the most, from about 300 to about 450.

## Log

- 2026-11-11: Created tracker and milestone sheet in the workspace.
- 2026-11-11: Completed Milestone 0. `npm run check` passes: formatting, typecheck for both workspaces, 3 tests, production build (JS 1.72 kB). Could not run a browser in the sandbox because server commands are blocked; verified the built HTML and assets instead. Open decisions: rendering library, physics library, license.
- 2026-11-11: Decided the game and bot creator are both fully 3D. Updated `docs/PLAN.md` (new "3D game and 3D creator" section and decision log), milestone descriptions and estimates, and the placeholder page text. Added `.gitattributes` so Windows checkouts keep LF line endings. Next: choose 3D physics and rendering libraries at the start of Milestone 1.
- 2026-11-11: Completed Milestone 1 under a 200-credit cap set by the owner. Added the 3D engine on Rapier's deterministic build, game pack format v1 with validation, robot rules, mechanic registry, seeded random numbers, and 23 tests. The scripted scoring test passes in both auto and teleop, and two runs with the same seed produce identical results. Deferred: tipping and extension checks. Next: Milestone 2, the REBUILT pack by hand.
- 2026-11-11: Added a temporary top-down debug view (owner request, outside the milestone plan). `npm run dev` now shows the demo arena running the real engine: a scripted robot collects six balls and scores them, or the owner can drive manually. Engine fixes found while building it: a robot can no longer recapture a ball in the same instant it releases it (0.5 s cooldown), and released balls are woken so they can't hang in midair. Known issue: the client bundle is 4.5 MB because this Rapier build embeds its WebAssembly; fix in Milestone 3 by loading the WebAssembly as a separate file. 24 tests pass.
- 2026-11-11: Completed Milestone 2. Built the REBUILT pack from the 2026 manual (through final Team Update 22), the WPILib AprilTag layout, the inspection checklist, and Team 6328's public field constants. Added the `rebuilt-hub-shifts` mechanic and the format features the season needed. Engine fixes: robots now slide up ramps (zero friction and rounded edges), and ridge bases sit slightly below the floor so robots don't catch on the toe. 36 tests pass. Not modeled yet: climbing, ranking points, human players, fouls. Next: Milestone 3, 3D rendering and driving.
- 2026-11-11: Carpet and surface materials (owner request). Fixed a bug where the floor forced at least 0.8 friction on every game piece, ignoring each piece's own value. Added a carpet material to the pack format (defaulting to the standard FRC carpet), wall and obstacle surfaces, geometric-mean combining for every contact, and rolling resistance for round pieces, which Rapier lacks. Carpet values are estimates; `docs/PACK_FORMAT.md` explains how to measure them. 42 tests pass.
- 2026-11-11: Completed Milestone 3. Replaced the top-down debug view with a Three.js 3D view of the REBUILT field: carpet, structures, goals, and up to ~456 instanced fuel, with a placeholder robot (real geometry comes with the bot creator in M4). Added three driver cameras cycled with Tab: chase (locked behind the robot, robot-relative driving), broadcast (behind the blue wall, follows the robot, eases the zoom in/out when crossing the alliance line, field-relative), and driver station 1-3 (eye height behind the wall, field-relative). Added keyboard, gamepad, and on-screen touch controls, a HUD, and a fixed-timestep loop that interpolates rendering. Split the bundle into app/three/physics chunks so physics loads in parallel; the physics chunk stays ~4.4 MB because Rapier's -compat build embeds its WASM. 47 tests pass (42 engine + 5 renderer). Could not screenshot in the sandbox (no display, servers and file:// blocked), so visuals are unverified by me; please check `npm run dev`. Next: Milestone 4, the bot creator, or Milestone 5, REEFSCAPE.
- 2026-11-11: Milestone 3 follow-up (owner feedback). Fixed the Tab camera-switch bug: Tab was moving browser focus off the canvas, so input stopped until the player clicked back in; the game now calls preventDefault on its keys. Changed the broadcast camera to a fixed point high above field center that only rotates to track the robot (it no longer follows behind the wall). Tuned the robot to feel like swerve: much quicker acceleration (~22 m/s^2) and a slower turn rate (2*pi rad/s, about one second per 360 degrees). 47 tests pass. Not done here (folded into Milestone 5): hub panels, the hub net that blocks illegal shots, and the human player station with fuel feeding.
- 2026-11-11: Broadcast camera reposition (owner feedback with a reference screenshot). Moved it to a fixed vantage point behind and above the blue alliance wall, centered on the field width, angled down toward the red end, matching REBUILD Simulator. It stays in one spot and pans both up/down and left/right to keep the robot framed; zoom still eases the pull-back and height at the alliance line. 47 tests pass.
- 2026-11-11: Noted out-of-bounds re-entry in the Milestone 5 scope (owner question). Created docs/milestone-5-scope.md collecting everything folded into Milestone 5: cylinder pieces, rotated goals, hub panels and net, human player station, and referee-style out-of-bounds re-entry. No code changes. Raised the M5 estimate to ~90 for the added scope.
- 2026-11-11: Reworked the milestone list (owner request). Added "application shell and presentation" as the new Milestone 6: main menu, a game picker that selects a built-in game or imports a new one (validated, data-only, stored in IndexedDB), setup/pause/post-match screens, routing, settings, website style, transitions, sound, and tutorial. It absorbs the old polish/kickoff milestone. The CAD pipeline and manual assist moved to 7 and 8. See docs/milestone-6-scope.md. Docs only.
- 2026-11-11: Gave rotation an acceleration/deceleration ramp like translation (owner request). Added optional maxAngularAcceleration to the robot spec (default 8*pi rad/s^2); the engine now ramps angular velocity toward its target instead of snapping, so turning eases in and out. The client robot uses 6*pi. Existing robots are unaffected via the default. 49 tests pass.
- 2026-11-11: Gave balls real rolling inertia (owner request, balanced version). The old rolling resistance decayed spin in lockstep with forward speed, so balls scrubbed instead of rolling. Now spin is left to Rapier's friction (the ball grips the carpet and spins up), and rolling resistance is only a gentle translation drag, so balls roll slower but coast much farther. Lowered the default carpet rolling resistance to 0.05. Balls still settle and sleep below a crawl, so a field full of fuel stays cheap (tested: a ball is at rest within 10 s). 50 tests pass.
- 2026-11-13: Milestone 5 completed by a second Kiro account and merged to GitHub (commit ed4cc27); reviewed and accepted here. Added the REEFSCAPE 2025 pack (99 obstacles, 88 goals, cylinder coral + sphere algae, 4 coral stations) and the format features it needed: rotated obstacles/goals/pieces (WPILib Rotation3d), cylinder pieces, goal capacity, one-sided obstacles (contact filter), human player stations with a timed feed input, and out-of-bounds re-entry. REBUILT gained angled hub funnel panels, a one-sided net, outpost human-player stations, and the manual's exit-point out-of-bounds rule. 73 engine + 6 client tests pass. Full notes in docs/workstreams/reefscape.md. Still approximate (flagged there): reef interior, stub lengths, trough, barge, coral-station guesses, and the hub panel/net geometry; recheck against the official 2025 field drawings. Load it in the browser with ?pack=reefscape. Next: Milestone 4 (bot creator) or Milestone 6 (app shell).
- 2026-11-13: Wrote docs/milestone-4-scope.md (bot creator). Records the mechanism-category pipeline so one creator serves shooters and pick-and-place games (validated against Recycle Rush, Crescendo, Rebuilt, Reefscape), and the indexing-time model: a state machine with per-component timers derived from each mechanism's properties and design modifiers (agitation, floor shape, capacity, jam chance), e.g. Team 2910 Reblitz's solid-floor hopper + fold-in roller feeds faster. Not physics of pieces moving through the robot, and the creator does not read CAD. Docs only.
