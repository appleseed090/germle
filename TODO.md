# TODO

External memory for the project: what is pending, constraints to remember, deferred work.

## Now

- [ ] M1 — Engine (`src/engine/`), pure TypeScript with unit tests (README links the spec).
- [ ] M2 — Playable daily game, Playwright smoke test, set `LAUNCH_DATE`.
- [ ] M3 — Par solver and practice mode.

## Needs the owner

- [ ] Cloudflare Pages + DNS setup: follow `DEPLOY.md`.

## Constraints

- No runtime dependencies. Dev dependencies limited to Vite, Vitest, ESLint + typescript-eslint,
  Prettier, Playwright.
- Total page weight under 100 KB gzipped; Lighthouse mobile 95+.
- `npm run check` must pass before every commit.
