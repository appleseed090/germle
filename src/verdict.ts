/** Lowest score, in percent saved, that counts as containing the outbreak. */
export const CONTAINED_THRESHOLD_PERCENT = 70;

/** The one-word outcome of a finished game. */
export type Verdict = 'Contained' | 'Spread';

/**
 * Names a finished game's outcome from its score as shown to the player (whole percent saved):
 * `Contained` at {@link CONTAINED_THRESHOLD_PERCENT} or above, `Spread` below. The threshold is
 * the same for every daily puzzle and for practice.
 */
export function verdictForScore(score: number): Verdict {
  return score >= CONTAINED_THRESHOLD_PERCENT ? 'Contained' : 'Spread';
}
