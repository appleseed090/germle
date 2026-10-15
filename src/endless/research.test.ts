import { describe, expect, it } from 'vitest';
import {
  RESEARCH_CATALOG,
  STARTER_UPGRADE_IDS,
  canBuyUnlock,
  isUnlockId,
  researchForRun,
  runStartOptions,
  unlockCost,
  unlockedUpgrades,
} from './research';
import { UPGRADE_IDS, UPGRADES } from './upgrades';

describe('the Research catalog', () => {
  it('sells every upgrade outside the starters exactly once, cheapest first', () => {
    const sold = RESEARCH_CATALOG.map(({ id }) => id);
    expect(new Set(sold).size).toBe(sold.length);
    for (const id of UPGRADE_IDS)
      expect(sold.includes(id as never)).toBe(
        !(STARTER_UPGRADE_IDS as readonly string[]).includes(id),
      );
    const costs = RESEARCH_CATALOG.map(({ cost }) => cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });

  it('recognises unlock IDs', () => {
    expect(isUnlockId('wider-choice')).toBe(true);
    expect(isUnlockId('masks')).toBe(false);
  });
});

describe('researchForRun', () => {
  it('pays per cleared level with a bonus every five', () => {
    expect(researchForRun(0)).toBe(0);
    expect(researchForRun(4)).toBe(40);
    expect(researchForRun(5)).toBe(60);
    expect(researchForRun(10)).toBe(120);
  });
});

describe('unlocks', () => {
  it('adds bought upgrades to the starter pool', () => {
    expect(unlockedUpgrades([]).size).toBe(STARTER_UPGRADE_IDS.length);
    expect(unlockedUpgrades(['burnout', 'head-start']).has('burnout')).toBe(true);
  });

  it('can be bought only when affordable and not owned', () => {
    const cost = unlockCost('contact-tracing');
    expect(canBuyUnlock('contact-tracing', cost - 1, [])).toBe(false);
    expect(canBuyUnlock('contact-tracing', cost, [])).toBe(true);
    expect(canBuyUnlock('contact-tracing', 400, ['contact-tracing'])).toBe(false);
  });

  it('turns starting bonuses into run options', () => {
    expect(runStartOptions([], () => 0)).toEqual({
      startingPicks: [],
      freeRerolls: 0,
      offerCount: 3,
    });
    const all = runStartOptions(['head-start', 'spare-reroll', 'wider-choice'], () => 0.5);
    expect(all.freeRerolls).toBe(1);
    expect(all.offerCount).toBe(4);
    expect(all.startingPicks).toHaveLength(1);
    expect(UPGRADES[all.startingPicks[0] ?? 'burnout'].rarity).toBe('common');
  });
});
