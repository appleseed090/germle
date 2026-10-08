import { describe, expect, it } from 'vitest';
import { parseCommunityStanding } from '../src/community-api';
import { computeStanding } from './standing';

const TALLIES = [
  { score: 55, players: 3 },
  { score: 88, players: 2 },
  { score: 70, players: 4 },
  { score: 5, players: 1 },
];

describe('computeStanding', () => {
  it('counts players, lower scores, the best score and the bands', () => {
    const standing = computeStanding(TALLIES, 70, 70, true);
    expect(standing).toEqual({
      players: 10,
      below: 4,
      best: 88,
      bestCount: 2,
      histogram: [1, 0, 0, 0, 0, 3, 0, 4, 2, 0],
      counted: true,
    });
    expect(parseCommunityStanding(standing)).toEqual(standing);
  });

  it('does not count equal scores as beaten', () => {
    expect(computeStanding(TALLIES, 88, 88, true).below).toBe(8);
    expect(computeStanding(TALLIES, 5, 5, true).below).toBe(0);
  });

  it("leaves the player's own counted score out of a repeat game's comparison", () => {
    // Counted 55 earlier, now replayed for 70: the other two 55s and the 5 are below.
    expect(computeStanding(TALLIES, 70, 55, false)).toMatchObject({
      players: 10,
      below: 3,
      counted: false,
    });
    // Counted 88 earlier, now replayed for 70: the earlier 88 is above, so nothing changes.
    expect(computeStanding(TALLIES, 70, 88, false).below).toBe(4);
  });

  it('puts 100 in the top band', () => {
    expect(computeStanding([{ score: 100, players: 1 }], 100, 100, true)).toMatchObject({
      best: 100,
      bestCount: 1,
      histogram: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    });
  });
});
