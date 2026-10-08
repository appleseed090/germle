import { describe, expect, it } from 'vitest';
import { isPlayerId, parseCommunityStanding } from './community-api';

const STANDING = {
  players: 12,
  below: 7,
  best: 88,
  bestCount: 2,
  histogram: [0, 0, 1, 0, 2, 3, 0, 4, 2, 0],
  counted: true,
};

describe('isPlayerId', () => {
  it('accepts what crypto.randomUUID makes, and nothing else', () => {
    expect(isPlayerId(crypto.randomUUID())).toBe(true);
    expect(isPlayerId('3f1c2a9e-5b7d-4c8e-9a1f-2b3c4d5e6f70')).toBe(true);
    expect(isPlayerId('3F1C2A9E-5B7D-4C8E-9A1F-2B3C4D5E6F70')).toBe(false);
    expect(isPlayerId('3f1c2a9e-5b7d-1c8e-9a1f-2b3c4d5e6f70')).toBe(false);
    expect(isPlayerId(' 3f1c2a9e-5b7d-4c8e-9a1f-2b3c4d5e6f70')).toBe(false);
    expect(isPlayerId(42)).toBe(false);
  });
});

describe('parseCommunityStanding', () => {
  it('returns a valid standing, without extra fields', () => {
    expect(parseCommunityStanding({ ...STANDING, extra: 'x' })).toEqual(STANDING);
  });

  it.each([
    ['not an object', [STANDING]],
    ['a missing field', { ...STANDING, counted: undefined }],
    ['a count as text', { ...STANDING, players: '12' }],
    ['a negative count', { ...STANDING, below: -1 }],
    ['a fractional count', { ...STANDING, best: 87.5 }],
    ['a histogram that does not add up', { ...STANDING, players: 13 }],
    ['a histogram of the wrong length', { ...STANDING, histogram: [12] }],
    ['more players below than others', { ...STANDING, below: 12 }],
    ['a best score above 100', { ...STANDING, best: 101 }],
    ['nobody at the best score', { ...STANDING, bestCount: 0 }],
    ['more at the best score than players', { ...STANDING, bestCount: 13 }],
    ['no players', { ...STANDING, players: 0, below: 0, histogram: new Array(10).fill(0) }],
  ])('rejects %s', (_, value) => {
    expect(parseCommunityStanding(value)).toBeUndefined();
  });
});
