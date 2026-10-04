# TODO

External memory for the project: what is pending, constraints to remember, deferred work.

## Now

- [x] M1 — Engine (`src/engine/`), pure TypeScript with unit tests; spec in `docs/ENGINE.md`.
- [x] M2 — Playable daily game, Playwright smoke test, `LAUNCH_DATE` = 2026-10-04.
- [ ] M3 — Par solver and practice mode.

## Needs the owner

- [ ] Cloudflare Pages + DNS setup: follow `DEPLOY.md`.
- [ ] GitHub default branch is `claude/ecstatic-volta-wr90cz` (the first branch pushed); switch it
      to `main` in GitHub → Settings → General → Default branch, then delete the old branch.

## Remember

- The About page states the daily constants (40 people, 4 vaccines, 35%). Update it if M3
  calibration changes `DAILY_PUZZLE_CONFIG`.
- The share card's first line (`Germle #<n> · <score>% saved`) is matched by the e2e test and by
  anyone parsing pasted results; M3 appends ` · par <p>`.

## Constraints

- No runtime dependencies. Dev dependencies limited to Vite, Vitest, ESLint + typescript-eslint,
  Prettier, Playwright.
- Total page weight under 100 KB gzipped; Lighthouse mobile 95+.
- `npm run check` must pass before every commit.
