import { PUZZLE_CONFIG_LIMITS, validatePuzzleConfig, type PuzzleConfig } from '../engine/config';
import { createPuzzle, type Puzzle } from '../engine/puzzle';
import { curveAt, LEVEL_BALANCE } from './balance';
import { applyUpgrades, type UpgradeId, type UpgradedLevel } from './upgrades';

/** The base puzzle config of a level (1-based), before upgrades. */
export function baseLevelConfig(level: number): PuzzleConfig {
  const balance = LEVEL_BALANCE;
  const nodeCount = Math.round(curveAt(balance.nodeCount, level));
  const indexPatientCount = Math.min(
    1 + Math.floor((level - 1) / balance.levelsPerExtraIndexPatient),
    balance.maximumIndexPatients,
  );
  return validatePuzzleConfig({
    nodeCount,
    ringNeighbourCount:
      level >= balance.denseFromLevel
        ? balance.denseRingNeighbourCount
        : balance.sparseRingNeighbourCount,
    rewireProbability: curveAt(balance.rewireProbability, level),
    refuserCount: Math.floor(nodeCount * curveAt(balance.refuserShare, level)),
    vaccineCount: Math.max(1, Math.round(nodeCount * curveAt(balance.vaccineShare, level))),
    indexPatientCount,
    transmissionProbability: curveAt(balance.transmissionProbability, level),
  });
}

/** The share of people (percent) a level must save to pass, before upgrades. */
export function basePassThresholdPercent(level: number): number {
  return Math.round(curveAt(LEVEL_BALANCE.passThresholdPercent, level));
}

/**
 * The seed key of a level of a run. Prefixed `endless-`, so it can never equal a daily key (a
 * number) or a practice key (`practice-…`).
 */
export function levelSeedKey(runSeed: string, level: number): string {
  return `endless-${runSeed}-${level}`;
}

/** A level ready to play: its puzzle and everything the run's upgrades change about it. */
export interface PreparedLevel extends UpgradedLevel {
  readonly level: number;
  readonly puzzle: Puzzle;
}

/**
 * Builds a level of a run: the same seed, level and upgrades always give the same puzzle.
 *
 * @throws RangeError if the upgraded config is invalid, which `levels.test.ts` rules out for
 *   every level and upgrade combination the balance allows.
 */
export function prepareLevel(
  runSeed: string,
  level: number,
  upgrades: readonly UpgradeId[],
): PreparedLevel {
  const upgraded = applyUpgrades(baseLevelConfig(level), basePassThresholdPercent(level), upgrades);
  return {
    ...upgraded,
    level,
    puzzle: createPuzzle(upgraded.config, levelSeedKey(runSeed, level)),
  };
}

/** The largest network a run can reach, for layout and rendering budgets. */
export const LARGEST_LEVEL_NODE_COUNT = Math.min(
  LEVEL_BALANCE.nodeCount.limit,
  PUZZLE_CONFIG_LIMITS.nodeCount.maximum,
);
