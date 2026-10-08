import { describe, expect, it } from 'vitest';
import { histogramBand, histogramBandLabel } from './score-bands';

describe('histogramBand', () => {
  it('puts 100 in the top band', () => {
    expect(histogramBand(0)).toBe(0);
    expect(histogramBand(89)).toBe(8);
    expect(histogramBand(90)).toBe(9);
    expect(histogramBand(100)).toBe(9);
  });
});

describe('histogramBandLabel', () => {
  it('names each band by its scores, the top one ending at 100', () => {
    expect(histogramBandLabel(0)).toBe('0–9');
    expect(histogramBandLabel(8)).toBe('80–89');
    expect(histogramBandLabel(9)).toBe('90–100');
  });
});
