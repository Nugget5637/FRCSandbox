# FRC Sandbox

A single-player browser game for building FRC-style robots from modular parts and testing them on swappable season "game packs." REBUILT (2026) will be the first pack.

> **Status:** Milestone 0 (project skeleton). There is no gameplay yet. See [PROGRESS.md](PROGRESS.md).

## Getting started

Requires [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev
```

Then open the URL that Vite prints. You should see a placeholder field and a status line showing the engine version and whether your browser supports WebGL2.

Other commands:

```bash
npm test          # run tests once
npm run typecheck # type-check all packages
npm run build     # production build into apps/client/dist
npm run check     # everything CI runs
```

## Project layout

```text
packages/sim/   headless simulation engine (no DOM access)
apps/client/    browser app: rendering, input, UI, bot creator
docs/PLAN.md    architecture, conventions, and decisions
PROGRESS.md     milestone status and work log
```

Read [docs/PLAN.md](docs/PLAN.md) before contributing.

## Disclaimer

FRC Sandbox is an independent project. It is not affiliated with, sponsored by, or endorsed by FIRST®. FIRST® and FIRST® Robotics Competition are registered trademarks of FIRST.
