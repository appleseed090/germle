/**
 * Every number that shapes Germle Endless: level curves, the pass mark, and upgrade odds and
 * effects. Tune here (with `npm run simulate:endless`), nowhere else; `DECISIONS.md` records the
 * simulator numbers behind each change.
 */

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
  nodeCount: { atLevelOne: 12, perLevel: 4, limit: 80 } satisfies LevelCurve,
  /** Ring degree before rewiring (even): denser networks from this level on. */
  denseFromLevel: 14,
  sparseRingNeighbourCount: 4,
  denseRingNeighbourCount: 6,
  rewireProbability: { atLevelOne: 0.05, perLevel: 0.01, limit: 0.2 } satisfies LevelCurve,
  /** Vaccines as a share of the network, rounded, at least one. */
  vaccineShare: { atLevelOne: 0.17, perLevel: -0.004, limit: 0.08 } satisfies LevelCurve,
  /** People infected when the outbreak starts: one more every `levelsPerExtraIndexPatient`. */
  levelsPerExtraIndexPatient: 5,
  maximumIndexPatients: 6,
  /** Refusers as a share of the network, rounded down. */
  refuserShare: { atLevelOne: 0, perLevel: 0.004, limit: 0.08 } satisfies LevelCurve,
  transmissionProbability: { atLevelOne: 0.3, perLevel: 0.004, limit: 0.42 } satisfies LevelCurve,
  /** Share of people (percent) a level must save to pass. */
  passThresholdPercent: { atLevelOne: 50, perLevel: 1, limit: 72 } satisfies LevelCurve,
  /** A finish within this many points of the pass mark counts as a near miss (either side). */
  nearMissPoints: 3,
});

export const UPGRADE_BALANCE = Object.freeze({
  /** Choices offered after each cleared level. */
  offerCount: 3,
  /** Relative odds of each rarity when an offer slot is filled. */
  rarityWeights: { common: 6, uncommon: 3, rare: 1 },
  extraVaccinesPerStack: 1,
  transmissionMultiplierPerMask: 0.85,
  passThresholdPointsPerSafetyMargin: 4,
  immunePeoplePerStack: 2,
  freeQuarantinesPerStack: 1,
  ringVaccinationFactor: 0.5,
  undoChargesPerStack: 1,
});
