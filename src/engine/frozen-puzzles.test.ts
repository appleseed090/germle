import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG, TRANSMISSION_TURN_LIMIT, type PuzzleConfig } from './config';
import { dailySeedKey } from './daily';
import { applyTap, contactsStillInNetwork, isTappable, startGame, type GameState } from './game';
import { computeForceLayout, layoutBoundsFor } from './layout';
import { createPuzzle, type Puzzle } from './puzzle';
import { createStreamRandom, hashStringFnv1a32 } from './random';

/**
 * Locks what every published puzzle is. Players compare scores for the same number, saved games
 * are replayed move by move, and the archive replays past days, so a change to any of these
 * digests changes puzzles people have already played. If the change is deliberate, update the
 * snapshot with `npx vitest run -u src/engine/frozen-puzzles.test.ts` and record why in
 * DECISIONS.md.
 */
const FROZEN_DAILY_PUZZLE_COUNT = 365;

/** Practice links people may have saved: each seed with a different shape of config. */
const FROZEN_PRACTICE_PUZZLES: readonly (readonly [string, PuzzleConfig])[] = [
  ['practice-abc123', DAILY_PUZZLE_CONFIG],
  [
    'practice-big',
    { ...DAILY_PUZZLE_CONFIG, nodeCount: 80, ringNeighbourCount: 6, vaccineCount: 12 },
  ],
  [
    'practice-small',
    { ...DAILY_PUZZLE_CONFIG, nodeCount: 20, ringNeighbourCount: 2, refuserCount: 0 },
  ],
  [
    'practice-no-vaccines',
    { ...DAILY_PUZZLE_CONFIG, vaccineCount: 0, indexPatientCount: 5, refuserCount: 10 },
  ],
  ['practice-contagious', { ...DAILY_PUZZLE_CONFIG, transmissionProbability: 0.6 }],
];

const FROZEN_ROLL_TURNS = 40;

function digest(value: unknown): string {
  return hashStringFnv1a32(JSON.stringify(value)).toString(16).padStart(8, '0');
}

/**
 * A fixed, simple player, so the digest covers outbreak placement, transmission and the end of
 * the game. Vaccinates whoever has the most contacts still in the network; quarantines the healthy
 * person touching the most infected people, then the most contacts. Ties go to the lower index.
 */
function playScriptedGame(puzzle: Puzzle): GameState {
  let state = startGame(puzzle).state;
  while (state.phase !== 'ended') {
    const contacts = contactsStillInNetwork(puzzle.graph, state.nodeStatuses);
    let chosenNode = -1;
    let chosenPriority = -1;
    for (let node = 0; node < puzzle.config.nodeCount; node++) {
      if (!isTappable(puzzle, state, node)) continue;
      const infectedNeighbours =
        state.phase === 'quarantine'
          ? (puzzle.graph.adjacency[node] ?? []).filter(
              ({ neighbour }) => state.nodeStatuses[neighbour] === 'infected',
            ).length
          : 0;
      const priority = infectedNeighbours * 1000 + (contacts[node] ?? 0);
      if (priority > chosenPriority) {
        chosenNode = node;
        chosenPriority = priority;
      }
    }
    state = applyTap(puzzle, state, chosenNode).state;
  }
  return state;
}

/** One line per puzzle, so a failing diff names the puzzle and the part that changed. */
function describePuzzle(label: string, puzzle: Puzzle): string {
  const { graph } = puzzle;
  const layout = computeForceLayout(
    graph,
    createStreamRandom(puzzle.seedKey, 'layout'),
    layoutBoundsFor(puzzle.config.nodeCount),
  );
  const rolls = graph.edges.map((_, edgeIndex) =>
    Array.from({ length: Math.min(FROZEN_ROLL_TURNS, TRANSMISSION_TURN_LIMIT) }, (__, turn) =>
      puzzle.transmissionRolls.roll(edgeIndex, turn),
    ),
  );
  const parts = {
    graph: digest(graph.edges),
    refusers: digest(puzzle.isRefuser),
    layout: digest(layout),
    rolls: digest(rolls),
    game: digest(playScriptedGame(puzzle)),
  };
  return `${label} ${Object.entries(parts)
    .map(([part, value]) => `${part}=${value}`)
    .join(' ')}`;
}

describe('published puzzles', () => {
  it(`stay exactly as they were for daily puzzles #1–#${FROZEN_DAILY_PUZZLE_COUNT} and saved practice links`, async () => {
    const lines: string[] = [];
    for (let puzzleNumber = 1; puzzleNumber <= FROZEN_DAILY_PUZZLE_COUNT; puzzleNumber++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, dailySeedKey(puzzleNumber));
      lines.push(describePuzzle(`#${puzzleNumber}`, puzzle));
    }
    for (const [seedKey, config] of FROZEN_PRACTICE_PUZZLES)
      lines.push(describePuzzle(seedKey, createPuzzle(config, seedKey)));
    await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot('./frozen-puzzles.snapshot.txt');
  });
});
