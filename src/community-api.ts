import { HISTOGRAM_BAND_COUNT } from './score-bands';

/**
 * The wire format of the community score API, shared by the page and the Worker in `worker/`.
 * DOM-free, so the Worker can import it. Paths, field names and the player ID format are a
 * boundary: a deployed page and a deployed Worker must agree on them.
 */

/** `POST` a {@link ResultSubmission}; answers a {@link CommunityStanding}. */
export const RESULTS_PATH = '/api/results';

/**
 * `GET` with `?puzzle=<n>&player=<id>`; answers the {@link CommunityStanding} of the player's
 * counted score, or 404 if the player has none for that puzzle.
 */
export const STANDING_PATH = '/api/standing';

/** A finished daily game as the page sends it: the moves, never the score. */
export interface ResultSubmission {
  readonly puzzleNumber: number;
  readonly playerId: string;
  readonly moves: readonly number[];
}

/**
 * Anonymous numbers for one puzzle, relative to one score: the score just submitted (`POST`),
 * or the player's counted score (`GET`).
 */
export interface CommunityStanding {
  /** Players with a counted score for the puzzle, the requesting player included once counted. */
  readonly players: number;
  /** Other players whose counted score is strictly lower; equal scores are not beaten. */
  readonly below: number;
  /** The highest counted score. */
  readonly best: number;
  /** How many players reached {@link best}. */
  readonly bestCount: number;
  /** Counted scores per band, as `histogramBand` in `score-bands.ts` assigns them. */
  readonly histogram: readonly number[];
  /** Whether this player's score counts: their first submission for the puzzle. */
  readonly counted: boolean;
}

const PLAYER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Whether a value is a player ID: a lowercase version 4 UUID, as `crypto.randomUUID()` makes. */
export function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && PLAYER_ID_PATTERN.test(value);
}

/**
 * Validates an untrusted standing (a response body, a cached copy) and returns it, or `undefined`
 * if any field is missing, mistyped or inconsistent with the others: the histogram must add up to
 * `players`, and `below` and `bestCount` must fit within it.
 */
export function parseCommunityStanding(value: unknown): CommunityStanding | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const fields = value as Record<string, unknown>;
  const players = fields['players'];
  const below = fields['below'];
  const best = fields['best'];
  const bestCount = fields['bestCount'];
  const histogram = fields['histogram'];
  const counted = fields['counted'];
  if (
    !isCount(players) ||
    !isCount(below) ||
    !isCount(best) ||
    !isCount(bestCount) ||
    typeof counted !== 'boolean' ||
    !Array.isArray(histogram) ||
    histogram.length !== HISTOGRAM_BAND_COUNT ||
    !histogram.every(isCount)
  ) {
    return undefined;
  }
  const histogramTotal = histogram.reduce((sum, count) => sum + count, 0);
  const isConsistent =
    players >= 1 &&
    histogramTotal === players &&
    below < players &&
    best <= 100 &&
    bestCount >= 1 &&
    bestCount <= players;
  if (!isConsistent) return undefined;
  return { players, below, best, bestCount, histogram, counted };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
