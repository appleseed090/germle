# TODO

External memory for the project: what is pending, constraints to remember, deferred work.

## Now

- [x] M1 — Engine (`src/engine/`), pure TypeScript with unit tests; spec in `docs/ENGINE.md`.
- [ ] M2 — Playable daily game, Playwright smoke test, set `LAUNCH_DATE`.
- [ ] M3 — Par solver and practice mode.

## Needs the owner

- [ ] Cloudflare Pages + DNS setup: follow `DEPLOY.md`.
- [ ] GitHub default branch is `claude/ecstatic-volta-wr90cz` (the first branch pushed); switch it
      to `main` in GitHub → Settings → General → Default branch, then delete the old branch.

## Constraints

- No runtime dependencies. Dev dependencies limited to Vite, Vitest, ESLint + typescript-eslint,
  Prettier, Playwright.
- Total page weight under 100 KB gzipped; Lighthouse mobile 95+.
- `npm run check` must pass before every commit.
