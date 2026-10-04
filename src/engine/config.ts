/**
 * Every tunable number that shapes a puzzle. The daily puzzle uses {@link DAILY_PUZZLE_CONFIG};
 * practice mode builds its own from player input and passes it through
 * {@link validatePuzzleConfig}.
 */
export interface PuzzleConfig {
  /** People in the network. */
  readonly nodeCount: number;
  /** Ring lattice degree before rewiring; each node links to half this many on each side. Even. */
  readonly ringNeighbourCount: number;
  /** Chance that each ring edge has its far end moved to a uniformly random other node. */
  readonly rewireProbability: number;
  /** People who cannot be vaccinated. */
  readonly refuserCount: number;
  /** Vaccines the player must spend before the outbreak starts. */
  readonly vaccineCount: number;
  /** People infected when the outbreak starts. */
  readonly indexPatientCount: number;
  /** Per-edge, per-turn chance that an infected person infects a susceptible neighbour (β). */
  readonly transmissionProbability: number;
}

/** The constants of the daily puzzle. Changing any of them changes every daily puzzle. */
export const DAILY_PUZZLE_CONFIG: PuzzleConfig = Object.freeze({
  nodeCount: 40,
  ringNeighbourCount: 4,
  rewireProbability: 0.1,
  refuserCount: 2,
  vaccineCount: 4,
  indexPatientCount: 2,
  transmissionProbability: 0.35,
});

/**
 * Upper bound on epidemic turns per game. Every turn that does not end the game infects at least
 * one person, so a game lasts at most `nodeCount` turns; transmission rolls are only defined
 * below this limit.
 */
export const TRANSMISSION_TURN_LIMIT = 200;

/** Inclusive bounds practice mode accepts, also used to validate any non-daily config. */
export const PUZZLE_CONFIG_LIMITS = Object.freeze({
  nodeCount: { minimum: 6, maximum: 80 },
  ringNeighbourCount: { minimum: 2, maximum: 6 },
  rewireProbability: { minimum: 0, maximum: 1 },
  transmissionProbability: { minimum: 0.01, maximum: 1 },
});

/**
 * Checks that a config describes a playable puzzle: the ring fits in the node count, every
 * vaccine can be spent on a non-refuser, and enough people remain susceptible to seed the
 * outbreak.
 *
 * @returns The same config, for chaining.
 * @throws RangeError naming the first field that is out of range.
 */
export function validatePuzzleConfig(config: PuzzleConfig): PuzzleConfig {
  const limits = PUZZLE_CONFIG_LIMITS;
  requireIntegerInRange(
    'nodeCount',
    config.nodeCount,
    limits.nodeCount.minimum,
    limits.nodeCount.maximum,
  );
  requireIntegerInRange(
    'ringNeighbourCount',
    config.ringNeighbourCount,
    limits.ringNeighbourCount.minimum,
    Math.min(limits.ringNeighbourCount.maximum, config.nodeCount - 1),
  );
  if (config.ringNeighbourCount % 2 !== 0) {
    throw new RangeError(`ringNeighbourCount must be even, got ${config.ringNeighbourCount}`);
  }
  requireNumberInRange(
    'rewireProbability',
    config.rewireProbability,
    limits.rewireProbability.minimum,
    limits.rewireProbability.maximum,
  );
  requireNumberInRange(
    'transmissionProbability',
    config.transmissionProbability,
    limits.transmissionProbability.minimum,
    limits.transmissionProbability.maximum,
  );
  requireIntegerInRange('refuserCount', config.refuserCount, 0, config.nodeCount);
  requireIntegerInRange(
    'vaccineCount',
    config.vaccineCount,
    0,
    config.nodeCount - config.refuserCount,
  );
  requireIntegerInRange(
    'indexPatientCount',
    config.indexPatientCount,
    1,
    config.nodeCount - config.vaccineCount,
  );
  return config;
}

function requireIntegerInRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer in [${minimum}, ${maximum}], got ${value}`);
  }
}

function requireNumberInRange(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a number in [${minimum}, ${maximum}], got ${value}`);
  }
}
