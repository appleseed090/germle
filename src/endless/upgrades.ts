import type { PuzzleConfig } from '../engine/config';
import { createMulberry32, hashStringFnv1a32, type RandomSource } from '../engine/random';
import { CLASSIC_RULES, type GameRules } from '../engine/rules';
import { UPGRADE_BALANCE } from './balance';

/** Every upgrade, by stable ID. IDs are stored in saves, so never rename one. */
export const UPGRADE_IDS = [
  'extra-vaccine',
  'masks',
  'safety-margin',
  'natural-immunity',
  'rapid-response',
  'outreach',
  'smaller-outbreak',
  'contact-tracing',
  'ring-vaccination',
  'early-warning',
  'double-shift',
  'second-opinion',
  'burnout',
] as const;

export type UpgradeId = (typeof UPGRADE_IDS)[number];

export type UpgradeRarity = 'common' | 'uncommon' | 'rare';

/** What an upgrade is in the draw; its effect lives in {@link applyUpgrades}. */
export interface UpgradeDefinition {
  readonly id: UpgradeId;
  readonly rarity: UpgradeRarity;
  /** How many times a run can take it; 1 means it does not stack. */
  readonly maximumStacks: number;
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDefinition>> = Object.freeze({
  'extra-vaccine': { id: 'extra-vaccine', rarity: 'common', maximumStacks: 4 },
  masks: { id: 'masks', rarity: 'common', maximumStacks: 3 },
  'safety-margin': { id: 'safety-margin', rarity: 'common', maximumStacks: 3 },
  'natural-immunity': { id: 'natural-immunity', rarity: 'common', maximumStacks: 3 },
  'rapid-response': { id: 'rapid-response', rarity: 'common', maximumStacks: 3 },
  outreach: { id: 'outreach', rarity: 'uncommon', maximumStacks: 1 },
  'smaller-outbreak': { id: 'smaller-outbreak', rarity: 'uncommon', maximumStacks: 2 },
  'contact-tracing': { id: 'contact-tracing', rarity: 'uncommon', maximumStacks: 1 },
  'ring-vaccination': { id: 'ring-vaccination', rarity: 'uncommon', maximumStacks: 1 },
  'early-warning': { id: 'early-warning', rarity: 'uncommon', maximumStacks: 1 },
  'double-shift': { id: 'double-shift', rarity: 'rare', maximumStacks: 1 },
  'second-opinion': { id: 'second-opinion', rarity: 'rare', maximumStacks: 2 },
  burnout: { id: 'burnout', rarity: 'rare', maximumStacks: 1 },
});

/** Type guard for IDs read from untrusted data (saves). */
export function isUpgradeId(value: unknown): value is UpgradeId {
  return typeof value === 'string' && (UPGRADE_IDS as readonly string[]).includes(value);
}

/** How many of each upgrade a list of picks holds. */
export function countUpgrades(picks: readonly UpgradeId[]): ReadonlyMap<UpgradeId, number> {
  const counts = new Map<UpgradeId, number>();
  for (const id of picks) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Everything the upgrades a run holds change about a level. */
export interface UpgradedLevel {
  readonly config: PuzzleConfig;
  readonly rules: GameRules;
  /** Pass mark in percent after Safety Margin. */
  readonly passThresholdPercent: number;
  /** Moves the player may take back during the level (Second Opinion). */
  readonly undoCharges: number;
  /** Show who the next day infects (Contact Tracing). */
  readonly contactTracing: boolean;
}

/**
 * Applies a run's upgrades to a level's base config and pass mark. Vaccines are capped so the
 * config stays valid (every vaccine can be spent and the outbreak still has people to start in).
 */
export function applyUpgrades(
  baseConfig: PuzzleConfig,
  basePassThresholdPercent: number,
  picks: readonly UpgradeId[],
): UpgradedLevel {
  const counts = countUpgrades(picks);
  const stacks = (id: UpgradeId): number => counts.get(id) ?? 0;
  const balance = UPGRADE_BALANCE;

  const refuserCount = stacks('outreach') > 0 ? 0 : baseConfig.refuserCount;
  const indexPatientCount = Math.max(1, baseConfig.indexPatientCount - stacks('smaller-outbreak'));
  const vaccineCount = Math.min(
    baseConfig.vaccineCount + stacks('extra-vaccine') * balance.extraVaccinesPerStack,
    baseConfig.nodeCount - refuserCount - indexPatientCount,
  );
  const config: PuzzleConfig = {
    ...baseConfig,
    refuserCount,
    indexPatientCount,
    vaccineCount,
    transmissionProbability:
      baseConfig.transmissionProbability * balance.transmissionMultiplierPerMask ** stacks('masks'),
  };
  const rules: GameRules = {
    ...CLASSIC_RULES,
    quarantinesPerDay: stacks('double-shift') > 0 ? 2 : 1,
    quarantinesBeforeFirstSpread: stacks('rapid-response') * balance.freeQuarantinesPerStack,
    vaccinatedNeighbourTransmissionFactor:
      stacks('ring-vaccination') > 0 ? balance.ringVaccinationFactor : 1,
    spreadCanFizzle: stacks('burnout') > 0,
    naturallyImmuneCount: stacks('natural-immunity') * balance.immunePeoplePerStack,
    indexPatientsKnownInAdvance: stacks('early-warning') > 0,
  };
  return {
    config,
    rules,
    passThresholdPercent:
      basePassThresholdPercent -
      stacks('safety-margin') * balance.passThresholdPointsPerSafetyMargin,
    undoCharges: stacks('second-opinion') * balance.undoChargesPerStack,
    contactTracing: stacks('contact-tracing') > 0,
  };
}

/** The random stream for one upgrade offer, so an offer is the same after a reload. */
export function offerRandom(runSeed: string, level: number, rerollIndex: number): RandomSource {
  return createMulberry32(
    hashStringFnv1a32(`germle-endless:v1:${runSeed}:offer:${level}:${rerollIndex}`),
  );
}

/**
 * Draws distinct upgrades to offer: from the unlocked ones the run can still take, each slot
 * picking a rarity by weight among those still available, then an upgrade of that rarity
 * uniformly.
 *
 * @returns Up to `count` IDs; fewer only when fewer are available.
 */
export function drawUpgradeOffer(
  owned: readonly UpgradeId[],
  unlocked: ReadonlySet<UpgradeId>,
  count: number,
  random: RandomSource,
): UpgradeId[] {
  const counts = countUpgrades(owned);
  const available = UPGRADE_IDS.filter(
    (id) => unlocked.has(id) && (counts.get(id) ?? 0) < UPGRADES[id].maximumStacks,
  );
  const offer: UpgradeId[] = [];
  while (offer.length < count) {
    const remaining = available.filter((id) => !offer.includes(id));
    if (remaining.length === 0) break;
    const rarities = (['common', 'uncommon', 'rare'] as const).filter((rarity) =>
      remaining.some((id) => UPGRADES[id].rarity === rarity),
    );
    const totalWeight = rarities.reduce(
      (sum, rarity) => sum + UPGRADE_BALANCE.rarityWeights[rarity],
      0,
    );
    let ticket = random() * totalWeight;
    const rarity =
      rarities.find((candidate) => {
        ticket -= UPGRADE_BALANCE.rarityWeights[candidate];
        return ticket < 0;
      }) ?? rarities.at(-1);
    const ofRarity = remaining.filter((id) => UPGRADES[id].rarity === rarity);
    offer.push(ofRarity[Math.floor(random() * ofRarity.length)] as UpgradeId);
  }
  return offer;
}
