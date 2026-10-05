# Germle

A daily outbreak puzzle. Live at [germle.com](https://germle.com).

Each day every player gets the same small social network. Spend a handful of vaccines to cut it
into pieces, then contain an outbreak by quarantining healthy people — every quarantine costs a
day of spread. Your score is the share of people who never got infected.

Germle is an original game inspired by Vax! (2014) by Ellsworth Campbell and Isaac Bromley of the
Salathé Group at Penn State. It shares none of Vax!'s code or artwork; see `CREDITS.md` for the
licensing notice.

## Status

Milestone M3: the daily game at `/` (with stats and sharing), practice mode at `/practice`
and the About page at `/about`. See `TODO.md` for the backlog.

## Prerequisites

- Node.js 24 (the version in `.node-version`; Node 22.12+ also works locally)
- npm (lockfile committed)

## Commands

| Command                   | What it does                                                |
| ------------------------- | ----------------------------------------------------------- |
| `npm ci`                  | Install exact dev dependencies                              |
| `npm run dev`             | Vite dev server with hot reload                             |
| `npm run check`           | Typecheck + lint + format check + unit tests + build (gate) |
| `npm run build`           | Production build into `dist/`                               |
| `npm run preview`         | Serve the built `dist/` locally                             |
| `npm run format`          | Rewrite files with Prettier                                 |
| `npm run e2e`             | Playwright smoke tests against `dist/` (build first)        |
| `npm run generate:images` | Re-render favicons, app icons and `og.png` into `public/`   |

`npm run check` must pass before every commit; CI runs the same script on every push and PR, plus
the Playwright tests in a second job (daily and practice smoke tests on a phone and a desktop
viewport). Playwright needs a Chromium build: run
`npx playwright install chromium` once (the version is pinned in `package.json`).

## Architecture

- **Stack:** Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), vanilla DOM and inline SVG. No runtime dependencies.
- **Hosting:** Cloudflare Workers static assets (an assets-only Worker, no script), built from
  `main` by Workers Builds; config in `wrangler.jsonc`. No backend, no accounts;
  player state lives in `localStorage`. Security and cache headers are in `public/_headers`.
- **Engine:** `src/engine/` is pure TypeScript with no DOM access: seeded streams, the
  Watts–Strogatz network, layout, game rules and scoring. Its rules are specified in
  `docs/ENGINE.md`; unit tests sit next to each module (`*.test.ts`).
- **UI:** `src/pages/` holds one entry per page; `src/ui/` the SVG board (rendering, hit
  testing, drag, animations), dialogs and toolbar; `src/share.ts`, `src/stats.ts`,
  `src/storage.ts`, `src/practice-setup.ts` and `src/verdict.ts` are pure, tested modules for the
  share card, statistics, validated `localStorage` access, practice links and the
  Contained/Spread verdict. Page shells are plain HTML (`index.html`, `about.html`) so nothing shifts
  while scripts load.
- **Docs:** `AGENTS.md` (engineering rules), `DECISIONS.md` (why things are the way they are),
  `TODO.md` (backlog), `DEPLOY.md` (Cloudflare and DNS setup).

## Deployment

Push to `main`; Workers Builds runs `npm run build`, then `npx wrangler deploy` publishes `dist/`. First-time setup is a
checklist in `DEPLOY.md`.

© 2026 Jonathan Liu
