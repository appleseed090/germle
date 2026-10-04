import { describe, expect, it } from 'vitest';
import { formatCountdown, nextPuzzleStart } from './countdown';

describe('nextPuzzleStart', () => {
  it('is the local midnight after the day, across month and year ends', () => {
    expect(nextPuzzleStart({ year: 2026, month: 10, day: 4 })).toEqual(new Date(2026, 9, 5));
    expect(nextPuzzleStart({ year: 2026, month: 10, day: 31 })).toEqual(new Date(2026, 10, 1));
    expect(nextPuzzleStart({ year: 2026, month: 12, day: 31 })).toEqual(new Date(2027, 0, 1));
  });
});

describe('formatCountdown', () => {
  it('formats as HH:MM:SS, rounding up partial seconds', () => {
    expect(formatCountdown(3_600_000)).toBe('01:00:00');
    expect(formatCountdown(61_500)).toBe('00:01:02');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });
});
