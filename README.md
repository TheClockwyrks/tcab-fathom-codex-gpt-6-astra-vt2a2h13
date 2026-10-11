# Fathom

**Hunt in the dark.** Fathom is a bioluminescent deep-sea maze chase. Graze plankton to grow your light, map winding corridors with sonar, and escape three predators that hunt by light, sound, and sudden flares.

The Kindle dive remembers explored terrain, but shows it only through a circular window that grows as you eat. Your glow helps you navigate and gives the hunters something to follow. Clear every mote to descend; each deeper maze adds hunters and shortens your sonar's reach.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser; no account, backend, or external service is needed.

## Production

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`, with `index.html` at its root. Serve that directory at a website root or under a sub-path; its scripts and art use relative URLs.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Swim while held; up/down select menu items |
| Space | Sonar; also confirms a menu selection |
| Shift | Release ink |
| Enter | Confirm a menu selection |
| Escape / P | Pause or resume |
| Escape | Back from menus |
| M | Toggle sound |
| Backtick | Engine diagnostics |

Menus also accept pointer and touch. Touch movement and ability controls appear when using a touchscreen. Sonar and ink are unlimited, with cooldowns. Sonar exposes sound hunters but also tells them where you are. Ink blinds light hunters, while the Gloamfin hears straight through it. Three reserve lives give you four attempts.

## Development checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests drive the actual Simple 2D engine with a scripted clock and native canvas. The simulation uses 120 fixed ticks per second and value-owned state; `engine.debug` provides validated poses and JSON snapshots for scenarios. The supplied engine and game specifications are in `engine/` and `specs/`. The player-facing presentation and captured media are in `showcase/`.
