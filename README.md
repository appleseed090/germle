# Germle

A daily outbreak puzzle. Live at [germle.com](https://germle.com).

Each day every player gets the same small social network. Spend a handful of vaccines to cut it
into pieces, then contain an outbreak by quarantining healthy people — every quarantine costs a
day of spread. Your score is the share of people who never got infected.

Germle is an original game inspired by Vax! (2014) by Ellsworth Campbell and Isaac Bromley of the
Salathé Group at Penn State. It shares none of Vax!'s code or artwork; see `CREDITS.md` for the
licensing notice.

## Status

Milestone M3: the daily game at `/` (with stats and sharing), the archive of past puzzles at
`/archive` (each played at `/?puzzle=<n>`), practice mode at `/practice` (with Easy, Medium and
Hard presets) and the About page at `/about`. From M4, finished daily games are compared
anonymously with everyone who played the same puzzle. See `TODO.md` for the backlog.

## Prerequisites

- Node.js 24 (the version in `.node-version`; Node 22.12+ also works locally)
- npm (lockfile committed)
- Only to run the API locally: Wrangler through `npx wrangler` (downloaded on first use, never a
  dependency)

## Commands

| Command                   | What it does                                                |
| ------------------------- | ----------------------------------------------------------- |
| `npm ci`                  | Install exact dev dependencies                              |
| `npm run dev`             | Vite dev server with hot reload                             |
| `npm run check`           | Typecheck + lint + format check + unit tests + build (gate) |
| `npm run build`           | Production build into `dist/`                               |
| `npm run preview`         | Serve the built `dist/` locally                             |
| `npm run format`          | Rewrite files with Prettier                                 |
| `npm run e2e`             | Playwright tests against `dist/` (build first)              |
| `npm run generate:images` | Re-render favicons, app icons and `og.png` into `public/`   |

To run the site with its API and a local database: `npm run build`, then
`npx wrangler d1 migrations apply germle --local` once, then `npx wrangler dev`. `npm run dev`
and `npm run preview` serve the pages only, so the community comparison stays hidden there.

`npm run check` must pass before every commit; CI runs the same script on every push and PR, plus
the Playwright tests in a second job (daily and practice smoke tests on a phone and a desktop
viewport). `vite preview` serves the headers from `public/_headers`, so the end-to-end tests run
under the production Content-Security-Policy and fail on any violation. Playwright needs a
Chromium build: run `npx playwright install chromium` once (the version is pinned in
`package.json`).

## Architecture

- **Stack:** Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), vanilla DOM and inline SVG. No runtime dependencies.
- **Hosting:** Cloudflare Workers static assets plus a small Worker script, built from `main` by
  Workers Builds; config in `wrangler.jsonc`. `assets.run_worker_first` sends only `/api/*` to
  the script; every other path is served from `dist/` as before. No accounts; player state lives
  in `localStorage`. Security and cache headers for the pages are in `public/_headers`.
- **Community scores:** `worker/` answers `POST /api/results` and `GET /api/standing`. The page
  sends a finished daily game's moves with a random player ID; the Worker rebuilds the puzzle,
  replays the moves with the same engine, stores only the puzzle number, player ID, score and
  time in a Cloudflare D1 database (schema in `migrations/`), and answers anonymous numbers.
  Validation and counting are pure functions behind a `ResultsStore` interface;
  `d1-results-store.ts` is the thin D1 adapter. `src/community-api.ts` is the wire format both
  sides share. Worker code has its own `tsconfig.worker.json` (no DOM types).
- **Engine:** `src/engine/` is pure TypeScript with no DOM access: seeded streams, the
  Watts–Strogatz network, layout, game rules and scoring. Its rules are specified in
  `docs/ENGINE.md`; unit tests sit next to each module (`*.test.ts`).
- **UI:** `src/pages/` holds one entry per page; `src/ui/` the SVG board (rendering, hit
  testing, drag, animations), dialogs, disclosure buttons and toolbar; `src/share.ts`,
  `src/stats.ts`, `src/storage.ts`, `src/archive.ts`, `src/practice-setup.ts`,
  `src/puzzle-summary.ts`, `src/verdict.ts` and `src/community.ts` are tested modules for the
  share card, statistics, validated `localStorage` access, archive links and listing, practice
  links, the one-line puzzle summary, the Contained/Spread verdict and the community comparison
  (its API client takes `fetch` as a parameter). Page shells are plain HTML
  (`index.html`, `archive.html`, `practice.html`, `about.html`) so nothing shifts while scripts
  load.
- **Themes:** every colour is a CSS token in `src/styles/main.css`. The dark theme overrides them
  when the device prefers dark, or when the player picks Dark in Settings (`src/theme.ts` sets
  `data-theme` on `<html>`). A saved choice is applied before the first paint by
  `src/theme-before-paint.ts`, which a small plugin in `vite.config.ts` builds into a
  content-hashed classic script, since the CSP forbids inline scripts. `src/styles/theme.test.ts`
  checks contrast in both themes.
- **Docs:** `AGENTS.md` (engineering rules), `DECISIONS.md` (why things are the way they are),
  `TODO.md` (backlog), `DEPLOY.md` (Cloudflare and DNS setup).

## Deployment

Push to `main`; Workers Builds runs `npm run build`, applies any new database migrations, then
`npx wrangler deploy` publishes `dist/` and the Worker. First-time setup is a checklist in
`DEPLOY.md`; the community scores need the database steps there before this branch is merged.

© 2026 Jonathan Liu
