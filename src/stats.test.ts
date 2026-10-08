import { describe, expect, it } from 'vitest';
import { computePlayerStats } from './stats';
import type { DailyResult } from './storage';

function resultsFor(entries: [number, number][]): Map<number, DailyResult> {
  return new Map(
    entries.map(([puzzleNumber, score]) => [
      puzzleNumber,
      { score, counts: { vaccinated: 4, quarantined: 0, untouched: 0, infected: 36 } },
    ]),
  );
}

describe('computePlayerStats', () => {
  it('is empty for a new player', () => {
    expect(computePlayerStats(new Map(), 10)).toEqual({
      played: 0,
      currentStreak: 0,
      bestScore: undefined,
      histogram: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it('counts the streak through today, or through yesterday before today is played', () => {
    const results = resultsFor([
      [5, 40],
      [7, 60],
      [8, 75],
      [9, 100],
    ]);
    expect(computePlayerStats(results, 9).currentStreak).toBe(3);
    expect(computePlayerStats(results, 10).currentStreak).toBe(3);
    expect(computePlayerStats(results, 11).currentStreak).toBe(0);
  });

  it('tracks played, best score and score bands', () => {
    const stats = computePlayerStats(
      resultsFor([
        [1, 9],
        [2, 10],
        [3, 95],
        [4, 100],
      ]),
      4,
    );
    expect(stats.played).toBe(4);
    expect(stats.bestScore).toBe(100);
    expect(stats.histogram).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 2]);
  });
});
