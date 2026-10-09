import {
  RESULTS_PATH,
  STANDING_PATH,
  parseCommunityStanding,
  type CommunityStanding,
  type ResultSubmission,
} from './community-api';
import type { Messages } from './i18n/messages';
import { histogramBand, histogramBandLabel } from './score-bands';
import type { GameStorage } from './storage';

/** The comparison stays hidden until this many players have a counted score. */
export const MINIMUM_PLAYERS_SHOWN = 10;

const REQUEST_TIMEOUT_MILLISECONDS = 6000;

/** The community score API as the page uses it. Every failure resolves to `undefined`. */
export interface CommunityApi {
  /** Sends a finished game; safe to repeat, since only a player's first game counts. */
  submit(submission: ResultSubmission): Promise<CommunityStanding | undefined>;
  /**
   * Fresh numbers for the player's counted score.
   *
   * @returns `'not-counted'` if the server has no score from this player for the puzzle.
   */
  fetchStanding(
    puzzleNumber: number,
    playerId: string,
  ): Promise<CommunityStanding | 'not-counted' | undefined>;
}

/** The slice of `fetch` the API client needs, so tests can pass a fake. */
export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

/**
 * A client for the same-origin API in `worker/`. Network errors, timeouts, error statuses and
 * malformed bodies all resolve to `undefined`, so the game never depends on the API.
 */
export function createCommunityApi(fetchFunction: FetchFunction): CommunityApi {
  const request = async (
    url: string,
    init: RequestInit,
  ): Promise<{ readonly status: number; readonly body: unknown } | undefined> => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MILLISECONDS);
    try {
      const response = await fetchFunction(url, { ...init, signal: controller.signal });
      if (response.status !== 200) return { status: response.status, body: undefined };
      return { status: 200, body: (await response.json()) as unknown };
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async submit(submission) {
      const response = await request(RESULTS_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });
      return parseCommunityStanding(response?.body);
    },
    async fetchStanding(puzzleNumber, playerId) {
      const query = new URLSearchParams({ puzzle: String(puzzleNumber), player: playerId });
      const response = await request(`${STANDING_PATH}?${query.toString()}`, { method: 'GET' });
      if (response?.status === 404) return 'not-counted';
      return parseCommunityStanding(response?.body);
    },
  };
}

/** What the comparison needs from the page. */
export interface CommunityComparisonOptions {
  readonly puzzleNumber: number;
  readonly api: CommunityApi;
  readonly storage: Pick<
    GameStorage,
    'loadOrCreatePlayerId' | 'loadCommunityStandings' | 'saveCommunityStanding'
  >;
  /** Makes a new player ID; `crypto.randomUUID` in the browser. May throw where unavailable. */
  readonly createPlayerId: () => string;
  /** Shows numbers for `score`, or hides them when `undefined`. Called again as fresher ones come. */
  readonly onStanding: (standing: CommunityStanding | undefined, score: number) => void;
}

/** The community comparison of one daily puzzle's finished game. */
export interface CommunityComparison {
  /**
   * Shows the cached numbers for this score at once, then asks the server for fresh ones: a `GET`
   * when the cached ones are for this player's counted score, otherwise the moves are sent
   * (again), which also covers a game that ended offline or a request that failed. Only one
   * request runs at a time; a call while one is running only shows the cache.
   */
  refresh(moves: readonly number[], score: number): void;
}

/** Binds the comparison for the puzzle on this page. Practice games must never use it. */
export function createCommunityComparison(
  options: CommunityComparisonOptions,
): CommunityComparison {
  const { puzzleNumber, api, storage, onStanding } = options;
  let isRequestRunning = false;

  const requestFreshStanding = async (
    moves: readonly number[],
    cached: CommunityStanding | undefined,
  ): Promise<CommunityStanding | undefined> => {
    const playerId = loadOrCreatePlayerId(options);
    if (playerId === undefined) return undefined;
    if (cached?.counted === true) {
      const fresh = await api.fetchStanding(puzzleNumber, playerId);
      if (fresh !== 'not-counted') return fresh;
    }
    return api.submit({ puzzleNumber, playerId, moves });
  };

  return {
    refresh(moves, score) {
      const cachedEntry = storage.loadCommunityStandings().get(puzzleNumber);
      const cached = cachedEntry?.score === score ? cachedEntry.standing : undefined;
      onStanding(cached, score);
      if (isRequestRunning) return;
      isRequestRunning = true;
      void requestFreshStanding(moves, cached)
        .then((fresh) => {
          if (fresh === undefined) return;
          storage.saveCommunityStanding(puzzleNumber, { score, standing: fresh });
          onStanding(fresh, score);
        })
        .finally(() => {
          isRequestRunning = false;
        });
    },
  };
}

function loadOrCreatePlayerId(options: CommunityComparisonOptions): string | undefined {
  try {
    return options.storage.loadOrCreatePlayerId(options.createPlayerId);
  } catch {
    return undefined;
  }
}

/** Whether enough players have played for the comparison to be shown. */
export function isStandingShown(
  standing: CommunityStanding | undefined,
): standing is CommunityStanding {
  return standing !== undefined && standing.players >= MINIMUM_PLAYERS_SHOWN;
}

/**
 * The share of the other players with a lower score, rounded down: equal scores are not beaten,
 * and the player is not compared with themselves.
 */
export function percentBeaten(standing: CommunityStanding): number {
  const otherPlayers = standing.players - 1;
  return otherPlayers === 0 ? 0 : Math.floor((100 * standing.below) / otherPlayers);
}

/** "Better than 72% of 318 players" in English. */
export function describeRank(standing: CommunityStanding, text: Messages['community']): string {
  return text.rank(percentBeaten(standing), standing.players);
}

/**
 * The top score and how many reached it, as two parts the page joins with " · " ("Top score so
 * far: 88%" and "reached by 14 players" in English) so that a narrow screen wraps between them.
 */
export function describeTopScore(
  standing: CommunityStanding,
  text: Messages['community'],
): readonly [string, string] {
  return [text.topScore(standing.best), text.reachedBy(standing.bestCount)];
}

/** One column of the community chart. */
export interface ChartBand {
  /** The band's scores, as in the personal histogram: `70–79`. */
  readonly label: string;
  readonly players: number;
  /** Bar height as a percentage of the chart's: the fullest band is 100, an empty one 0. */
  readonly heightPercent: number;
  /** Whether the player's own score falls in this band. */
  readonly isPlayersBand: boolean;
}

/** A band with any players is drawn at least this tall, so a lone score never disappears. */
export const SMALLEST_VISIBLE_BAR_PERCENT = 6;

/** Maps the counted scores to chart columns, highlighting the band of `score`. */
export function communityChartBands(standing: CommunityStanding, score: number): ChartBand[] {
  const fullestBand = Math.max(...standing.histogram);
  const playersBand = histogramBand(score);
  return standing.histogram.map((players, band) => ({
    label: histogramBandLabel(band),
    players,
    heightPercent:
      players === 0 ? 0 : Math.max(SMALLEST_VISIBLE_BAR_PERCENT, (100 * players) / fullestBand),
    isPlayersBand: band === playersBand,
  }));
}
