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

- **Workers static assets instead of Cloudflare Pages.** The dashboard no longer offers creating a
  Pages project on this account (Cloudflare now steers new projects to Workers), so the site is an
  assets-only Worker: no script, still static and free, configured in `wrangler.jsonc`.
  `_headers` and `_redirects` keep working unchanged; `html_handling: auto-trailing-slash` keeps
  `/about` and `/practice` clean; unknown paths return 404. Verified under `wrangler dev`.
- **Deploy with `npx wrangler deploy`, not a pinned devDependency.** Wrangler pulls in the workerd
  runtime (tens of MB) and is only needed on Cloudflare's build machine; the brief keeps dev
  dependencies to the listed tools.

- **www → apex is a Cloudflare zone Redirect Rule, not a `_redirects` line.** Cloudflare `_redirects`
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

## Playable daily game (M2)

- **`LAUNCH_DATE` is 2026-10-04**, the day M2 shipped. Puzzle numbers below 1 (a device clock set
  before launch) clamp to #1.
- **Static multi-page build.** `index.html` is `/`, `about.html` is served at `/about`.
  No client-side router.
- **Taps hit the nearest person within max(22 CSS px, radius + 6).** Overlapping 44 px circles
  would make the drawing order decide; nearest-centre gives Voronoi-like targets of at least
  44 px wherever nodes are not crowded.
- **Landscape boards show the layout transposed.** The logical space is portrait; swapping axes
  fills desktop screens and changes nothing in the game.
- **Node radii scale with the board but are clamped to 0.75–1.5× logical size.** Keeps people
  tappable on small phones and not cartoonish on large monitors.
- **Share squares are ▣ vaccinated, ▨ quarantined, □ untouched, ■ infected.** They differ in fill
  pattern, so the bar reads in monochrome, and none has an emoji presentation. The
  saved/infected split rounds like the score; the saved squares are split by largest remainder.
- **Share uses `navigator.share` whenever it exists** (as the brief says, desktop included), then
  the clipboard, then a visible, pre-selected text box.
- **Played and streak count finished games only.** An unfinished game from an earlier day is
  dropped, never counted.
- **Progress is stored as the move list and replayed on load.** Determinism makes this exact;
  replay validates every move, so tampered or stale data falls back to a fresh game.
- **localStorage keys are `germle.v1.settings`, `germle.v1.daily-progress`, `germle.v1.results`,
  `germle.v1.seen-how-to-play`.** Separate keys so one corrupt value cannot wipe the others; each
  is validated on read.
- **Toolbar updates when a move's animation ends; a tap during an animation only skips it.**
  Keeps the text in step with the board and prevents accidental double moves.
- **Quarantine toolbar shows "N quarantined" with the infected count as a secondary, muted
  figure** (hidden below 360 px) so the line never wraps and the board never shifts.
- **Tapping someone who cannot be tapped shows a toast saying why** (refuser, already infected).
- **Edges stay plain grey; S–I contacts are not highlighted.** The brief says "edges thin grey";
  spotting the frontier is part of the puzzle.
- **The copyright line is on the About page and in Settings.** The game page fills the viewport
  without scrolling, so it has no footer.
- **After midnight the countdown becomes a "new Germle is ready" link; the page never reloads by
  itself.** A game in progress is never yanked away.
- **Reduce motion: an explicit choice in Settings overrides the device; until then the switch
  follows `prefers-reduced-motion`.**
- **Native `<dialog>`, closed by buttons, not `<form method="dialog">`.** Avoids any interaction
  with the CSP's `form-action 'none'`.
- **No inline styles anywhere.** The CSP's `style-src 'self'` forbids them; runtime sizes are set
  through the CSSOM, which CSP allows.
- **Playwright pinned to 1.56.1.** It matches the Chromium preinstalled in the development
  container; CI installs that browser itself.
- **Favicons, app icons and the 1200 × 630 card are generated by `scripts/generate-images.ts` and
  committed.** All artwork is original and drawn in code; no third-party assets.

## Par and practice (M3)

- **Par solver: centrality-pooled vaccine sets ranked by fragmentation, then a beam search over
  quarantines with exact simulation.** Budget: pool 14, 24 sets played, beam 6. Bigger budgets
  bought little: 6× the work raised mean par from 83.3% to 85.2% over 100 puzzles. Ranking
  heuristics (lexicographic or several linear mixes) all landed within 0.2 points, so the simple
  lexicographic one stays.
- **Solver speed, measured.** Node on the dev container: 11 ms mean, 45 ms worst over puzzles
  1–365. Chromium with the CPU throttled 4× (Lighthouse's mid-range-phone setting), in the real
  page: 38–135 ms over today's puzzle and 7 practice seeds with the daily settings. The
  `e2e/par-timing.spec.ts` test enforces < 300 ms. Not measured on a physical phone.
- **Constants left unchanged after calibration.** With the shipped budget over puzzles 1–365:
  mean par 83.8%, p10 78%, median 85%, p90 88%, and 69% of days within 75–85%. β from 0.35 to
  0.45 moved the median by only 2 points (the clairvoyant solver dodges bad rolls) while making
  the game much harder for players, who cannot; refusers 2→4 and rewiring 0.1→0.2 changed
  nothing measurable. A unit test keeps mean par over puzzles 1–60 in 78–88%.

  | Change from daily constants | Mean par | Median | Days in 75–85% |
  | --------------------------- | -------- | ------ | -------------- |
  | none (β 0.35)               | 83.8     | 85     | 69%            |
  | β 0.40                      | 83.0     | 83     | 71%            |
  | β 0.45                      | 82.3     | 83     | 67%            |
  | 3 refusers                  | 83.7     | 85     | 67%            |
  | rewiring 0.2                | 84.1     | 85     | 63%            |

- **Par is solved 0.9 s after the outbreak starts, cached, and stored with the day's result.** Not
  at page load, so Lighthouse's blocking time stays near zero; stored so a reload never re-solves.
  Results saved before par existed get it computed once when shown.
- **Share line 1 becomes `Germle #12 · 78% saved · par 83%`.** The brief wrote `· par <p>`; the
  percent sign matches "78% saved". The existing `/^Germle #\d+ · \d+% saved/` contract still
  matches.
- **The About page says the solver knows the rolls.** Honest framing for a par players may not
  reach.
- **Practice links are the state.** `/practice?people=&neighbours=&vaccines=&outbreaks=&refusers=&contagion=&seed=`
  is parsed defensively (clamped to slider ranges, vaccines and outbreaks reduced to fit the
  network, seed reduced to `[a-z0-9-]{1,24}`), and the address bar always shows the game being
  played. Restarting navigates to a new link instead of tearing down the board: no teardown code,
  and every game is shareable and replayable.
- **Practice seed key is `practice-<seed>`; rewiring stays at the daily 0.1.** The brief's slider
  list does not include rewiring.
- **"Neighbours" slider is the ring degree: 2, 4 or 6.**
- **Practice never touches stats or progress, and has no share card.** The brief says practice is
  not counted; settings are shared with the daily page.
- **A bare `/practice` visit opens the setup dialog over a playable random game.** A link with a
  seed goes straight to the game.
- **Throttled timing test uses practice seeds, not faked dates.** Playwright's fake clock replaces
  `performance`, which drops User Timing entries.
- **Page shells repeat the header, toolbar and settings markup.** No templating step for three
  static pages; listed in `TODO.md` as a possible cleanup.

## Credits

- **Footer name is "Jonathan Liu".** The brief says to use the git author name; in this
  environment the local git author is the coding agent, so the name comes from the repo owner's
  GitHub profile (`appleseed090`).
- **The About footer links to `CREDITS.md` on GitHub (`main`), not a copy on the site.** One
  source of truth for the licensing notice; the repo is public.
