/**
 * Every number that shapes Germle Endless: level curves, the pass mark, upgrade odds and effects,
 * Research income and costs, and ad pacing. Tune here (with `npm run simulate:endless`), nowhere
 * else; `DECISIONS.md` records the simulator numbers behind each change.
 */

import type { UnlockId } from './research';

/** A value that starts somewhere and moves by a fixed step per level, within a bound. */
export interface LevelCurve {
  readonly atLevelOne: number;
  readonly perLevel: number;
  /** Upper bound when `perLevel` is positive, lower bound when it is negative. */
  readonly limit: number;
}

/** The value of a curve at a level (1-based), clamped to its limit. */
export function curveAt(curve: LevelCurve, level: number): number {
  const value = curve.atLevelOne + curve.perLevel * (level - 1);
  return curve.perLevel >= 0 ? Math.min(value, curve.limit) : Math.max(value, curve.limit);
}

export const LEVEL_BALANCE = Object.freeze({
  /** People in the network; capped where an 80-person board is still tappable on a phone. */
  nodeCount: { atLevelOne: 12, perLevel: 3, limit: 80 } satisfies LevelCurve,
  /**
   * Ring degree before rewiring. Kept at 4: a degree of 6 made every level unwinnable for the
   * simulator's bot (17% saved at 75 people), so connections get denser through rewiring instead.
   */
  ringNeighbourCount: 4,
  /** Long-range shortcuts, which make a network harder to cut into pieces. */
  rewireProbability: { atLevelOne: 0.05, perLevel: 0.01, limit: 0.25 } satisfies LevelCurve,
  /** Vaccines as a share of the network, rounded, at least one. */
  vaccineShare: { atLevelOne: 0.17, perLevel: -0.005, limit: 0.06 } satisfies LevelCurve,
  /**
   * People infected when the outbreak starts (rounded down). Past the network's size cap this
   * and the curves below keep the pressure rising, so stacked upgrades cannot outgrow it.
   */
  indexPatientCount: { atLevelOne: 1, perLevel: 0.4, limit: 14 } satisfies LevelCurve,
  /** Refusers as a share of the network, rounded down. */
  refuserShare: { atLevelOne: 0, perLevel: 0.004, limit: 0.08 } satisfies LevelCurve,
  transmissionProbability: { atLevelOne: 0.3, perLevel: 0.006, limit: 0.6 } satisfies LevelCurve,
  /** Share of people (percent) a level must save to pass, before the headroom cap below. */
  passThresholdPercent: { atLevelOne: 50, perLevel: 1.5, limit: 85 } satisfies LevelCurve,
  /**
   * The pass mark stays at least this many points below the best score a level allows (everyone
   * but the index patients saved), so no level is lost before the first tap. Past the network's
   * size cap, more index patients then lower the pass mark rather than make it unreachable.
   */
  passThresholdHeadroomPoints: 5,
  /** A finish within this many points of the pass mark counts as a near miss (either side). */
  nearMissPoints: 3,
});

export const UPGRADE_BALANCE = Object.freeze({
  /** Choices offered after each cleared level. */
  offerCount: 3,
  /** Relative odds of each rarity when an offer slot is filled. */
  rarityWeights: { common: 6, uncommon: 3, rare: 1 },
  extraVaccinesPerStack: 1,
  transmissionMultiplierPerMask: 0.9,
  passThresholdPointsPerSafetyMargin: 3,
  immunePeoplePerStack: 1,
  freeQuarantinesPerStack: 1,
  ringVaccinationFactor: 0.5,
  undoChargesPerStack: 1,
});

export const RESEARCH_BALANCE = Object.freeze({
  /** Research for each level a run clears. */
  perLevelCleared: 10,
  /** Extra Research for every full five levels a run clears. */
  bonusPerFiveLevels: 10,
  /** What each unlock costs: every upgrade outside the starters and every starting bonus. */
  costs: {
    'contact-tracing': 60,
    'spare-reroll': 100,
    'ring-vaccination': 150,
    burnout: 220,
    'head-start': 300,
    'early-warning': 380,
    'second-opinion': 460,
    'double-shift': 560,
    'wider-choice': 680,
  } satisfies Record<UnlockId, number>,
});

export const AD_BALANCE = Object.freeze({
  /** No midgame ad before this many levels are cleared in a run (CrazyGames' pacing advice). */
  firstMidgameAfterLevelsCleared: 3,
  /** The local platform's stand-in for the SDK's own midgame cooldown. */
  localMidgameCooldownSeconds: 180,
});
