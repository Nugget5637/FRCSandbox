# Milestone 4 scope: 3D bot creator

The Trailmakers-style builder, plus the robot model it produces and real swerve. This is the mode players spend the most time in, and the most design- and feedback-heavy milestone. Expect a credit cap and several rounds of "the feel is wrong" when it starts.

## Design principle

The creator is built around **mechanism categories composed into a game-piece pipeline**, not around hardcoded robot types. One creator must serve shooters and pick-and-place games alike. Validated against four reference games:

- Recycle Rush 2015: pure pick-and-place (stack totes/bins, cap with a noodle). No aiming goal.
- Crescendo 2024: shooter (speaker) and place (amp) and climb.
- Rebuilt 2026: shooter (hub) and climb.
- Reefscape 2025: place at precise height and angle (coral on angled branches, algae in processor).

A robot is a chain: intake -> transport/storage -> position (arm/elevator/wrist) -> deliver (shoot or place) -> optional climber. Same blocks, different arrangement.

## Mechanism categories

| Category               | Covers                             | Delivery type                  |
| ---------------------- | ---------------------------------- | ------------------------------ |
| Drivetrain             | tank, mecanum, swerve              | -                              |
| Intake                 | ground, over-bumper, floor grabber | -                              |
| Transport / storage    | conveyor, indexer, hopper          | -                              |
| Elevator / arm / wrist | reach a height and angle           | positions a gripper or shooter |
| Gripper / claw         | hold and place precisely           | place                          |
| Shooter                | launch at speed and angle          | shoot                          |
| Climber / hook         | endgame                            | -                              |

## Indexing time: derived, not fixed, and not physics

How long a piece takes to travel intake -> ready is a **state machine with per-component timers**, NOT soft-body physics of a piece moving through the robot (too slow, unstable, unpredictable). Real physics only resumes once a piece is shot or placed.

But a fixed timer per component is too blunt: it makes every hopper identical and rewards no optimization. So each transport component **computes** its timing from its own properties, with modifiers for design choices. Example, a hopper feeding a shooter:

- Base feed rate from hopper size, floor shape, and feed-opening size.
- Agitation modifier: an active feeder (fold-in intake roller, kicker, floor belt) feeds faster and jams less than a passive hopper.
- Floor modifier: a solid shaped floor funnels pieces to the exit; a flat or net floor is slower and more variable.
- Capacity pressure: a fuller hopper feeds faster but is heavier.
- Jam probability: rises with feed rate, falls with agitation; a jam costs time.

Reference case, Team 2910 "Reblitz" (Rebuilt 2026): a solid-floor hopper plus a fold-in intake roller that pushes fuel toward the shooter. In the model this is `agitation: active` + `floor: shaped-solid`, which yields a shorter, steadier time-to-next-shot than a passive net hopper. The player earns this by choosing those options.

Limits, state them plainly to users:

- The model captures the EFFECT of a design choice (a property that sets a modifier), not a physically simulated mechanism. "Fold-in roller" is an option a player selects, not geometry the creator deduces.
- The creator does NOT read CAD/Onshape files or infer a design from geometry. That is CAD understanding, out of scope.
- The modifier magnitudes are tuning values set here and adjusted in playtesting, not measured truth.

## Placement vs shooting

- Shooting is easier: launch the piece at a speed and angle, physics flies it. Build this first (proves Rebuilt, Crescendo speaker).
- Placing is harder: the piece stays attached to the gripper and ends at the position/orientation the arm put it (proves Reefscape, Recycle Rush). Build this second.

## Scoring is the pack's job, not the creator's

The creator builds the robot; whether a placed/shot piece scores is up to the pack. Reefscape angled-branch scoring and goal capacity already exist. Some games need scoring rules the format lacks (for example Recycle Rush stack height). Add those to the format per game, as with REEFSCAPE. The creator's mechanisms are universal; some packs need new scoring rules.

## Real swerve

Replaces the current velocity-driven box. Per-corner swerve modules read from the built robot's layout (wheelbase, module positions, gear ratio, motor). Also brings contact-based movement (raycast wheels: a module only drives when its ray hits a surface) and force-based pushing, both deferred here from earlier. This is why swerve waited for the creator: it needs the robot design the creator defines.

## Build order

1. Robot blueprint data model and the compile step (blueprint -> rigid bodies + joints), replacing the fixed RobotSpec.
2. 3D grid builder: placement, 24 orientations, snapping, ghost preview, mirror mode.
3. Drivetrain + real swerve, with contact-based movement.
4. Intake + transport with derived indexing timers.
5. Shooter delivery (Rebuilt, Crescendo speaker).
6. Arm / elevator / wrist / gripper placement (Reefscape, Recycle Rush).
7. Climber.
8. Live overlays (weight, center of mass, tipping, frame perimeter, extension), save/load, share.

## Depends on / coordination

- Needs Milestones 1 and 3 (done).
- Heavily rewrites `apps/client/` and the robot model in `packages/sim/`. Whoever builds this must be the only one touching the client and robot/engine code until it merges. Safe to run in parallel: the manual-assist tool (M8), CAD conversion (part of M7), and a part-data library.
- Unlike Milestone 5, this is not a clean fire-and-review delegation: it is feel-heavy and wants live iteration. If delegated to another account, review its patch carefully because it rewrites the robot core everything depends on.
