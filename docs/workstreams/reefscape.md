# Workstream: Milestone 5, REEFSCAPE pack and format features

Status: done, pending owner review. Date: 2026-11-13. `npm run check` passes (73 engine tests, 6 client tests, production build).

`PROGRESS.md` and `docs/milestones.csv` were not edited, at the owner's request. The owner can copy the status and log entry from this file.

## What was built

- **REEFSCAPE pack** in [`game-packs/reefscape-2025/`](../../game-packs/reefscape-2025/): `generate.mjs` (every measurement cited), the generated `pack.json`, and [`SOURCES.md`](../../game-packs/reefscape-2025/SOURCES.md). Run `npm run packs:reefscape` to regenerate. Contents: two reefs (hexagonal base and core, 24 angled L2/L3 stubs and 12 L4 sections each, a trough goal per face, a one-coral goal at each of the 36 branch ends), processors, nets, the barge trusses and center support, 6 deep cages, 4 coral stations as human player stations (114 coral), 6 coral and 18 algae staged, 1 coral preload per robot, AUTO 15 s and TELEOP 135 s, the Table 6-2 point values, and the 2025 robot rules.
- **REBUILT updates** (`npm run packs:rebuilt`): four angled funnel panels inside each hub, the one-sided net behind each hub, both outposts as human player stations with 24 fuel each, and the manual's out-of-bounds rule. The hub goal moved down into the funnel throat, so fuel that lands on a panel slides in and scores.
- **Tests**: [`packs/reefscape.test.ts`](../../packages/sim/src/packs/reefscape.test.ts) (pack loads; field size, staging counts, point values, and robot rules match the manual; staged pieces stay put; coral scores in the L1 trough in AUTO; coral scores on an L2 branch and the branch then refuses a second coral, with a control run that proves the second shot reaches it; human player feeds coral). [`format.test.ts`](../../packages/sim/src/format.test.ts) covers each format feature on the small test arena. `rebuilt.test.ts` gained net, funnel, outpost, and out-of-bounds tests. A renderer test builds the REEFSCAPE scene.
- **Client**: the renderer draws rotated obstacles and goals, one instanced mesh per piece type (cylinders for coral), and see-through one-sided obstacles. `?pack=reefscape` loads the 2025 field. H holds the human player feed for the player's alliance. The HUD hub line only shows for packs with four or fewer goals. I could not view the result in a browser from the sandbox, so visuals are unverified.

## Format changes

All are optional, so existing packs load unchanged. Details are in [`docs/PACK_FORMAT.md`](../PACK_FORMAT.md).

| Feature                        | Where                                                                                                                 | Notes                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Rotations                      | `rotation: [roll, pitch, yaw]` on obstacle shapes, goal boxes, piece spawns, and piece exits                          | WPILib `Rotation3d` convention, so team field code (pitch −35° for an L2 branch) copies over directly                         |
| Cylinder pieces                | `{ kind: "cylinder", radius, length }`, axis along local z                                                            | Solid, not hollow. Released cylinders point along the launch direction. Rolling resistance applies when lying on their side   |
| Goal capacity                  | `goal.capacity`                                                                                                       | Found while building the reef: without it a branch would score any number of coral                                            |
| One-sided obstacles            | `obstacle.oneSided.normal`                                                                                            | Blocks bodies whose center is on the normal's side. Implemented with a Rapier contact filter                                  |
| Human player stations          | `humanPlayerStations[]` with `supply`, `feedSeconds`, `exit`; fed through `sim.step(robots, { stationId: { feed } })` | Feeding is an input, so replays stay deterministic. New piece state `station`, event `pieceFed`, snapshot `stations`          |
| Out-of-bounds re-entry         | `field.outOfBounds: { mode, delaySeconds, zones }`                                                                    | Modes `nearestEdge` (default, 2 s), `zone`, `exitPoint`. New state `outOfBounds`, events `pieceLeftField` and `pieceReturned` |
| Piece orientation in snapshots | `PieceSnapshot.rotation`                                                                                              | Needed to draw coral                                                                                                          |

## Problems found

- **Rapier ignores physics hooks without an event queue.** `world.step(undefined, hooks)` never calls the contact filter. The engine now keeps one `EventQueue` and passes it with the hooks. Found by a failing one-sided test.
- **Feed timing lost a tick per piece.** The next feed only started on the step after a piece was fed, so a 0.25 s feed produced one piece every 16 ticks instead of 15. Fixed by starting the next piece in the same step.
- **Mirroring rotated shapes.** Copying blue geometry to red by mirroring positions alone left angled shapes tilted the wrong way. Both generators now add π to the yaw of red copies.
- **Manual wording on cage heights** (2025 manual 5.4.1) reads backwards: it pairs shallow with 3½ in. Deep cages hang lower on chain, and Team 6328's measurements agree. Details in REEFSCAPE `SOURCES.md`.
- **"12 ft from the alliance wall"** (2025 manual 5.3) is the reef's near face, not its center.
- **Out-of-bounds mode for both packs.** The scope suggested nearest edge as the realistic choice, but both manuals (section 6.8) say field staff return pieces "approximately at the point of exit", so both packs use `exitPoint` with a 3 s delay. `nearestEdge` stays the engine default for packs that don't say.
- **Coral station supply** can't "split evenly": 57 per alliance gives 29 and 28.
- **frcmanual.com** does not state which 2025 Team Update its text includes.
- **Hub panel and net geometry** is not in the 2026 manual text. Net position, top, and width come from dimensions printed on the hub drawing; the funnel throat size and net bottom were scaled from that drawing, which says not to scale it.

## Decisions

Recorded in the `docs/PLAN.md` decision log (2026-11-13): WPILib rotation convention for packs, human player feeding as a step input, out-of-bounds default and per-pack choice, and one-sided obstacles through a contact filter.

## What's left

- Owner checks both fields in a browser (`npm run dev`, then `?pack=reefscape`), especially the reef, the hub funnel and net, and fed fuel and coral.
- Recheck REEFSCAPE against the final official 2025 manual PDF and Team Updates; replace the reef interior, stub lengths, trough, barge, and coral station guesses with official drawing values.
- Not modeled, as scoped: cage and tower climbing, parking and LEAVE, ranking points and Coopertition, fouls and position rules, real swerve.
- Format gaps for later (also listed in `PACK_FORMAT.md`): scored pieces staying visible on their branch, contact-based scoring and de-scoring, goals that hand pieces to a human player (processor to net), human player throws, REBUILT corral delivery.
- The client only drives one blue robot and feeds blue stations. A pack picker belongs to Milestone 6.
