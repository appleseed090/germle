import { isPlayerId, type ResultSubmission } from '../src/community-api';
import {
  DAILY_PUZZLE_CONFIG,
  countOutcomes,
  createPuzzle,
  dailySeedKey,
  puzzleNumberForDate,
  replayMoves,
  scorePercent,
} from '../src/engine';

/** A finished game cannot have more moves than people: each move removes one healthy person. */
const MOST_MOVES_IN_A_GAME = DAILY_PUZZLE_CONFIG.nodeCount;

const SUBMISSION_FIELDS = ['puzzleNumber', 'playerId', 'moves'] as const;

/**
 * The highest puzzle number accepted at `now`: one above the number for the current UTC date.
 * The game switches puzzles at each player's local midnight, so time zones east of UTC are on
 * the next puzzle for part of the UTC day.
 */
export function latestAcceptedPuzzleNumber(now: Date): number {
  return (
    puzzleNumberForDate({
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    }) + 1
  );
}

/**
 * Validates an untrusted request body: exactly the three submission fields, a puzzle number from
 * 1 to `latestPuzzleNumber`, a player ID, and at most one move per person, each an integer.
 * Whether the moves are legal is left to {@link scoreFinishedGame}.
 */
export function parseSubmission(
  value: unknown,
  latestPuzzleNumber: number,
): ResultSubmission | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const fields = value as Record<string, unknown>;
  const keys = Object.keys(fields);
  if (keys.length !== SUBMISSION_FIELDS.length) return undefined;
  if (!SUBMISSION_FIELDS.every((field) => keys.includes(field))) return undefined;
  const puzzleNumber = fields['puzzleNumber'];
  const playerId = fields['playerId'];
  const moves = fields['moves'];
  if (!isAcceptedPuzzleNumber(puzzleNumber, latestPuzzleNumber) || !isPlayerId(playerId))
    return undefined;
  if (!Array.isArray(moves) || moves.length > MOST_MOVES_IN_A_GAME) return undefined;
  if (!moves.every((move) => Number.isSafeInteger(move))) return undefined;
  return { puzzleNumber, playerId, moves: moves as number[] };
}

/**
 * Reads the untrusted query of a standing request: `puzzle` as a plain whole number from 1 to
 * `latestPuzzleNumber`, and `player` as a player ID.
 */
export function parseStandingQuery(
  parameters: URLSearchParams,
  latestPuzzleNumber: number,
): { readonly puzzleNumber: number; readonly playerId: string } | undefined {
  const puzzleText = parameters.get('puzzle') ?? '';
  const playerId = parameters.get('player');
  if (!/^[1-9][0-9]{0,6}$/.test(puzzleText)) return undefined;
  const puzzleNumber = Number(puzzleText);
  if (!isAcceptedPuzzleNumber(puzzleNumber, latestPuzzleNumber) || !isPlayerId(playerId))
    return undefined;
  return { puzzleNumber, playerId };
}

/**
 * Rebuilds the daily puzzle and replays the moves with the game's own engine.
 *
 * @returns The score, or `undefined` if a move is illegal or the game has not ended.
 */
export function scoreFinishedGame(
  puzzleNumber: number,
  moves: readonly number[],
): number | undefined {
  const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, dailySeedKey(puzzleNumber));
  const state = replayMoves(puzzle, moves);
  if (state?.phase !== 'ended') return undefined;
  return scorePercent(countOutcomes(state));
}

function isAcceptedPuzzleNumber(value: unknown, latestPuzzleNumber: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= latestPuzzleNumber
  );
}
