# Engine specification

The rules Germle's engine (`src/engine/`) implements. The engine is pure TypeScript with no DOM
access; the UI only calls its public surface in `src/engine/index.ts`. Where the original brief
left a choice open, the choice made is stated here and logged in `DECISIONS.md`.

## Seeding

- **Puzzle number.** `puzzleNumber = days from LAUNCH_DATE to today + 1`, using the player's
  local calendar date (Y-M-D components compared via UTC midnights, so DST never matters).
  `LAUNCH_DATE` is in `src/engine/daily.ts`.
- **Seed key.** Daily puzzles use the puzzle number in decimal (`"17"`). Practice puzzles use
  `practice-<seed text>`.
- **Streams.** Each named stream gets its own 32-bit seed: FNV-1a 32 of
  `germle:v1:<seedKey>:<streamName>`, for `graph`, `layout`, `refusers`, `outbreaks`,
  `transmission`. Each stream is a separate Mulberry32 generator, so draws in one stream never
  shift another.
- Changing anything in this section, or any constant in `DAILY_PUZZLE_CONFIG`, changes every
  daily puzzle.

## Puzzle

| Constant                   | Daily value |
| -------------------------- | ----------- |
| People (nodes)             | 40          |
| Ring degree                | 4           |
| Rewire probability         | 0.1         |
| Refusers                   | 2           |
| Vaccines                   | 4           |
| Index patients             | 2           |
| Transmission probability β | 0.35        |

- **Graph (`graph` stream).** Watts–Strogatz: a ring where node `i` links to `i+1` and `i+2`
  (mod 40). For each ring edge, in order of `i` then distance, draw once; with probability 0.1
  replace the far end with a node drawn uniformly from the other 39 nodes. Duplicate pairs are
  dropped, keeping the first appearance; self-loops cannot arise. Surviving edges are numbered in
  that order. If the graph is not connected, the whole construction repeats with the next draws
  of the same stream.
- **Refusers (`refusers` stream).** Shuffle all nodes (Durstenfeld, from the last index down);
  the first two are refusers. Refusers cannot be vaccinated but can be infected or quarantined.
- **Layout (`layout` stream).** Renderer-only; it never affects the game. Random starting
  positions in a 360 × 480 logical space, 500 Fruchterman–Reingold iterations with linear
  cooling and weak gravity, then stretched to fill the space with a 24-unit margin and nodes
  closer than 40 units pushed apart. Practice networks above 40 people get a proportionally larger
  space.

## Play

- **Vaccinate phase.** Tapping a susceptible non-refuser vaccinates them; they and their edges
  leave the network. Spending the last vaccine starts the outbreak in the same move.
- **Outbreak start (`outbreaks` stream).** Shuffle the currently susceptible people (refusers
  included). Trying each in shuffled order as the first pick, fill the remaining picks greedily in
  shuffled order with people not adjacent to any pick; the first fully non-adjacent set wins.
  For two index patients this always finds a non-adjacent pair when one exists. If none exists,
  the first attempt is topped up in shuffled order. If the outbreak is already contained, the game
  ends at once.
- **Quarantine phase.** Tapping any susceptible person (refusers included) quarantines them,
  removing them and their edges, then advances the epidemic exactly one turn. Quarantines are
  unlimited. Infected people cannot be tapped. There is no recovery or death.
- **Turns.** Turns are numbered from 0; the first quarantine plays turn 0.

## Transmission (`transmission` stream)

- `roll[edge][turn]` for turns 0–199 is generated a turn at a time, in edge order, and memoised,
  so access order cannot change any value.
- On a turn, each susceptible person with at least one infected neighbour becomes infected if
  any shared edge's roll for that turn is **strictly below** β. Only people infected before the
  turn began can infect.
- **Never fizzle.** If no roll succeeds while at least one susceptible–infected edge exists, the
  susceptible end of the exposed edge with the lowest roll is infected (ties: lower edge index).
- Every turn is played, even one with nobody exposed (it simply infects nobody), so each
  quarantine always passes exactly one day.

## End and score

- After the outbreak starts and after each turn, compute connected components over the people
  still in the network (susceptible and infected). The game ends when no component contains both
  an infected and a susceptible person.
- Score = `round(100 × (untouched + quarantined + vaccinated) / people)`, rounding halves up. The
  four counts (vaccinated, quarantined, untouched, infected) are reported with it.
