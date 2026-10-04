import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG, validatePuzzleConfig } from './config';

describe('validatePuzzleConfig', () => {
  it('accepts the daily config', () => {
    expect(validatePuzzleConfig(DAILY_PUZZLE_CONFIG)).toBe(DAILY_PUZZLE_CONFIG);
  });

  it.each([
    ['too few nodes', { nodeCount: 5 }],
    ['too many nodes', { nodeCount: 81 }],
    ['fractional nodes', { nodeCount: 40.5 }],
    ['odd ring degree', { ringNeighbourCount: 3 }],
    ['ring degree above 6', { ringNeighbourCount: 8 }],
    ['rewire probability above 1', { rewireProbability: 1.5 }],
    ['zero transmission probability', { transmissionProbability: 0 }],
    ['non-finite transmission probability', { transmissionProbability: Number.NaN }],
    ['more vaccines than non-refusers', { refuserCount: 38, vaccineCount: 3 }],
    ['no index patients', { indexPatientCount: 0 }],
    [
      'index patients beyond the unvaccinated',
      { vaccineCount: 39, refuserCount: 0, indexPatientCount: 2 },
    ],
  ])('rejects %s', (_, override) => {
    expect(() => validatePuzzleConfig({ ...DAILY_PUZZLE_CONFIG, ...override })).toThrow(RangeError);
  });
});
