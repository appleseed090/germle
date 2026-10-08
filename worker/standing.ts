import type { CommunityStanding } from '../src/community-api';
import { HISTOGRAM_BAND_COUNT, histogramBand } from '../src/score-bands';
import type { ScoreTally } from './results-store';

/**
 * The anonymous numbers for one score of a puzzle.
 *
 * @param tallies - The puzzle's counted scores; non-empty, since the caller's own result or an
 *   earlier one of theirs is among them.
 * @param score - The score to compare: the one just submitted, or the player's counted score.
 * @param ownCountedScore - The requesting player's counted score. It is left out of `below`, so
 *   a repeat game is never compared with the same player's first one.
 * @param counted - Whether `score` is the player's counted score, passed through to the answer.
 */
export function computeStanding(
  tallies: readonly ScoreTally[],
  score: number,
  ownCountedScore: number,
  counted: boolean,
): CommunityStanding {
  const histogram = new Array<number>(HISTOGRAM_BAND_COUNT).fill(0);
  let players = 0;
  let lowerScores = 0;
  let best = 0;
  let bestCount = 0;
  for (const tally of tallies) {
    players += tally.players;
    if (tally.score < score) lowerScores += tally.players;
    const band = histogramBand(tally.score);
    histogram[band] = (histogram[band] ?? 0) + tally.players;
    if (tally.score > best || bestCount === 0) {
      best = tally.score;
      bestCount = tally.players;
    }
  }
  const below = ownCountedScore < score ? lowerScores - 1 : lowerScores;
  return { players, below, best, bestCount, histogram, counted };
}
