import { describe, expect, it } from 'vitest';
import { validatePuzzleConfig } from '../engine/config';
import { validateGameRules } from '../engine/rules';
import { LEVEL_BALANCE, curveAt } from './balance';
import {
  LARGEST_LEVEL_NODE_COUNT,
  baseLevelConfig,
  basePassThresholdPercent,
  levelSeedKey,
  prepareLevel,
} from './levels';
import { UPGRADE_IDS, UPGRADES, applyUpgrades, type UpgradeId } from './upgrades';

const EVERY_UPGRADE_MAXED: UpgradeId[] = UPGRADE_IDS.flatMap((id) =>
  Array.from({ length: UPGRADES[id].maximumStacks }, () => id),
);

describe('baseLevelConfig', () => {
  it('starts small and gentle: one index patient on a small network', () => {
    const first = baseLevelConfig(1);
    expect(first.indexPatientCount).toBe(1);
    expect(first.nodeCount).toBeLessThanOrEqual(16);
    expect(first.refuserCount).toBe(0);
    expect(basePassThresholdPercent(1)).toBe(LEVEL_BALANCE.passThresholdPercent.atLevelOne);
  });

  it('never gets easier from one level to the next', () => {
    for (let level = 2; level <= 200; level++) {
      const previous = baseLevelConfig(level - 1);
      const current = baseLevelConfig(level);
      expect(current.nodeCount).toBeGreaterThanOrEqual(previous.nodeCount);
      expect(current.indexPatientCount).toBeGreaterThanOrEqual(previous.indexPatientCount);
      expect(current.ringNeighbourCount).toBeGreaterThanOrEqual(previous.ringNeighbourCount);
      expect(current.transmissionProbability).toBeGreaterThanOrEqual(
        previous.transmissionProbability,
      );
      expect(curveAt(LEVEL_BALANCE.vaccineShare, level)).toBeLessThanOrEqual(
        curveAt(LEVEL_BALANCE.vaccineShare, level - 1),
      );
      expect(basePassThresholdPercent(level)).toBeGreaterThanOrEqual(
        basePassThresholdPercent(level - 1),
      );
    }
  });

  it('never exceeds the largest network a phone can show', () => {
    for (let level = 1; level <= 200; level++)
      expect(baseLevelConfig(level).nodeCount).toBeLessThanOrEqual(LARGEST_LEVEL_NODE_COUNT);
  });
});

describe('applyUpgrades on every level', () => {
  it('keeps every config and rule set valid, with no upgrades and with everything maxed', () => {
    for (let level = 1; level <= 200; level++) {
      for (const picks of [[], EVERY_UPGRADE_MAXED]) {
        const upgraded = applyUpgrades(
          baseLevelConfig(level),
          basePassThresholdPercent(level),
          picks,
        );
        expect(() => validatePuzzleConfig(upgraded.config)).not.toThrow();
        expect(() => validateGameRules(upgraded.rules)).not.toThrow();
        expect(upgraded.passThresholdPercent).toBeGreaterThan(0);
      }
    }
  });
});

describe('prepareLevel', () => {
  it('builds the same puzzle from the same seed, level and upgrades', () => {
    const first = prepareLevel('abcd1234', 7, ['extra-vaccine']);
    const second = prepareLevel('abcd1234', 7, ['extra-vaccine']);
    expect(second.puzzle.graph).toEqual(first.puzzle.graph);
    expect(second.puzzle.isRefuser).toEqual(first.puzzle.isRefuser);
    expect(first.puzzle.config.vaccineCount).toBe(baseLevelConfig(7).vaccineCount + 1);
  });

  it('gives each level of a run its own network', () => {
    expect(prepareLevel('abcd1234', 3, []).puzzle.graph).not.toEqual(
      prepareLevel('abcd1235', 3, []).puzzle.graph,
    );
  });
});

describe('levelSeedKey', () => {
  it('can never collide with a daily or practice seed key', () => {
    const key = levelSeedKey('abcd1234', 12);
    expect(key).toBe('endless-abcd1234-12');
    expect(key).not.toMatch(/^\d+$/);
    expect(key).not.toMatch(/^practice-/);
  });
});
