import { describe, expect, it } from 'vitest';
import { describeParComparison } from './outcome-breakdown';

describe('describeParComparison', () => {
  it('celebrates, acknowledges or measures the gap', () => {
    expect(describeParComparison(90, 85)).toBe('Par 85% · You beat par!');
    expect(describeParComparison(85, 85)).toBe('Par 85% · You matched par.');
    expect(describeParComparison(84, 85)).toBe('Par 85% · 1 point below par');
    expect(describeParComparison(70, 85)).toBe('Par 85% · 15 points below par');
  });
});
