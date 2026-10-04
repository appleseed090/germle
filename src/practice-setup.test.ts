import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG, validatePuzzleConfig } from './engine';
import {
  normaliseSeed,
  parsePracticeParameters,
  practiceParameters,
  practiceSeedKey,
  randomSeed,
} from './practice-setup';

const fixedSeed = (): string => 'fallback';

describe('parsePracticeParameters', () => {
  it('defaults to the daily constants and the fallback seed', () => {
    const setup = parsePracticeParameters(new URLSearchParams(), fixedSeed);
    expect(setup.config).toEqual(DAILY_PUZZLE_CONFIG);
    expect(setup.seed).toBe('fallback');
  });

  it('round-trips through practiceParameters', () => {
    const setup = parsePracticeParameters(
      new URLSearchParams(
        'people=60&neighbours=6&vaccines=7&outbreaks=3&refusers=5&contagion=48&seed=abc-123',
      ),
      fixedSeed,
    );
    expect(setup.config).toMatchObject({
      nodeCount: 60,
      ringNeighbourCount: 6,
      vaccineCount: 7,
      transmissionProbability: 0.48,
    });
    expect(parsePracticeParameters(practiceParameters(setup), fixedSeed)).toEqual(setup);
  });

  it('clamps, rounds to the slider step and ignores junk', () => {
    const setup = parsePracticeParameters(
      new URLSearchParams(
        'people=9999&neighbours=3&vaccines=-4&outbreaks=x&refusers=&contagion=1e9&seed=%3Cscript%3E',
      ),
      fixedSeed,
    );
    expect(setup.config.nodeCount).toBe(80);
    expect(setup.config.ringNeighbourCount).toBe(4);
    expect(setup.config.vaccineCount).toBe(0);
    expect(setup.config.indexPatientCount).toBe(DAILY_PUZZLE_CONFIG.indexPatientCount);
    expect(setup.config.refuserCount).toBe(DAILY_PUZZLE_CONFIG.refuserCount);
    expect(setup.config.transmissionProbability).toBe(0.6);
    expect(setup.seed).toBe('script');
  });

  it('always yields a config the engine accepts', () => {
    const setup = parsePracticeParameters(
      new URLSearchParams('people=20&refusers=10&vaccines=12&outbreaks=5'),
      fixedSeed,
    );
    expect(setup.config.vaccineCount).toBe(10);
    expect(() => validatePuzzleConfig(setup.config)).not.toThrow();
  });
});

describe('seeds', () => {
  it('normalises typed seeds and rejects empty ones', () => {
    expect(normaliseSeed('  My Seed!  ')).toBe('myseed');
    expect(normaliseSeed('***')).toBeUndefined();
    expect(normaliseSeed('a'.repeat(40))).toHaveLength(24);
  });

  it('generates valid random seeds and namespaces seed keys', () => {
    expect(normaliseSeed(randomSeed())).toBeDefined();
    expect(practiceSeedKey('abc')).toBe('practice-abc');
  });
});
