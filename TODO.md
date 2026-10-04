# TODO

External memory for the project: what is pending, constraints to remember, deferred work.

## Now

- [x] M1 — Engine (`src/engine/`), pure TypeScript with unit tests; spec in `docs/ENGINE.md`.
- [x] M2 — Playable daily game, Playwright smoke test, `LAUNCH_DATE` = 2026-10-04.
- [x] M3 — Par solver, calibration (constants kept, see `DECISIONS.md`) and practice mode.

## Needs the owner

- [ ] Cloudflare Pages + DNS setup: follow `DEPLOY.md`.
- [ ] GitHub default branch is `claude/ecstatic-volta-wr90cz` (the first branch pushed); switch it
      to `main` in GitHub → Settings → General → Default branch, then delete the old branch.

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
- **Dark mode:** colours are already CSS variables; add a `prefers-color-scheme: dark` palette
  and check contrast for every node state.
- **Link from the Snackle hub:** add a Germle entry to the owner's Snackle hub so players can
  find it alongside the other games.

## Deferred cleanups

- The three page shells repeat the header, toolbar and settings dialog markup. A small Vite HTML
  transform could share it if a fourth page appears.

## Remember

- The About page states the daily constants (40 people, 4 vaccines, 35%). Update it whenever
  `DAILY_PUZZLE_CONFIG` changes.
- The share card's first line (`Germle #<n> · <score>% saved · par <p>%`) is matched by the e2e
  tests and by anyone parsing pasted results.
- Practice link parameters are a public format (people save links); renaming one breaks them.

## Constraints

- No runtime dependencies. Dev dependencies limited to Vite, Vitest, ESLint + typescript-eslint,
  Prettier, Playwright.
- Total page weight under 100 KB gzipped; Lighthouse mobile 95+.
- `npm run check` must pass before every commit.
