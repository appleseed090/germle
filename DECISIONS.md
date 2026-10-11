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
- **The share card's last line is a full URL, `https://germle.com`.** The owner's call; it was the
  bare `germle.com`, which Discord shows as plain text because it only links URLs with a scheme.
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
- **Skip animations (first called "Reduce motion"; renamed, without a description, by the owner):
  an explicit choice in Settings overrides the device; until then the switch
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
- **"Neighbors" slider is the ring degree: 2, 4 or 6.** Labelled "Neighbors" (the owner's
  spelling) and explained as "How many contacts each person starts with, on average.", which holds
  after rewiring (the daily network averages 3.97 for 4). The link parameter stays `neighbours`,
  because saved practice links use it.
- **Practice never touches stats or progress, and has no share card.** The brief says practice is
  not counted; settings are shared with the daily page.
- **A bare `/practice` visit opens the setup dialog over a playable random game.** A link with a
  seed goes straight to the game.
- **Page shells repeat the header, menu, toolbar and settings markup.** No templating step for four
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
- **Easy, Medium and Hard presets fill in the practice sliders; Medium is the daily puzzle.**
  The owner's call, after deciding the daily stays a single puzzle whose difficulty varies by day.
  A preset only sets the sliders, so links keep their format and record the actual settings; the
  preset stays selected while every slider matches it. "Reset to daily settings" went, since
  Medium does the same. Values were tuned with a simulated player (vaccinate whoever has the most
  contacts, quarantine the healthy person touching the most infected) over 400 seeds each, giving
  its median score and how often it scored Contained (70% or more):

  | Preset | Settings                                                         | Median | ≥ 70% |
  | ------ | ---------------------------------------------------------------- | ------ | ----- |
  | Easy   | 30 people, 4 neighbors, 4 vaccines, 1 outbreak, 0 refusers, 35%  | 87%    | 99%   |
  | Medium | 40 people, 4 neighbors, 4 vaccines, 2 outbreaks, 2 refusers, 35% | 70%    | 51%   |
  | Hard   | 50 people, 4 neighbors, 5 vaccines, 3 outbreaks, 5 refusers, 35% | 54%    | 14%   |

  Outbreaks and vaccines move difficulty most; people and refusers barely do. One, two and three
  outbreaks follow Vax!'s Easy, Medium and Hard. Hard stays at 50 people so the board is usable on
  a phone. A Hard with 6 neighbors scored 28%, barely above random tapping (26%), so skill stopped
  mattering; it was rejected.

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
- **The About page links to a playable Vax!** ("Play it here!"), the owner's call. The original
  site on Heroku is gone; the link goes to a 2024 rebuild on GitHub Pages
  (`stemcodingohio.github.io/vaxgame/`) by an Ohio education project, which says it left the
  game unchanged (announced in the VaxGame repo's issue #41). The credit link still goes to the
  original repo.
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
- **Hidden by default; Settings → "Show contact numbers" turns them on.** First always on, then
  the owner added the switch and made off the default. Off shows the refusers' white cross (while
  vaccinating) and the infected people's white centre dot, so the board matches `og.png` and the icons. Stored as
  `showContactCounts`, default `false`; settings saved before it load with numbers hidden. The
  switch sets `data-contact-counts="shown"` on `<html>`; without it the stylesheet draws the cross
  and dot, so the page's default matches the setting's. The how-to-play legend follows too.
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
- **Refusers look like anyone healthy once the outbreak starts.** The owner's call. Refusing only
  rules out a vaccine: from the outbreak on, refusers can be quarantined and infected like
  everyone else, so the orange carried nothing, and the cross read as "can't tap" just when they
  became tappable. Vax! kept them orange all game. The board marks refusers only in the
  vaccinate phase, and the outbreak animation switches to the quarantine phase as the first
  people fall ill: the cross goes at once and the orange fades over 0.6 s. Becoming infected
  stays instant, and Skip animations or a reduced-motion device make the fade instant too.
  Screen readers stop hearing "refuses vaccines" at the same moment. Puzzles are unchanged.
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
- **Dialogs open at their top, and how to play focuses its own heading.** The owner saw how to
  play open scrolled to the bottom on an iPhone, first with `autofocus` on Start playing and then
  with `focus({ preventScroll: true })`: iOS Safari still scrolled to the focused button on the
  first visit. How to play now focuses its heading (`tabindex="-1"`), like Practice setup, so
  whatever a browser scrolls to is the top. Keyboard players close it with Escape or Tab to a
  button. The other dialogs mark their main control (Share, Play again) with
  `data-initial-focus`; `openDialog` focuses it with `preventScroll` and resets the scroll.

- **The legend ("Healthy, refuses vaccines, infected") comes first, right under the heading.** It
  used to sit near the bottom in small grey text, after the steps, the verdict rule and the daily
  constants, and players reported missing who is what. It now sits on a light panel in normal
  text, so the colours are known before the steps use them; on a narrow phone it wraps between
  entries, never between a dot and its word. An e2e test checks it is fully in view, above the
  steps, when the dialog opens on a short phone screen.

## Navigation

- **Every page has one ☰ menu, the owner's call, replacing the row of header icons.** Each item is
  an icon and a word. Every menu starts with Today's puzzle, Archive and Practice, then the page's
  own actions (the daily page: How to play and Results; practice: Setup), then Settings on the game
  pages and About. The page you are on is marked (`aria-current="page"`, accent colour); a past
  puzzle marks none, since Today's puzzle leads elsewhere from there. About and the archive keep
  their "Play today's puzzle" button beside the menu. The practice dialogs keep their "Today's
  puzzle" links, and the wordmark still links home. Practice and About are never linked from
  inside other dialogs.
- **The menu is a modal `<dialog>` with an invisible backdrop, not a popover.** A popover lets the
  tap that closes it through, so tapping the board to dismiss it also vaccinated whoever was under
  the finger; the modal backdrop takes that tap. Its buttons close it before opening their own
  dialog, so focus returns to the menu button afterwards. It is placed under the header, aligned
  with the menu button through `--header-max-width` and `--header-end-padding`. An e2e test checks
  the dismissing tap and the focus.
- **On phones up to 420 px the header tightens:** a 1.15rem wordmark and 6 px gaps; below 340 px
  only the logo mark shows, its link still labelled "Germle home". Every page fits one row down to
  320 px, and an e2e test fails if any page is wider than a 360 px phone.

## Locked puzzles

- **A snapshot test locks every daily puzzle from #1 to #365, plus five practice links.** For each
  puzzle it records digests of the network, the refusers, the layout, the first 40 turns of
  transmission rolls and a game played by a fixed scripted player, one line per puzzle in
  `src/engine/frozen-puzzles.snapshot.txt`. Determinism tests only proved that a build agrees with
  itself; nothing stopped a refactor from quietly changing every puzzle. Players compare scores by
  puzzle number, saved games are replayed move by move, and an archive replays past days, so a
  published puzzle must never change by accident.
- **The layout is locked exactly, not rounded.** It uses only IEEE 754 arithmetic and
  `Math.sqrt`, so every browser computes the same positions; a change to them is a change to the
  board people saw.
- **Changing a puzzle on purpose takes one command and a note here.** Run
  `npx vitest run -u src/engine/frozen-puzzles.test.ts` and record why. CI never writes
  snapshots, so a deleted snapshot fails there too.
- **The owner kept Germle's rules where they differ from Vax!** A turn that would infect nobody
  infects only the single most likely person (Vax! re-rolls at 100%, infecting everyone exposed),
  and the first infections are kept apart when possible (Vax! places them at random). Deaths and
  recovery stay out, as in Vax!.

## Archive

- **Every past daily puzzle can be played, on the game page itself.** `/archive` lists them,
  newest first, each with your score (green Contained, red Spread), "In progress" or "Play". A row
  opens `/?puzzle=<n>` on the daily page, so the archive reuses the board, toolbar and dialogs, and
  past puzzles stay exactly as they were (see Locked puzzles). Today's row links to `/`.
- **Archive games are kept apart.** Their moves and results live in `germle.v1.archive-progress`
  and `germle.v1.archive-results`, never in the daily results, so they never count towards played,
  streak, best score or the histogram. Each past puzzle gets one game, like the daily: reopening
  it shows your finished game. A puzzle played on its own day keeps that score in the list; its
  daily moves are not kept past the day, so opening it later starts a fresh archive game.
- **A past puzzle is marked on the board and in its results.** A strip under the header reads
  "Archive · Tue, Oct 6, 2026 · Today's puzzle", in the player's locale; it stays one line on a
  360 px phone, and an e2e test checks that. The results dialog drops the countdown and the
  statistics and offers "More past puzzles · Today's puzzle" instead. The tab title says the
  puzzle is from the archive.
- **Sharing an archive game keeps the first line and links the puzzle.** The third line becomes
  `https://germle.com/?puzzle=<n>`, so it is not mistaken for today's, the first line still matches
  `Germle #<n> · <score>% saved`, and a friend can tap it to play the same puzzle.
- **Bad or future links play today's puzzle.** Only a plain whole number from 1 to yesterday
  opens the archive; a later number shows "Puzzle #n isn't out yet. Here's today's.", and the
  address bar is reset to `/` whenever today's puzzle is played. The game page still switches at
  each player's local midnight, so a number one player sees as tomorrow's is already out elsewhere.
- **Players find it from the menu and from today's results.** Archive is in every page's menu.
  Today's results show a "Play past puzzles" button under the countdown, above the statistics, so
  it is in view on a phone once a game ends; past puzzles hide it and offer "More past puzzles ·
  Today's puzzle" instead. How to play still ends with "Missed one? Play it in the archive".

## Community scores (M4)

- **Modelled on chainle.io: no accounts, a random player ID, moves sent instead of scores.** The
  browser makes `crypto.randomUUID()` once and keeps it in `germle.v1.player-id`; it is checked
  against the UUID v4 format on read and replaced if missing or malformed. It only tells a
  browser's first finished game from repeats. A browser that cannot keep it (blocked or full
  storage, no `crypto.randomUUID`) sends nothing, since it would count as a new player each time.
- **The server scores games itself.** `POST /api/results` takes `{ puzzleNumber, playerId,
moves }`, rebuilds the puzzle with `createPuzzle(DAILY_PUZZLE_CONFIG, dailySeedKey(n))`, replays
  the moves with `replayMoves`, rejects anything that does not end the game, and scores it with
  `countOutcomes` and `scorePercent`. The Worker imports the engine unchanged, so a made-up score
  is impossible and `best` is always a score a real game reached. Rebuilding and replaying took
  0.11 ms at the median and 0.88 ms at worst over puzzles #1–#365 (Node, development machine; not
  measured on Cloudflare).
- **Every numbered puzzle counts, whenever it is played; practice never does.** Today's game and
  archive games both submit, so past puzzles build up a curve too. Accepted numbers run from 1 to
  one above the number of the server's current UTC date, because the game switches at each
  player's local midnight and time zones east of UTC are a day ahead for part of the UTC day.
- **The curve mixes games played on the day with later archive games, on purpose.** Without
  archive games, a puzzle's curve would be frozen at whoever happened to play on its day, and
  every puzzle from before the comparison existed would stay empty. Both kinds of game have the
  same rules, the same network and no published answer, so they measure the same skill. Archive
  players may have seen friends' results, but share cards show squares, not moves. The first
  game per player counts in both cases, so nobody can improve their entry by replaying.
  `submitted_at` is stored, so the two kinds can be told apart later (a game submitted on its
  puzzle's calendar day, give or take the time-zone window, was played on the day) without a
  separate column.
- **Only a player's first game counts; repeats are answered, never counted.** The table's primary
  key is (puzzle number, player ID), and the insert is `ON CONFLICT DO NOTHING`; the answer says
  `counted: true` or `false`. This covers a puzzle played on its day and again from the archive
  (the archive starts a fresh game): the first score stays. Because a repeat is harmless, the page
  resends whenever it has a finished game but no numbers stored for it: the game ended offline,
  or the request failed.
- **A repeat is compared with everyone else, not with the player's own counted game.** `below`
  is relative to the score being shown (the submitted one for `POST`) and leaves out the player's
  own row, so an archive replay at 90% is not "better than" the same player's 80% from the day.
- **"Better than X%" is `below / (players − 1)`, rounded down.** Equal scores do not count as
  beaten, and the player is not compared with themselves. The comparison is hidden until 10
  players have a counted score (chainle waits for 12; the owner chose 10).
- **Reopening the results fetches fresh numbers.** The page keeps the last numbers per puzzle,
  with the score they compare, in `germle.v1.community-standings` and shows them at once. If they
  are for this score and it was counted, it asks `GET /api/standing?puzzle=<n>&player=<id>` for
  fresh ones (404 if the server has no score from that player, and the page then resends the
  moves). Otherwise, as for an archive replay with a different score, it sends the moves again,
  which answers the same numbers and stores nothing new. One request runs at a time.
- **The game never depends on the API.** Network errors, a 6-second timeout, error statuses and
  bodies that fail validation (types, histogram adding up to `players`, `below` and `bestCount`
  within range) all mean "no comparison". No error is shown and the results dialog never waits.
- **The response is `{ players, below, best, bestCount, histogram, counted }`.** The histogram uses
  the personal stats' ten bands. `histogramBand` moved from `src/stats.ts` to `src/score-bands.ts`,
  which has no DOM types, so the Worker can share it; `src/community-api.ts` holds the paths, the
  response type, its validator and the player ID format for both sides.
- **The server stores nothing but `puzzle_number`, `player_id`, `score` and `submitted_at`.** No
  moves, no IP address, no user agent. The table is `STRICT`, with a `CHECK` on the score, and an
  index on (puzzle number, score) answers each puzzle's tallies from the index alone (checked with
  `EXPLAIN QUERY PLAN` under `wrangler dev`). The Worker logs nothing about requests; a database
  error logs only the error.
- **Validation happens once, at the boundary.** `POST` only, `application/json` only, a 1 KB body
  limit enforced while reading the stream (not by trusting `Content-Length`), valid UTF-8, exactly
  the three fields, a v4 UUID, an integer puzzle number in the window, and at most 40 integer moves
  (one per person). Anything else gets a bare 400. A wrong method gets 405 with `Allow` rather than
  400, since it is the route, not the input, that is wrong; an unknown `/api/` path gets 404.
- **No captcha and no rate limiting in code.** Scores are anonymous and low-stakes, and server-side
  scoring rules out made-up scores, so the worst abuse is padding a curve with real games. If that
  happens, the owner can add a Cloudflare rate-limiting rule for `/api/*` in the dashboard
  (`DEPLOY.md` step 11).
- **Only `/api/*` runs the Worker first.** `assets.run_worker_first: ["/api/*"]` keeps every other
  path on the static assets with the same `html_handling` and `not_found_handling`. A request that
  matches no asset (an unknown path) still reaches the Worker, which hands it back through the
  `ASSETS` binding, so it gets the same 404. Verified under `wrangler dev` before and after:
  status, redirects, content type, the `_headers` security headers and body bytes of every probed
  path are unchanged, 404s included. `_headers` do not apply to the API's own responses, which set
  `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` themselves. The CSP's
  `connect-src 'self'` already allows the page's requests.
- **Preview deployments have no database.** Wrangler 4.148 gives previews only the bindings
  declared under `previews` (plus any set in the dashboard's preview settings); bindings are not
  inherited, which its schema and its preview code both state. `previews` declares none, so a
  preview's `DB` is absent and the API answers 503 there; the page then shows no comparison.
  Checked under `wrangler dev` with the binding removed. A separate preview database is a
  follow-up in `TODO.md`.
- **The production database ID was a placeholder until the owner created the database** (in the
  dashboard, 2026-10-08). Any non-empty `database_id` stops Wrangler from creating a database of
  its own on deploy (its "auto-provisioning"), so a deploy with the placeholder failed instead of
  quietly binding a new, empty database. The remaining steps are in `DEPLOY.md` 8–11 and
  `TODO.md`.
- **Migrations run in the Workers Builds deploy command, before `wrangler deploy`.** A deploy then
  never runs code that needs a table that does not exist yet, and a deploy with nothing new to
  apply is a no-op. Wrangler auto-confirms `migrations apply` when not interactive (checked).
- **Hand-written types for the D1 calls, the `WebWorker` lib for `Request` and `Response`.** No
  `@cloudflare/workers-types` and no Workers test pool: `worker/d1.ts` types the four D1 methods
  used, and `tsconfig.worker.json` (in `npm run typecheck`, as strict as the others) uses
  TypeScript's built-in `WebWorker` lib, the standard Fetch API types, with no DOM. The logic is
  unit-tested in Node with an in-memory store; the D1 adapter is checked under `wrangler dev`.
- **Wrangler stays `npx wrangler`.** Running the API locally downloads it on demand; see the README.
- **The comparison sits below Share, not between the verdict and Share.** The brief placed it
  under the score and verdict and allowed either reserving its space or revealing it without
  moving Share. Reserving space would leave an empty gap whenever there are no numbers, which is
  most puzzles while fewer than 10 people have played them, and always when the API is down.
  Below Share, numbers that arrive late push only the countdown and statistics, and an e2e test
  checks that Share stays put at 360 px. In practice the request starts as the last move is
  played, before its animation and the 0.7 s pause before the dialog opens, so the numbers are
  usually there when it opens; reopening shows cached numbers at once.
- **Wording: "Everyone's scores", "Better than 72% of 318 players", "Top score so far: 88% ·
  reached by 14 players".** "Top score so far" says the target was reached by players and can
  still rise, unlike the solver's par that was dropped (see "Par removed; a fixed verdict
  instead"): par measured players against a clairvoyant machine, while this is a score other
  people reached on the same puzzle. "reached by 14 players" never wraps inside itself. Numbers
  above 999 get a thousands separator.
- **The chart is ten columns of the same bands, with the player's band in the accent colour and
  marked "You".** The label is the cue that does not depend on colour. Bars are scaled to the
  fullest band, and a band with any players is at least 6% tall so a lone score stays visible.
  Each column carries screen-reader text ("70–79%: 70 players, your score"). The bar colour
  (`--color-chart-bar`) is tested at 3:1 against the dialog in both themes.
- **The share text is unchanged.** Its format is a public boundary; adding the percentile to it is
  left to the owner.
- **Page weight:** the daily page went from 21.4 KB to 23.3 KB gzipped (HTML, CSS and scripts).
- **The About page's privacy section lists exactly what the server keeps.** The owner's wording:
  no account and no name, progress in the browser, a random ID the browser generates that is not
  tied to a name or account, moves sent when a daily puzzle is finished, then a list of the four
  things kept (puzzle number, random ID, score, the date and time Germle received the score), and
  that clearing site data gives a new ID while scores already sent stay. "The time" is the
  server's receipt time in UTC, not the player's local time; the page says so to make clear it
  reveals no location. It replaces "No accounts, no tracking in the game", which stopped being the
  whole truth once scores leave the browser. The meta description now reads "No account needed".
