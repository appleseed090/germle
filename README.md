# Germle

A daily outbreak puzzle. Live at [germle.com](https://germle.com) once deployed.

Each day every player gets the same small social network. Spend a handful of vaccines to cut it
into pieces, then contain an outbreak by quarantining healthy people — every quarantine costs a
day of spread. Your score is the share of people who never got infected.

Germle is an original game inspired by Vax! (2014) by Ellsworth Campbell and Isaac Bromley of the
Salathé Group at Penn State. It shares none of Vax!'s code or artwork.

## Status

Milestone M1: the game engine (`src/engine/`) is complete and tested; the site still shows a
placeholder. See `TODO.md` for what comes next.

## Prerequisites

- Node.js 24 (the version in `.node-version`; Node 22.12+ also works locally)
- npm (lockfile committed)

## Commands

| Command           | What it does                                                |
| ----------------- | ----------------------------------------------------------- |
| `npm ci`          | Install exact dev dependencies                              |
| `npm run dev`     | Vite dev server with hot reload                             |
| `npm run check`   | Typecheck + lint + format check + unit tests + build (gate) |
| `npm run build`   | Production build into `dist/`                               |
| `npm run preview` | Serve the built `dist/` locally                             |
| `npm run format`  | Rewrite files with Prettier                                 |

`npm run check` must pass before every commit; CI runs the same script on every push and PR.

## Architecture

- **Stack:** Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), vanilla DOM and inline SVG. No runtime dependencies.
- **Hosting:** Cloudflare Pages, static files only, built from `main`. No backend, no accounts;
  player state lives in `localStorage`. Security and cache headers are in `public/_headers`.
- **Engine:** `src/engine/` is pure TypeScript with no DOM access: seeded streams, the
  Watts–Strogatz network, layout, game rules and scoring. Its rules are specified in
  `docs/ENGINE.md`; unit tests sit next to each module (`*.test.ts`).
- **Docs:** `AGENTS.md` (engineering rules), `DECISIONS.md` (why things are the way they are),
  `TODO.md` (backlog), `DEPLOY.md` (Cloudflare and DNS setup).

## Deployment

Push to `main`; Cloudflare Pages runs `npm run build` and publishes `dist/`. First-time setup is a
checklist in `DEPLOY.md`.

© 2026 Jonathan Liu
