# CLAUDE.md

Read `AGENTS.md` first; its engineering rules apply to everything here. This file is the product
map: this repo builds **two separate products** from one engine. Never confuse them.
Germle Endless is built in stages (see `TODO.md`); a file named below appears when its stage
lands.

## The two products

|                          | **germle.com** (the daily puzzle)                                            | **Germle Endless** (CrazyGames portal build)                                 |
| ------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| What it is               | Daily puzzle, archive, practice, About                                       | Roguelite endless mode for the CrazyGames web portal                         |
| Pages                    | `index.html`, `archive.html`, `practice.html`, `about.html`                  | `portal/index.html`                                                          |
| Code only it uses        | `src/pages/`, `src/ui/` (except the board), `src/*.ts`, `worker/`, `public/` | `src/portal/` (UI, platform layer, strings), `src/endless/` (pure run logic) |
| Shared, read-only for it | —                                                                            | `src/engine/`, `src/ui/board.ts` and its helpers, `src/styles/main.css`      |
| Vite config              | `vite.config.ts`                                                             | `vite.portal.config.ts`                                                      |
| Dev server               | `npm run dev`                                                                | `npm run dev:portal` (local ads overlay and saves)                           |
| Build                    | `npm run build` → `dist/`                                                    | `npm run build:portal` → `dist-portal/`                                      |
| Preview build            | `npm run preview`                                                            | `npm run preview:portal` (real SDK, `local` environment)                     |
| End-to-end tests         | `npm run e2e` (`e2e/`, `playwright.config.ts`)                               | `npm run e2e:portal` (`e2e-portal/`, `playwright.portal.config.ts`)          |
| Ships by                 | Push to `main`; Cloudflare Workers Builds deploys                            | `npm run package:portal` → zip the owner uploads by hand                     |

`npm run check` gates both: typecheck, lint, unit tests, both builds and `scripts/check-builds.ts`.

## Hard rules

1. **Portal work happens on the `portal` branch, never on `main`.** germle.com deploys from `main`
   through Workers Builds, so `main` changes only when the owner merges after a playtest. Nothing
   is ever submitted to CrazyGames by an agent; the owner uploads the zip.
2. **Engine changes are additive only.** Every Endless mechanic is an option of
   `src/engine/rules.ts` that defaults to off; with defaults it plays exactly like the classic
   engine (`src/engine/game.ts`), which a test proves on every locked puzzle. Never edit,
   regenerate or loosen `src/engine/frozen-puzzles.test.ts`, its snapshot or any existing engine
   test to make a build pass: if a change makes one fail, the change is wrong.
3. **Two separate builds.** `dist/` stays byte-for-byte unaffected by portal code: no CrazyGames
   SDK, no portal pages, no portal strings. `dist-portal/` contains no links to germle.com or any
   other site. Enforced by an ESLint import boundary (germle.com code cannot import
   `src/portal/` or `src/endless/`) and by `scripts/check-builds.ts` in `npm run check`.
   `npm run compare:germle-com` builds `origin/main` in a temporary worktree and proves `dist/`
   is byte-for-byte identical; run it before asking the owner to merge portal work.
4. **Portal rules from CrazyGames** (also checked by `scripts/check-builds.ts`): no external links,
   no other portal's branding, no custom fullscreen button, no external ads, no Escape or
   Ctrl/Cmd+W controls (so no modal `<dialog>`), saves only through the SDK Data module, English
   text with every player-facing string in `src/portal/strings.ts`, PEGI 12-safe and not aimed
   at children, relative paths only.

## Where things go

- A new rule or mechanic for Endless → an off-by-default option in `src/engine/rules.ts`, with
  unit tests and the default-equivalence test still passing.
- Run logic (levels, upgrades, scoring, Research, save schema, balance numbers) → `src/endless/`,
  pure TypeScript. All curves and costs live in `src/endless/balance.ts`.
- Portal UI and platform calls → `src/portal/`. Game code talks to CrazyGames only through the
  `AdsPlatform` and `SavePlatform` interfaces in `src/portal/platform/`.
- A germle.com change → never touches `src/portal/` or `src/endless/`; if it changes shared code
  (`src/engine/`, `src/ui/board.ts`, `main.css`), check that Endless still builds and plays.
