import { RESEARCH_BALANCE } from './balance';
import { UPGRADE_IDS, UPGRADES, type UpgradeId } from './upgrades';
import type { RunStartOptions } from './run';

/** Starting bonuses bought with Research. IDs are stored in saves, so never rename one. */
export const STARTING_BONUS_IDS = ['spare-reroll', 'head-start', 'wider-choice'] as const;

export type StartingBonusId = (typeof STARTING_BONUS_IDS)[number];

/** Upgrades in the pool from the first run; every other upgrade is bought with Research. */
export const STARTER_UPGRADE_IDS = [
  'extra-vaccine',
  'masks',
  'safety-margin',
  'natural-immunity',
  'rapid-response',
  'outreach',
  'smaller-outbreak',
] as const satisfies readonly UpgradeId[];

/**
 * Anything Research can buy: an upgrade outside the starters, or a starting bonus. Costs in
 * `balance.ts` must name exactly these, which the compiler checks.
 */
export type UnlockId = Exclude<UpgradeId, (typeof STARTER_UPGRADE_IDS)[number]> | StartingBonusId;

const STARTER_UPGRADES: ReadonlySet<UpgradeId> = new Set(STARTER_UPGRADE_IDS);

/** What can be bought, cheapest first, with its Research cost (from `balance.ts`). */
export const RESEARCH_CATALOG: readonly { readonly id: UnlockId; readonly cost: number }[] =
  Object.entries(RESEARCH_BALANCE.costs)
    .map(([id, cost]) => ({ id: id as UnlockId, cost }))
    .sort((left, right) => left.cost - right.cost);

/** Type guard for unlock IDs read from untrusted data (saves). */
export function isUnlockId(value: unknown): value is UnlockId {
  return typeof value === 'string' && RESEARCH_CATALOG.some(({ id }) => id === value);
}

/** Research a run earns: a fixed amount per cleared level plus a bonus per full five levels. */
export function researchForRun(levelsCleared: number): number {
  return (
    levelsCleared * RESEARCH_BALANCE.perLevelCleared +
    Math.floor(levelsCleared / 5) * RESEARCH_BALANCE.bonusPerFiveLevels
  );
}

/** The upgrade pool: starters plus every upgrade unlocked with Research. */
export function unlockedUpgrades(unlocks: readonly UnlockId[]): ReadonlySet<UpgradeId> {
  const bought: ReadonlySet<string> = new Set(unlocks);
  return new Set(UPGRADE_IDS.filter((id) => STARTER_UPGRADES.has(id) || bought.has(id)));
}

/** The cost of an unlock. */
export function unlockCost(id: UnlockId): number {
  return RESEARCH_BALANCE.costs[id];
}

/** Whether an unlock can be bought now: not owned yet and affordable. */
export function canBuyUnlock(
  id: UnlockId,
  research: number,
  unlocks: readonly UnlockId[],
): boolean {
  return !unlocks.includes(id) && research >= unlockCost(id);
}

/**
 * How a new run starts given the unlocked bonuses. Head Start gives a random common upgrade from
 * the pool, drawn with `random` (the game passes a stream seeded by the run seed).
 */
export function runStartOptions(
  unlocks: readonly UnlockId[],
  random: () => number,
): RunStartOptions & { readonly offerCount: number } {
  const pool = [...unlockedUpgrades(unlocks)].filter((id) => UPGRADES[id].rarity === 'common');
  const headStart =
    unlocks.includes('head-start') && pool.length > 0
      ? [pool[Math.floor(random() * pool.length)] as UpgradeId]
      : [];
  return {
    startingPicks: headStart,
    freeRerolls: unlocks.includes('spare-reroll') ? 1 : 0,
    offerCount: unlocks.includes('wider-choice') ? 4 : 3,
  };
}
