# FRC Sandbox: project plan

**Read this file and [PROGRESS.md](../PROGRESS.md) at the start of every work session.** They are the shared memory for anyone (human or agent) working on this project. Update them when a decision changes.

## 1. What this is

A single-player browser game for building FRC-style robots from modular parts and testing them on a field. The engine knows nothing about any particular season. Each season is a swappable **game pack** (field, game pieces, match timing, scoring, robot rules). REBUILT (2026) is the first pack. When a new game is released, a new pack is added and robots carry over between packs.

The goal is fast concept prototyping: comparing robot architectures and seeing design tradeoffs (weight, center of mass, current draw, geometry, cycle time). It is not CAD, not an inspection tool, and not a predictor of exact real-world performance.

## 2. Scope

### In scope

- Season-agnostic simulation engine
- Game pack format, with REBUILT as the first pack
- Browser rendering and driving (keyboard, gamepad, touch)
- Trailmakers-style bot creator with live legality and physics overlays
- Tools that speed up making new packs (CAD import, labeling, manual-reading assist)

### Out of scope

- **Multiplayer.** Explicitly excluded. Do not add networking, rooms, or server code.
- Full engineering simulation (individual wiring, per-device sensors). Sensors and wiring are implied by placing a mechanism. A detailed mode may be added later for one subsystem (likely the turret) as an opt-in experiment.
- CAD-grade geometry or official rule compliance checks.

### Level of detail in the bot creator

Include a detail only if it creates a player decision with a visible consequence.

- **Include:** motor choice, gear ratio, weight, center of mass, total current draw, storage capacity, turret rotation range, aiming mode.
- **Abstract away:** beam breaks, limit sensors, named electrical components, individual wires. The engine already knows piece state and enforces limits.

## 3. Architecture

```text
packages/
  sim/        Headless engine. No DOM, no rendering, no browser APIs.
              Fixed-timestep loop, robot and game-piece state, scoring, rules.
  (planned)   content/  game pack schemas and loaders (Milestone 1)
apps/
  client/     Browser app: rendering, input, UI, bot creator.
game-packs/   (planned, Milestone 2) one folder per season
tools/        (planned, Milestones 6-7) CAD pipeline, labeling, manual assist
```

### Boundary rules

1. `packages/sim` must never import from `apps/` or use DOM APIs. Its `tsconfig.json` omits the DOM library, so a violation fails `npm run typecheck`.
2. Anything that affects a score or match result lives in `sim`, not the client.
3. Game packs are **data**, never executable code. Season-specific mechanics that data cannot express become reviewed **mechanic modules** in the engine, enabled by name from a pack.
4. The client reads simulation state. It never mutates it except by sending inputs.

### Simulation model

- Fixed timestep at 60 Hz (`SIM_STEP_SECONDS`). Rendering interpolates between steps.
- Seeded randomness only, so a match can be replayed from its inputs and seed.
- Robots compile from a blueprint into a small number of rigid bodies joined by joints.
- Game pieces inside a robot use a state machine (captured, transported, stored, ready, released), not contact physics. Real physics applies only after release.
- Drivetrains use a raycast-and-traction model rather than physical wheel cylinders.
- Visual-only details (e-chains, wires) never enter the physics simulation.

## 4. Conventions

- **Language:** TypeScript, strict mode, ES modules.
- **Units:** SI everywhere in code and pack files: meters, kilograms, seconds, radians. Convert to inches or degrees only for display.
- **Field coordinates:** match WPILib's field convention so data from robot code and tools maps directly. Origin at the blue alliance wall corner, +x toward the red alliance, +y to the left when standing behind the blue wall, +z up. Angles are counterclockwise-positive.
- **Formatting:** Prettier (`npm run format`). CI fails on unformatted files.
- **Tests:** Vitest, colocated as `*.test.ts`. Engine behavior needs tests; UI code needs them where practical.
- **Naming:** packages are `@frcsandbox/<name>`.

## 5. Tooling and commands

Requires Node.js 22 or newer (see `.nvmrc`).

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm install`       | Install dependencies                                     |
| `npm run dev`       | Start the client dev server                              |
| `npm run build`     | Production build of the client into `apps/client/dist`   |
| `npm run preview`   | Serve the production build locally                       |
| `npm run typecheck` | Type-check every workspace                               |
| `npm test`          | Run all tests once                                       |
| `npm run format`    | Format all files                                         |
| `npm run check`     | Format check, typecheck, tests, and build (what CI runs) |

Pinned tool versions at Milestone 0: TypeScript 7.0.2, Vite 8.3.8, Vitest 5.1.0, Prettier 3.10.0.

## 6. Contribution workflow

- The agent never commits to, pushes to, or opens pull requests on the GitHub repository. For each change it produces a `git format-patch` file in the workspace, authored as the repository owner, and the owner applies and pushes it.
- Work happens on branches and merges through pull requests once the repository is on GitHub.
- `npm run check` must pass before a change is considered done.
- If work is split across several accounts, one owner controls `packages/sim` interfaces and the pack format. Freeze those before parallel work begins. Each task should own its own folder.

## 7. Session protocol

1. Read this file and `PROGRESS.md`.
2. Work on one milestone, or one clearly bounded part of it.
3. Run `npm run check`.
4. Update `PROGRESS.md` (status, percentage, date, log entry) and `milestones.csv` if numbers changed.
5. Record any new decision in the decision log below.

## 8. Milestones

Full detail and status live in [PROGRESS.md](../PROGRESS.md) and [milestones.csv](milestones.csv).

| #   | Milestone                     | Depends on |
| --- | ----------------------------- | ---------- |
| 0   | Project skeleton and plan     | None       |
| 1   | Core engine and pack format   | 0          |
| 2   | REBUILT pack, built by hand   | 1          |
| 3   | Browser rendering and driving | 1, 2       |
| 4   | Bot creator mode              | 1, 3       |
| 5   | Second pack, built by hand    | 1          |
| 6   | CAD pipeline                  | 2, 5       |
| 7   | Manual-reading assist         | 2, 5       |
| 8   | Polish and kickoff readiness  | 4, 6, 7    |

Build packs by hand (2 and 5) before building tools that automate pack creation (6 and 7).

## 9. Decision log

| Date       | Decision                                                       | Reason                                                           |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2026-11-11 | Single-player only; no multiplayer                             | Owner's choice; removes the largest source of complexity         |
| 2026-11-11 | npm workspaces monorepo                                        | Built into Node; no extra package manager to install             |
| 2026-11-11 | TypeScript + Vite + Vitest + Prettier                          | Standard browser stack; fast builds; tests share Vite config     |
| 2026-11-11 | Engine has no DOM access, enforced by tsconfig                 | Keeps it testable headlessly and runnable in Web Workers         |
| 2026-11-11 | SI units and WPILib field coordinates                          | Avoids unit bugs; lines up with FRC robot code and tools         |
| 2026-11-11 | Game packs are data; new mechanics are reviewed engine modules | Downloaded packs must never run arbitrary code                   |
| 2026-11-11 | Relative Vite `base`                                           | Built site works on any static host path, including GitHub Pages |
| Open       | Rendering library (Three.js vs. Babylon.js)                    | Decide at Milestone 3                                            |
| Open       | Physics library (Rapier vs. Jolt)                              | Decide at Milestone 1 or 3, once engine needs are concrete       |
| Open       | License                                                        | Owner to choose before publishing                                |

## 10. Legal notes

- Not affiliated with or endorsed by FIRST. Say so in the README and the game.
- Link to official manuals rather than redistributing them. Check FIRST's terms before redistributing any meshes derived from field CAD.
- Ask permission before including real teams' robots or names.
