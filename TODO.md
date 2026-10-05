# TODO

External memory for the project: what is pending, constraints to remember, deferred work.

## Now

- [x] M1 — Engine (`src/engine/`), pure TypeScript with unit tests; spec in `docs/ENGINE.md`.
- [x] M2 — Playable daily game, Playwright smoke test, `LAUNCH_DATE` = 2026-10-04.
- [x] M3 — Practice mode. The par solver built for M3 was later dropped for a fixed
      Contained/Spread verdict (see `DECISIONS.md`).

## Waiting on the owner's decision

Recommendations were sent on 2026-10-05; build once decided.

- **Neighbour counts on each person.** Recommended: the count of neighbours still in the network
  (healthy and infected), always on; retire "Size people by contacts"; dark digits on grey and
  orange, white on red; screen-reader label uses the live count.
- **Contagiousness vs R0.** Recommended: keep the slider as β in percent (R0 equals the number of
  contacts here and does not depend on β). The setup's "i" text already explains β; update it
  if the slider changes.
- **Daily settings in the game.** Recommended: one line in the how-to-play dialog built from
  `DAILY_PUZZLE_CONFIG` with practice's summary formatter; not in the toolbar or results.

## Needs the owner

- [x] GitHub default branch switched to `main`.
- [x] Cloudflare Worker connected to the repo; builds and deploys from `main`.
- [x] `germle.com` DNS on Cloudflare and attached to the Worker (verified 2026-10-05: valid
      certificate, security headers, routes, full game on a phone viewport).
- [x] **Always Use HTTPS** on: `http://germle.com/…` returns 301 to `https://`, query kept
      (verified 2026-10-05).
- [x] www → apex Redirect Rule: `https://www.germle.com/practice?seed=abc&people=60` returns 301
      to `https://germle.com/practice?seed=abc&people=60` from Cloudflare (verified 2026-10-05).

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
- **Community percentile comparison:** show where a score ranks among everyone who played that
  day's puzzle. Needs a small backend to collect daily scores; today there is none.
- **Link from the Snackle hub:** add a Germle entry to the owner's Snackle hub so players can
  find it alongside the other games.

## Deferred cleanups

- The three page shells repeat the header, toolbar and settings dialog markup. A small Vite HTML
  transform could share it if a fourth page appears.

## Remember

- The About page states the daily constants (40 people, 4 vaccines, 35%). Update it whenever
  `DAILY_PUZZLE_CONFIG` changes.
- The share card's first line (`Germle #<n> · <score>% saved`) is matched by the e2e tests and by
  anyone parsing pasted results.
- The About page states the 70% Contained/Spread threshold. Update it whenever
  `CONTAINED_THRESHOLD_PERCENT` (`src/verdict.ts`) changes.
- Practice link parameters are a public format (people save links); renaming one breaks them.
- The dark theme's overrides are written twice in `src/styles/main.css` (under
  `prefers-color-scheme: dark` and under `[data-theme='dark']`), and each page's two `theme-color`
  metas repeat `--color-page`. `src/styles/theme.test.ts` fails if they drift.
- The refusers' white cross is 2.5:1 on orange in both themes, below WCAG's 3:1 for marks. The
  neighbour-count decision above removes or replaces it; otherwise darken the cross.

## Constraints

- No runtime dependencies. Dev dependencies limited to Vite, Vitest, ESLint + typescript-eslint,
  Prettier, Playwright.
- Total page weight under 100 KB gzipped; Lighthouse mobile 95+.
- `npm run check` must pass before every commit.
