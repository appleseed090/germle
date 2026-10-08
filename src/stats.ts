import { HISTOGRAM_BAND_COUNT, histogramBand } from './score-bands';
import type { DailyResult } from './storage';

/** Summary statistics over a player's finished daily games. */
export interface PlayerStats {
  readonly played: number;
  /** Consecutive days played, ending today, or yesterday if today is not played yet. */
  readonly currentStreak: number;
  readonly bestScore: number | undefined;
  /** Games per score band: `[0–9, 10–19, …, 80–89, 90–100]`. */
  readonly histogram: readonly number[];
}

/**
 * Computes stats from finished games. The streak counts days played, not days won, to keep the
 * game low-pressure. Results numbered after today (a clock that moved backwards) count towards
 * `played` but not the streak.
 */
export function computePlayerStats(
  results: ReadonlyMap<number, DailyResult>,
  todayPuzzleNumber: number,
): PlayerStats {
  const histogram = new Array<number>(HISTOGRAM_BAND_COUNT).fill(0);
  let bestScore: number | undefined;
  for (const { score } of results.values()) {
    const band = histogramBand(score);
    histogram[band] = (histogram[band] ?? 0) + 1;
    bestScore = Math.max(bestScore ?? 0, score);
  }
  let streakEnd = todayPuzzleNumber;
  if (!results.has(streakEnd)) streakEnd--;
  let currentStreak = 0;
  while (results.has(streakEnd - currentStreak)) currentStreak++;
  return { played: results.size, currentStreak, bestScore, histogram };
}
