# FRC Sandbox: progress tracker

This file is the source of truth for project status. Each work session updates the status table and appends a dated entry to the log. Import [docs/milestones.csv](docs/milestones.csv) into Google Sheets (File → Import) whenever you want the spreadsheet to match this file.

**Scope:** single-player browser sandbox. Multiplayer is out of scope.
**Status values:** Not started, In progress, Blocked, Done

## Milestone status

| #   | Milestone                  | Status      | %   | Last updated | Note                           |
| --- | -------------------------- | ----------- | --- | ------------ | ------------------------------ |
| 0   | Project skeleton & plan    | Done        | 100 | 2026-11-11   | Tooling, CI, plan, steering    |
| 1   | Core engine & pack format  | Not started | 0   | —            | Next up; 3D physics from start |
| 2   | REBUILT pack (by hand)     | Not started | 0   | —            | De-risks the format            |
| 3   | 3D rendering & driving     | Not started | 0   | —            | First phone performance test   |
| 4   | 3D bot creator mode        | Not started | 0   | —            | Core player experience         |
| 5   | Second pack (by hand)      | Not started | 0   | —            | Proves the template idea       |
| 6   | CAD pipeline               | Not started | 0   | —            | After the format is proven     |
| 7   | Manual-reading assist      | Not started | 0   | —            | Human-verified drafts          |
| 8   | Polish & kickoff readiness | Not started | 0   | —            | Polish last                    |

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

## Credit notes

- Milestone 0 estimate was about 40 credits. Record the measured cost from the Kiro usage page here: ______
- Use the measured cost to recalibrate later estimates.
- Switching to 3D raised the estimates for Milestones 1–5 and 8 by about 370 credits combined (see `docs/milestones.csv`). Milestone 4 changed the most, from about 300 to about 450.

## Log

- 2026-11-11: Created tracker and milestone sheet in the workspace.
- 2026-11-11: Completed Milestone 0. `npm run check` passes: formatting, typecheck for both workspaces, 3 tests, production build (JS 1.72 kB). Could not run a browser in the sandbox because server commands are blocked; verified the built HTML and assets instead. Open decisions: rendering library, physics library, license.
- 2026-11-11: Decided the game and bot creator are both fully 3D. Updated `docs/PLAN.md` (new "3D game and 3D creator" section and decision log), milestone descriptions and estimates, and the placeholder page text. Added `.gitattributes` so Windows checkouts keep LF line endings. Next: choose 3D physics and rendering libraries at the start of Milestone 1.
