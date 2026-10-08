import {
  DAILY_PUZZLE_CONFIG,
  applyTap,
  createPuzzle,
  dailySeedKey,
  isTappable,
  startGame,
  type GameState,
} from '../src/engine';
import type { ResultsStore, ScoreTally, StoredResult } from './results-store';

/**
 * Plays a daily puzzle with a fixed strategy and returns its moves.
 *
 * @param pickFromEnd - Tap the last tappable person each move instead of the first, which plays
 *   a different game.
 * @param moveLimit - Stop after this many moves, for unfinished games.
 */
export function playScriptedGame(
  puzzleNumber: number,
  { pickFromEnd = false, moveLimit = Infinity } = {},
): number[] {
  const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, dailySeedKey(puzzleNumber));
  let state: GameState = startGame(puzzle).state;
  while (state.phase !== 'ended' && state.moves.length < moveLimit) {
    const people = Array.from({ length: puzzle.config.nodeCount }, (_, node) => node);
    if (pickFromEnd) people.reverse();
    const node = people.find((person) => isTappable(puzzle, state, person));
    if (node === undefined) throw new Error('No tappable person in a running game');
    state = applyTap(puzzle, state, node).state;
  }
  return [...state.moves];
}

/** A {@link ResultsStore} in memory, with the rows exposed for assertions. */
export function createMemoryResultsStore(): ResultsStore & { readonly rows: StoredResult[] } {
  const rows: StoredResult[] = [];
  const find = (puzzleNumber: number, playerId: string): StoredResult | undefined =>
    rows.find((row) => row.puzzleNumber === puzzleNumber && row.playerId === playerId);
  return {
    rows,
    insertIfFirst: (result) => {
      if (find(result.puzzleNumber, result.playerId) !== undefined) return Promise.resolve(false);
      rows.push(result);
      return Promise.resolve(true);
    },
    countedScore: (puzzleNumber, playerId) => Promise.resolve(find(puzzleNumber, playerId)?.score),
    scoreTallies: (puzzleNumber) => {
      const players = new Map<number, number>();
      for (const row of rows)
        if (row.puzzleNumber === puzzleNumber)
          players.set(row.score, (players.get(row.score) ?? 0) + 1);
      return Promise.resolve(
        [...players].map(([score, count]): ScoreTally => ({ score, players: count })),
      );
    },
  };
}
