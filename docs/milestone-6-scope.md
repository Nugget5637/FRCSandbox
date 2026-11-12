# Milestone 6 scope: application shell and presentation

Everything around the match, not the match itself. This turns the tech demo into a product that feels like a game: menus, a game picker, visual style, settings, and the flow that connects every screen. It absorbs the old "polish and kickoff readiness" milestone.

Build it after Milestones 4 (bot creator) and 5 (REEFSCAPE), because its screens wrap around features that must exist first, and the game picker is only useful once there is more than one game.

This is the largest milestone. Expect careful scoping and a credit cap when it starts, and the most feedback rounds, because it is mostly UI.

## Screens and flow

- Main menu / home screen instead of loading straight into a match.
- Game picker (see below).
- Setup screen: choose game, robot (from the bot creator), and alliance.
- In-match pause menu: resume, restart, change camera, back to menu.
- Post-match screen: final score, an engineering/stats summary, play again or return.
- Navigation between screens, with the browser back button and deep links behaving sensibly.

## Game picker (select built-in or import)

One screen that lists every available game. A game is a game pack, whether built in or imported, so this has one job (choose a pack) with two sources.

- **Built-in packs** bundled at build time (REBUILT, REEFSCAPE), shown from a small registry: id, name, season, thumbnail.
- **Imported packs** the user adds from a file.
  - Start with a single `pack.json` file (data only).
  - Move to a zipped `.frcpack` (pack plus assets like field meshes) once Milestone 7 produces packs with meshes; unzip in the browser.
  - Store imported packs in IndexedDB so they persist and appear beside built-in ones, tagged "imported."
  - Per imported pack: delete, and optionally export to share.

### Safety (non-negotiable)

Imported packs are untrusted. They must pass the same `loadGamePack()` validation that already exists, and must never run code (packs are data; this is an existing plan rule). On failure, show the list of problems and refuse the import. Check `formatVersion` and refuse packs made for an incompatible format version with a clear message.

## Website functions

- Routing, so each screen has a URL and the back button works.
- Persistent settings: control bindings, camera preference, graphics quality, volume.
- Local storage of imported packs and saved robots (builds on IndexedDB).
- Share links for packs and robots.
- A landing page explaining the project, with the "not affiliated with FIRST" disclaimer.
- Static-site deployment plus offline support after first load.

## Website style

- Consistent visual design: colors, typography, buttons, layout, restyled HUD.
- Responsive layout for desktop and phone.
- Loading screens (the physics chunk is large, so a real loading state matters).
- Accessibility basics: keyboard navigation, readable contrast, sensible focus handling.

## Game feel

- Smooth transitions between screens.
- Sound: menu clicks, match start, scoring, buzzer, behind a mute toggle.
- Tutorial and onboarding (from the old polish milestone).
- Kickoff checklist (from the old polish milestone): download CAD, convert, label, draft rules, verify, playtest, publish.

## Depends on

- Milestone 4 for robot selection and the bot creator.
- Milestone 5 for a second game, so the picker has a real choice.
