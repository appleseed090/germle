import { DAILY_PUZZLE_CONFIG, type PuzzleConfig } from './engine';

/** A practice game: the puzzle config and the seed text it is generated from. */
export interface PracticeSetup {
  readonly config: PuzzleConfig;
  readonly seed: string;
}

/** Inclusive slider ranges of the practice setup. Contagiousness is in whole percent. */
export const PRACTICE_RANGES = Object.freeze({
  nodeCount: { minimum: 20, maximum: 80, step: 1 },
  ringNeighbourCount: { minimum: 2, maximum: 6, step: 2 },
  vaccineCount: { minimum: 0, maximum: 12, step: 1 },
  indexPatientCount: { minimum: 1, maximum: 5, step: 1 },
  refuserCount: { minimum: 0, maximum: 10, step: 1 },
  contagiousnessPercent: { minimum: 15, maximum: 60, step: 1 },
});

const SEED_PATTERN = /^[a-z0-9-]{1,24}$/;

/**
 * URL parameter names. Practice links are shareable, so these are a public format: renaming one
 * breaks links people have saved.
 */
const PARAMETER_NAMES = Object.freeze({
  nodeCount: 'people',
  ringNeighbourCount: 'neighbours',
  vaccineCount: 'vaccines',
  indexPatientCount: 'outbreaks',
  refuserCount: 'refusers',
  contagiousnessPercent: 'contagion',
  seed: 'seed',
});

/** The seed key practice puzzles derive their random streams from. */
export function practiceSeedKey(seed: string): string {
  return `practice-${seed}`;
}

/** Lower-cases and strips a typed seed to the allowed alphabet; `undefined` if nothing is left. */
export function normaliseSeed(text: string): string | undefined {
  const seed = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 24);
  return SEED_PATTERN.test(seed) ? seed : undefined;
}

/** A fresh six-character seed. Not reproducible by design; the seed itself makes the game replayable. */
export function randomSeed(random: () => number = Math.random): string {
  return Array.from(
    { length: 6 },
    () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(random() * 36)],
  ).join('');
}

/**
 * Reads a practice setup from URL parameters. Each value is untrusted: missing or malformed values
 * fall back to the daily constants, numbers are clamped into their slider range, and the vaccine
 * and outbreak counts are reduced if the network is too small for them.
 */
export function parsePracticeParameters(
  parameters: URLSearchParams,
  fallbackSeed: () => string,
): PracticeSetup {
  const read = (key: keyof typeof PRACTICE_RANGES, fallback: number): number => {
    const range = PRACTICE_RANGES[key];
    const text = parameters.get(PARAMETER_NAMES[key]);
    const value = text === null || text.trim() === '' ? Number.NaN : Number(text);
    if (!Number.isFinite(value)) return fallback;
    const stepped = range.minimum + Math.round((value - range.minimum) / range.step) * range.step;
    return Math.min(Math.max(stepped, range.minimum), range.maximum);
  };
  const nodeCount = read('nodeCount', DAILY_PUZZLE_CONFIG.nodeCount);
  const refuserCount = read('refuserCount', DAILY_PUZZLE_CONFIG.refuserCount);
  const vaccineCount = Math.min(
    read('vaccineCount', DAILY_PUZZLE_CONFIG.vaccineCount),
    nodeCount - refuserCount,
  );
  const indexPatientCount = Math.min(
    read('indexPatientCount', DAILY_PUZZLE_CONFIG.indexPatientCount),
    nodeCount - vaccineCount,
  );
  const contagiousnessPercent = read(
    'contagiousnessPercent',
    Math.round(DAILY_PUZZLE_CONFIG.transmissionProbability * 100),
  );
  return {
    config: {
      nodeCount,
      ringNeighbourCount: read('ringNeighbourCount', DAILY_PUZZLE_CONFIG.ringNeighbourCount),
      rewireProbability: DAILY_PUZZLE_CONFIG.rewireProbability,
      refuserCount,
      vaccineCount,
      indexPatientCount,
      transmissionProbability: contagiousnessPercent / 100,
    },
    seed: normaliseSeed(parameters.get(PARAMETER_NAMES.seed) ?? '') ?? fallbackSeed(),
  };
}

/** URL parameters that {@link parsePracticeParameters} reads back to the same setup. */
export function practiceParameters(setup: PracticeSetup): URLSearchParams {
  const { config, seed } = setup;
  return new URLSearchParams({
    [PARAMETER_NAMES.nodeCount]: String(config.nodeCount),
    [PARAMETER_NAMES.ringNeighbourCount]: String(config.ringNeighbourCount),
    [PARAMETER_NAMES.vaccineCount]: String(config.vaccineCount),
    [PARAMETER_NAMES.indexPatientCount]: String(config.indexPatientCount),
    [PARAMETER_NAMES.refuserCount]: String(config.refuserCount),
    [PARAMETER_NAMES.contagiousnessPercent]: String(
      Math.round(config.transmissionProbability * 100),
    ),
    [PARAMETER_NAMES.seed]: seed,
  });
}
