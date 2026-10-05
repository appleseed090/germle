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
- **Layout is not part of `Puzzle`.** It is view-only, so engine tests skip its cost. It
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
- **Share squares are colour emojis: 🟦 vaccinated, 🟨 quarantined, ⬜ untouched, 🟥 infected.**
  The owner's call; they replace ▣ ▨ □ ■. The colours follow the results bar, and red, yellow and
  white also differ in lightness, which colour-blind players can still read. The
  saved/infected split rounds like the score; the saved squares are split by largest remainder.
- **Share copies the result straight to the clipboard, with no share sheet and no preview.** The
  owner's call; it replaces `navigator.share` first, which opened the system share sheet. Where
  the clipboard is missing or refuses, a pre-selected text box shows the result to copy by hand.
  "Copied to clipboard" appears in the results dialog's own status line: the page's toast sits
  behind a modal dialog, so players never saw it there.
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

## Practice (M3)

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
- **Page shells repeat the header, toolbar and settings markup.** No templating step for three
  static pages; listed in `TODO.md` as a possible cleanup.
- **Each setup field has an "i" button that shows one sentence inline, below the field.** A
  disclosure (`aria-expanded`, `aria-controls`, `hidden`) rather than a tooltip or popover: it
  opens on tap, click, Enter or Space, needs no positioning or inline styles, and screen readers
  hear whether it is open. Each sentence is also its control's `aria-describedby`, so it is read
  when the slider or seed box is focused, open or not. The button is a 36 px target around a 20 px
  badge; the focus ring is drawn on the badge.
- **Contagiousness stays β in percent; the slider does not show R0.** Nobody recovers, so every
  contact eventually passes the infection on and R0 equals the number of contacts (about 4.0 for
  an index patient on the daily network, 3.1 for later cases) whatever β is: an R0 readout would
  not move with the slider. β sets the speed instead, on average 1/β days per contact (2.9 at
  35%). The never-fizzle rule flattens the low end: in a 300-puzzle simulation with a simple
  strategy, 51% of days at 15% infected only the guaranteed one person, against 25% at 35%. The
  "i" text explains β, with "the chance the infection passes along each contact" in bold (the
  owner's wording); the `contagion` link parameter is unchanged.

## Par removed; a fixed verdict instead

- **No solver and no par.** M3 shipped a par (the best score a clairvoyant beam-search solver
  found); the owner dropped it. Nothing on the end screen, share card or About page mentions it.
  The solver, its timing test and its calibration notes are in git history before this change.
- **The daily constants stay as calibrated with that solver.** Over puzzles 1–365 its par had
  mean 83.8% and median 85%; raising β to 0.45 moved the median by only 2 points while making the
  game much harder for players, so β stays 0.35. Seeding and pre-rolled transmission are
  unchanged.
- **Score stays "% saved"; the end screen adds a fixed verdict: "Contained" at 70% or above,
  "Spread" below** (`src/verdict.ts`). The owner's threshold, the same for every puzzle and for
  practice, compared with the rounded score the player sees.
- **The toolbar's end label and the screen-reader announcement use the verdict too.** They used
  to say "Contained" for every finished game, which would contradict a "Spread" result.
- **Share line 1 is `Germle #12 · 78% saved`.** The ` · par 83%` suffix is gone; the
  `/^Germle #\d+ · \d+% saved/` contract still matches.
- **Stored results keep the `germle.v1.results` key.** Entries saved with a `par` field still load;
  the field is ignored and dropped the next time results are written.

## Credits

- **Footer name is "Jonathan Liu".** The brief says to use the git author name; in this
  environment the local git author is the coding agent, so the name comes from the repo owner's
  GitHub profile (`appleseed090`).
- **The site never links to the GitHub repo.** The repo is private, so the About footer is just
  the copyright line. The About page carries the Vax! credit itself; `CREDITS.md` keeps the full
  licensing notice in the repo.

## Dark mode

- **Follows `prefers-color-scheme`; Settings adds System / Light / Dark.** Stored as
  `theme: 'light' | 'dark' | null` in `germle.v1.settings`, `null` meaning "follow the device"
  like `reduceMotion`. Settings saved before this load as `null`. A three-way choice rather than a
  switch, so a player can go back to following the device (the reduce-motion switch cannot).
- **Dark overrides are declared twice in `main.css`, guarded by a test.** CSS cannot share one
  block between a media query and an attribute selector, and `light-dark()` would leave every
  colour blank on Safari before 17.5. `src/styles/theme.test.ts` fails if the two blocks differ.
- **Healthy people stay light grey in the dark theme.** Lightness (healthy lightest, then refusers,
  then infected) is the cue that survives red–green colour blindness: simulated, red turns dark
  olive, which a dark-grey healthy disc would resemble.
- **The dark accent is a lighter teal with dark text on it** (`--color-on-accent`), so links and
  the "Contained" verdict stay readable on dark surfaces; the Contained pill uses the same pair.
- **A saved theme is applied by a render-blocking classic script, not inline and not a module.**
  The CSP forbids inline scripts, and module scripts are deferred, so they can run after the first
  paint. A plugin in `vite.config.ts` builds `src/theme-before-paint.ts` on its own into an IIFE
  named by content hash under `/assets/`, which `_headers` caches as immutable; it shares the
  settings parser and theme code with the game instead of copying them. The dev server loads it
  as a module, so a saved theme may flash there only.
- **One `theme-color` meta per scheme.** Each carries `media="(prefers-color-scheme: …)"` and
  `data-scheme`; an explicit choice sets the chosen one to `all` and the other to `not all`. The
  web manifest keeps the light colour, since manifests cannot vary by scheme.
- **Contrast is tested in both themes** (WCAG AA: 4.5:1 for text, 3:1 for marks and outlines).
  The light theme's healthy outline was 2.90:1 against the page and moved from `#87929e` to
  `#828d99` (3.10:1). The refusers' white cross (2.5:1 on orange) shows only with contact numbers
  off; see "Contact counts".
  Not tested, by design: edges stay faint (1.7:1 light, 2.4:1 dark); outcome-bar neighbours
  (untouched next to vaccinated or infected: about 3.6:1 light, 2.8:1 dark) also differ by pattern
  and the legend gives exact counts.
- **`::backdrop` reads its colour with a fallback.** Older browsers do not let it inherit custom
  properties; they get the light backdrop in both themes.
- **`vite preview` serves the `/*` headers from `public/_headers`,** and every end-to-end test fails
  on a Content-Security-Policy console error, so CSP breakage shows up before deploy.
- **Vitest processes CSS (`css: true`)** so the theme test can import `main.css?raw`; it blanks CSS
  otherwise.

## Contact counts on people

- **Each person shows how many contacts they still have: neighbours who are healthy or infected.**
  Vaccinated and quarantined neighbours do not count, and removed people show nothing because
  they leave the board. Counts change only on the player's moves: vaccinating or quarantining
  someone lowers each neighbour's count by one; an infection changes nothing. Counting only
  healthy neighbours was rejected: it would tick down as the infection spreads, and on infected
  people it would read as "healthy people I can still infect", pointing at the frontier, which
  players should find themselves. Computed by `contactsStillInNetwork` in the engine.
- **Shown by default; Settings → "Show contact numbers" can hide them.** First always on, then the
  owner added the switch. Off brings back the refusers' white cross and the infected people's
  white centre dot, so the board matches `og.png` and the icons. Stored as `showContactCounts`,
  default `true`; settings saved before it load with numbers shown. The switch sets
  `data-contact-counts` on `<html>` and CSS does the rest, so the how-to-play legend follows too.
  The cross is 2.5:1 on orange, below WCAG's 3:1, a known gap kept to match `og.png`. The counts
  show how connected each person is; the hard part, finding the people whose removal splits the
  network, stays the player's either way.
- **"Size people by contacts" is retired; every person is the same size.** Size showed the starting
  count and would contradict the live number after the first vaccine, and equal discs give every
  digit the same room. Stored settings with `sizeNodesByDegree` still load; the field is ignored
  and dropped on the next save.
- **With numbers on, refusers lose their cross and infected people their white centre; colour
  alone tells them apart.** The owner's call. The how-to-play figures have no centre dot, and the
  legend's dots are plain colour (with the cross and dot when numbers are off), sized in em so
  they line up with the text. The legend does not explain the numbers; the Settings switch does
  ("The number on each person counts their contacts still in the network."), as the owner asked.
- **Phones under 400 px get smaller how-to-play step figures,** to keep the dialog short.
- **Dark digits on grey and orange, white digits on red, in both themes.** Contrast requires it
  anyway (6.3:1 on orange; white would be 2.5:1), and it gives red–green colour-blind players a
  second cue: simulated (Machado 2009, full severity), orange and red differ only in lightness
  (1.7–2.1:1), but the digit's polarity survives protanopia, deuteranopia and tritanopia.
  `src/styles/theme.test.ts` keeps every digit at 4.5:1 or more.
- **Digits are drawn at 1.05× the disc radius.** On a Pixel 7, 40 people get about 16 px digits;
  80 people hit the 0.75× radius floor, about 11 px digits in 21 px discs on a 360 px phone.
  Counts above 9 are vanishingly rare (one in 24,000 people at 80 people and 6 neighbours).
- **Each person's screen-reader label uses the live count** (`Person 7: healthy, 3 contacts`), so
  it always says what the digit shows. It keeps the count with numbers off too, since it is the
  only way a screen-reader player learns it.

## Daily constants in the game

- **The how-to-play dialog states them in one line under the steps:** "Every daily puzzle: 40
  people · 4 vaccines · 2 outbreaks · 2 refusers · 35% contagious". It is built from
  `DAILY_PUZZLE_CONFIG` by `describePuzzleConfig`, the same formatter as practice's result
  summary, so it cannot drift from the config. Not in the toolbar, a single line kept for the
  numbers that change during play, with no room on a 360 px phone; not in the results, where
  identical numbers every day say nothing about the game, and the share card is a public format.

## How to play

- **The three steps use the owner's wording:** "Tap people to vaccinate them. The outbreak starts
  when you have exhausted all vaccines." / "Once the outbreak starts, you can quarantine one person
  per day." / "The game ends when the outbreak has nowhere left to go. Save as many people as you
  can!" Step 2 says "quarantine", the move the game offers once the vaccines are gone (the owner
  confirmed it over an earlier "vaccinate").
- **The About page is only the Inspiration and Privacy sections, plus the footer.** The owner's
  call. The how-to-play dialog is now the only place that explains the game. Rules the About page
  used to state and nothing else on the site does: that "35% contagious" is per contact per day, at least one infection a day, refusers can still be
  quarantined, nobody recovers, the same moves give everyone the same outbreak, and people can be
  dragged around.
- **The Contained threshold is stated under the steps, in the verdict's own words:**
  "**Contained**: 70% or more saved. **Spread**: below 70%." The owner chose this over "Save 70% or
  more and the outbreak is Contained; below that, it Spread", which used "Spread" awkwardly as a
  verb, and over renaming the verdicts Success/Failed: most players would see "Failed" most days,
  and "Spread" describes the outbreak, not the player. `renderVerdictRule` builds the line from
  `CONTAINED_THRESHOLD_PERCENT` and the `Verdict` names, so the rule and the verdict cannot
  disagree.
- **Dialogs open at their top, then focus their main control without scrolling.** The owner saw
  how-to-play open scrolled to the bottom on an iPhone: `autofocus` scrolls the dialog to Start
  playing. The four dialogs now mark that control with `data-initial-focus`, and `openDialog`
  focuses it with `preventScroll`, so Enter still starts the game. It then resets the scroll for
  browsers without `preventScroll`. Phones with browser toolbars often show less than 600 px of
  height, where how-to-play has to scroll.

## Navigation

- **Practice and About are icon links in the header, not links inside dialogs.** The owner's call.
  The daily header reads How to play, Results, Practice (a dumbbell), About (an "i") and Settings;
  the practice header reads Setup, About and Settings. The practice dialogs keep their "Today's
  puzzle" links, and the wordmark still links home.
- **On phones up to 420 px the header tightens to stay one row:** icon buttons 34 px wide (still
  44 px tall), a 1.15rem wordmark, 6 px gaps. Below 340 px only the logo mark shows; its link is
  still labelled "Germle home". Five buttons need about 406 px otherwise, which pushed the page
  wider than the screen and cut off Settings. An e2e test fails if the page is wider than a
  360 px phone.
