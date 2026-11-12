---
inclusion: always
---

# FRC Sandbox steering

- Before starting work, read `docs/PLAN.md` and `PROGRESS.md`. Follow the session protocol in `docs/PLAN.md` section 7.
- Multiplayer is out of scope. Do not add networking, rooms, or server code.
- The game and the bot creator are both fully 3D. Do not build 2D-only systems or assume a flat world in the engine.
- `packages/sim` must not use DOM or browser APIs or import from `apps/`.
- Use SI units and WPILib field coordinates in code and pack data.
- Game packs are data only. Never make a pack execute code.
- `npm run check` must pass before a task is reported as done.
- Do not commit, push, or open pull requests on the GitHub repository. Produce a `git format-patch` file authored by the repository owner and give the owner the commands to apply it.
- After finishing work, update `PROGRESS.md` (status, percentage, date, log entry) and `docs/milestones.csv` if values changed. Record new decisions in the decision log in `docs/PLAN.md`.
