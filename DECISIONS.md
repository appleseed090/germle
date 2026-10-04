# Decisions

One line per choice, newest at the bottom of each section, with the reason. Decisions fixed by the
brief are not repeated here.

## Tooling

- **TypeScript 6.0, not 7.0.** typescript-eslint 8.71 supports TypeScript `<6.1`; 7.0 (the native
  port) would break type-aware linting.
- **Node 24 in `.node-version`.** Current LTS major on 2026-10-04 (Node 26 is not LTS yet).
- **Two tsconfigs.** `tsconfig.json` covers browser code (DOM + Vite types);
  `tsconfig.node.json` covers config files, scripts and e2e (Node types). Mixing both type sets
  in one program makes timers and globals ambiguous.
- **`npm run lint` also runs `prettier --check`.** One gate for style, so `npm run check` covers it.
- **System font stack, no webfont.** Zero bytes and no layout shift; the budget is 100 KB total.
- **GitHub Actions pinned to `actions/checkout@v5` and `actions/setup-node@v5`.** Both run on the
  Node 24 Actions runtime.

## Hosting

- **www → apex is a Cloudflare zone Redirect Rule, not a `_redirects` line.** Pages `_redirects`
  matches paths only and does not support domain-level redirects, so the line in the brief would
  be ignored. `public/_redirects` explains this; `DEPLOY.md` step 4 has the rule.
- **CSP allows Cloudflare Web Analytics hosts.** `static.cloudflareinsights.com` (script) and
  `cloudflareinsights.com` (beacon) so enabling analytics later needs no code change.
- **Long immutable cache only on `/assets/*`.** Vite content-hashes everything there; HTML and
  root files (`/og.png`, icons, manifest) keep Cloudflare's default revalidation.

## Engine (M1)

- **FNV-1a 32 for seed strings, Mulberry32 for streams.** Both tiny, well known and exactly
  specified with 32-bit integer maths, so every browser produces the same numbers.
- **Rewiring moves the far end of each ring edge, one draw per edge.** The brief's "each edge end
  rewired" read as the standard Watts–Strogatz step; the near end stays so the ring's degree
  floor survives. The target is drawn from the other 39 nodes, so self-loops cannot occur.
- **Duplicates are dropped after rewiring, first appearance wins.** Fixes edge indices, which key
  the transmission rolls.
- **Refusers come from a full shuffle of the `refusers` stream.** Simple, uniform, and the stream
  is private to refusers.
- **Index patients: shuffle, then greedy non-adjacent picks with each candidate tried first.**
  Exact for two index patients, best effort for more (practice mode).
- **Roll must be strictly below β.** Makes "probability β" exact for rolls in `[0, 1)`.
- **A quarantine always plays its turn, even if it already contained the outbreak.** Keeps "each
  quarantine passes one day" literal; such a turn infects nobody, so the score is unaffected.
- **Forced-spread ties go to the lower edge index.** Float ties are practically impossible, but
  the rule must be total to be deterministic.
- **Every successful edge is reported as a transmission.** A person infected through two edges
  shows two travelling dots; the forced case reports its single edge.
- **Layout is not part of `Puzzle`.** It is view-only, so the solver and tests skip its cost. It
  lives in a portrait 360 × 480 logical space (about CSS pixels on a phone); the renderer
  transposes it on landscape screens.
- **Practice "neighbours (2–6)" is the ring degree, even values 2, 4, 6.** A ring lattice needs an
  even degree to be symmetric.
- **A config with zero vaccines starts the outbreak in `startGame`.** Practice mode allows it.
- **Puzzle numbers below 1 are returned as-is by the engine.** The UI decides how to handle a
  device clock set before launch.

## Credits

- **Footer name is "Jonathan Liu".** The brief says to use the git author name; in this
  environment the local git author is the coding agent, so the name comes from the repo owner's
  GitHub profile (`appleseed090`).
