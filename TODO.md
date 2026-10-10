# TODO

External memory for the project: what is pending, constraints to remember, deferred work.

## Now

- [x] M1 — Engine (`src/engine/`), pure TypeScript with unit tests; spec in `docs/ENGINE.md`.
- [x] M2 — Playable daily game, Playwright smoke test, `LAUNCH_DATE` = 2026-10-04.
- [x] M3 — Practice mode. The par solver built for M3 was later dropped for a fixed
      Contained/Spread verdict (see `DECISIONS.md`).
- [x] Published puzzles locked by a snapshot test.
- [x] Practice presets: Easy, Medium (the daily settings) and Hard.
- [x] Archive: every past daily puzzle at `/archive`, played at `/?puzzle=<n>`.
- [x] Refusers look healthy once the outbreak starts.
- [x] Community comparison (from the M4 backlog): finished daily and archive games are compared
      with everyone who played the puzzle, through a Worker API and a D1 database. Code done on
      `claude/optimistic-ptolemy-q8qpjc`; live only after the owner's steps below.
- [ ] Archive entry points (spike on `claude/archive-button-prototype`, awaiting the owner's pick):
      a calendar icon in the daily header and a "Play past puzzles" button in today's results.
      Before merging: e2e checks for both, `DECISIONS.md` Navigation and Archive updated. The
      tighter phone header (32 px buttons, 4 px gaps) fits 360 px only up to puzzle #999.

## Needs the owner

- [x] GitHub default branch switched to `main`.
- [x] Cloudflare Worker connected to the repo; builds and deploys from `main`.
- [x] `germle.com` DNS on Cloudflare and attached to the Worker (verified 2026-10-05: valid
      certificate, security headers, routes, full game on a phone viewport).
- [x] **Always Use HTTPS** on: `http://germle.com/…` returns 301 to `https://`, query kept
      (verified 2026-10-05).
- [x] www → apex Redirect Rule: `https://www.germle.com/practice?seed=abc&people=60` returns 301
      to `https://germle.com/practice?seed=abc&people=60` from Cloudflare (verified 2026-10-05).
- [x] Porkbun's default URL forward to `germle-com.l.ink` deleted and Porkbun's own records
      pointed at Cloudflare (2026-10-06; see `DEPLOY.md` step 3a). iMessage previews on the
      owner's Wi-Fi then showed the Germle card again.
- [ ] **After 2026-10-20:** in Porkbun → `germle.com` → DNS Records, delete the four A and four
      AAAA records added on 2026-10-06 (for `germle.com` and `www`). Keep the nameservers on
      Cloudflare, and answer "No, thank you." if Porkbun offers to switch them.

### Community scores: setup in Cloudflare (details and expected output in `DEPLOY.md` 7–11)

1. [x] D1 database `germle` created in the dashboard (2026-10-08).
2. [x] Its ID is in `wrangler.jsonc` (2026-10-08).
3. [ ] Create the table: done by the deploy command in item 4 on the first deploy, or by hand with
       `npx wrangler d1 migrations apply germle --remote`. **Blocks the API:** without the table
       every submission answers 500 and the comparison stays hidden (the game is unaffected).
4. [ ] Workers Builds deploy command:
       `npx wrangler d1 migrations apply germle --remote && npx wrangler deploy`; keep
       `npx wrangler preview` for other branches. **Blocks only later schema changes**; if the
       build token lacks D1 access, add it or apply migrations by hand (`DEPLOY.md` step 9).
5. [ ] Merge, then run the curl checks in `DEPLOY.md` step 10 (expect 200, CSP present, 404,
       400, 405), finish a puzzle in a browser and check that `results` has a row.
6. [ ] Only if abuse appears: a rate-limiting rule for `/api/*` (`DEPLOY.md` step 11).

## M4 backlog (not scheduled)

- **Level editor with levels encoded in the URL:** draw or edit a network, pick vaccines and
  outbreaks, and share it as a link that decodes into a custom puzzle.
- **Mortality rate:** infected people may die after some days, so the end screen separates
  deaths from recoveries and timing matters more.
- **Immunocompromised people weighted in the score:** some nodes count double, nudging players to
  shield the vulnerable rather than the many.
- **Themed hand-made graphs (restaurant, theatre, office):** curated networks, each with a
  one-line fact about why that kind of gathering spreads disease.
- **Real-time mode:** the outbreak advances on a timer instead of per quarantine, for players who
  want pressure.
- [x] **Community percentile comparison:** done; see "Now" and the owner's setup above.
- **Link from the Snackle hub:** add a Germle entry to the owner's Snackle hub so players can
  find it alongside the other games.

## Follow-ups

- **A preview database, if previews should show the comparison.** Previews have no `DB` binding
  now (the API answers 503 there). A second D1 database under `previews.d1_databases` would let
  them exercise the API without touching production.
- **"Better than 0% of 318 players"** is what the lowest score (or a tie at the bottom) reads.
  Kept as specified; revisit if it reads badly in practice.

## Deferred cleanups

- The page shells repeat markup: the two game pages (daily, practice) share the header, toolbar
  and settings dialog; all four pages share the `<head>` (icons, theme-color metas). The archive
  page, the fourth, only copies About's head and header, so the cleanup was left for now; a small
  Vite HTML transform could share it if another game page appears.

## Remember

- The share card's first line (`Germle #<n> · <score>% saved`) is matched by the e2e tests and by
  anyone parsing pasted results. Its last line is `https://germle.com` (the scheme makes Discord
  link it); archive results keep the first line and end with `https://germle.com/?puzzle=<n>`.
- `/?puzzle=<n>` is a public link format (shared results link to it); `germle.v1.archive-progress`
  and `germle.v1.archive-results` are storage keys returning players depend on.
- Practice link parameters are a public format (people save links); renaming one breaks them.
- Published puzzles are locked by `src/engine/frozen-puzzles.test.ts` (daily #1–#365 and five
  practice links). Every day uses the same generator, so a year of samples guards later days
  too; a change that only affects later numbers would need code that branches on the number.
- The dark theme's overrides are written twice in `src/styles/main.css` (under
  `prefers-color-scheme: dark` and under `[data-theme='dark']`), and each page's two `theme-color`
  metas repeat `--color-page`. `src/styles/theme.test.ts` fails if they drift.
- The community API is a boundary between the deployed page and Worker: paths, field names and the
  player ID format live in `src/community-api.ts`. Pages stay cached in open tabs, so a Worker
  change must keep answering the previous page's requests. `germle.v1.player-id` and
  `germle.v1.community-standings` are storage keys; the D1 schema changes only through a new file
  in `migrations/`.
- The Worker shares the engine: a change that alters a published puzzle would also change the
  scores the server computes. `src/engine/frozen-puzzles.test.ts` guards both.
- The About page's "Play it here!" links to someone else's copy of Vax!
  (`stemcodingohio.github.io/vaxgame/`, free GitHub Pages). If it goes down, remove the line.

## Constraints

- No runtime dependencies. Dev dependencies limited to Vite, Vitest, ESLint + typescript-eslint,
  Prettier, Playwright.
- Total page weight under 100 KB gzipped; Lighthouse mobile 95+.
- `npm run check` must pass before every commit.
