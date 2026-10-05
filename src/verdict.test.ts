import { describe, expect, it } from 'vitest';
import { CONTAINED_THRESHOLD_PERCENT, verdictForScore } from './verdict';

describe('verdictForScore', () => {
  it('calls 70% and above contained and anything below spread', () => {
    expect(CONTAINED_THRESHOLD_PERCENT).toBe(70);
    expect(verdictForScore(100)).toBe('Contained');
    expect(verdictForScore(70)).toBe('Contained');
    expect(verdictForScore(69)).toBe('Spread');
    expect(verdictForScore(0)).toBe('Spread');
  });
});
