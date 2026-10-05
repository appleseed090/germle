import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG } from './engine';
import { pluralize } from './pluralize';
import { describePuzzleConfig } from './puzzle-summary';

describe('describePuzzleConfig', () => {
  it('states the daily constants', () => {
    expect(describePuzzleConfig(DAILY_PUZZLE_CONFIG)).toBe(
      '40 people · 4 vaccines · 2 outbreaks · 2 refusers · 35% contagious',
    );
  });

  it('uses the singular for one and rounds contagiousness to a whole percent', () => {
    expect(
      describePuzzleConfig({
        ...DAILY_PUZZLE_CONFIG,
        nodeCount: 20,
        vaccineCount: 1,
        indexPatientCount: 1,
        refuserCount: 1,
        transmissionProbability: 0.155,
      }),
    ).toBe('20 people · 1 vaccine · 1 outbreak · 1 refuser · 16% contagious');
  });
});

describe('pluralize', () => {
  it('picks the singular only for exactly one', () => {
    expect([0, 1, 2].map((count) => pluralize(count, 'vaccine', 'vaccines'))).toEqual([
      '0 vaccines',
      '1 vaccine',
      '2 vaccines',
    ]);
  });
});
