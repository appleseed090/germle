/** One counted game: a player's first finished game of a daily puzzle. */
export interface StoredResult {
  readonly puzzleNumber: number;
  readonly playerId: string;
  /** 0–100, computed on the server by replaying the submitted moves. */
  readonly score: number;
  /** Unix time in seconds. */
  readonly submittedAt: number;
}

/** How many players have one counted score for a puzzle. */
export interface ScoreTally {
  readonly score: number;
  readonly players: number;
}

/**
 * Everything the API needs from the database, so request handling can be tested with an
 * in-memory fake. The production implementation is `createD1ResultsStore`.
 */
export interface ResultsStore {
  /**
   * Stores the result unless the player already has one for that puzzle; the first one counts.
   *
   * @returns `true` if stored, `false` if an earlier result was kept.
   */
  insertIfFirst(result: StoredResult): Promise<boolean>;
  /** The player's counted score for the puzzle, or `undefined` if they have none. */
  countedScore(puzzleNumber: number, playerId: string): Promise<number | undefined>;
  /** One tally per distinct counted score of the puzzle, in any order. */
  scoreTallies(puzzleNumber: number): Promise<readonly ScoreTally[]>;
}
