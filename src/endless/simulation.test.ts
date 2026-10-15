import { describe, expect, it } from 'vitest';
import { prepareLevel } from './levels';
import {
  calibrateLevel,
  playLevelWithBot,
  simulateCareer,
  simulateRun,
  summariseRuns,
} from './simulation';
import { UPGRADE_IDS } from './upgrades';

const OPTIONS = {
  unlocked: new Set(UPGRADE_IDS),
  start: { startingPicks: [], freeRerolls: 0 },
  takesSecondChance: true,
  randomPickChance: 0.2,
  maximumLevels: 12,
  offerCount: 3,
  mistakeChance: 0.1,
};

describe('the simulator', () => {
  it('plays a level to the end with any upgrades', () => {
    const prepared = prepareLevel('abcd1234', 5, ['contact-tracing', 'early-warning', 'burnout']);
    expect(playLevelWithBot(prepared).phase).toBe('ended');
  });

  it('plays whole runs reproducibly and summarises them', () => {
    const first = simulateRun('sim00001', OPTIONS);
    expect(simulateRun('sim00001', OPTIONS)).toEqual(first);
    expect(first.levelsPlayed).toBeGreaterThan(0);
    const report = summariseRuns([first, simulateRun('sim00002', OPTIONS)]);
    expect(report.runs).toBe(2);
    expect(report.upgrades).toHaveLength(UPGRADE_IDS.length);
    const picks = report.upgrades.reduce((sum, upgrade) => sum + upgrade.picked, 0);
    expect(picks).toBeGreaterThan(0);
  });

  it('calibrates a level against its pass mark', () => {
    const calibration = calibrateLevel(1, [], 10);
    expect(calibration.passRate).toBeGreaterThanOrEqual(0);
    expect(calibration.passRate).toBeLessThanOrEqual(1);
    expect(calibration.passThresholdPercent).toBe(prepareLevel('x', 1, []).passThresholdPercent);
  });

  it('simulates a career that spends Research between runs', () => {
    const career = simulateCareer('test', 3, {
      takesSecondChance: false,
      randomPickChance: 0,
      maximumLevels: 12,
      mistakeChance: 0,
    });
    expect(career).toHaveLength(3);
    expect(career[0]?.unlocksBefore).toEqual([]);
    const earnedBeforeLast = (career[0]?.researchEarned ?? 0) + (career[1]?.researchEarned ?? 0);
    if (earnedBeforeLast >= 40) expect(career[2]?.unlocksBefore.length).toBeGreaterThan(0);
  });
});
