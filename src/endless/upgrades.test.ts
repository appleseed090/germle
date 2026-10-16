import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG } from '../engine/config';
import { CLASSIC_RULES } from '../engine/rules';
import { UPGRADE_BALANCE } from './balance';
import {
  UPGRADE_IDS,
  UPGRADES,
  applyUpgrades,
  countUpgrades,
  drawUpgradeOffer,
  isUpgradeId,
  offerRandom,
  type UpgradeId,
} from './upgrades';

const EVERYTHING = new Set(UPGRADE_IDS);

describe('applyUpgrades', () => {
  it('changes nothing without upgrades', () => {
    expect(applyUpgrades(DAILY_PUZZLE_CONFIG, 60, [])).toEqual({
      config: DAILY_PUZZLE_CONFIG,
      rules: CLASSIC_RULES,
      passThresholdPercent: 60,
      undoCharges: 0,
      contactTracing: false,
    });
  });

  it('turns each upgrade into its config, rule or run effect', () => {
    const upgraded = applyUpgrades(DAILY_PUZZLE_CONFIG, 60, [
      'extra-vaccine',
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
    ]);
    expect(upgraded.config).toEqual({
      ...DAILY_PUZZLE_CONFIG,
      vaccineCount: DAILY_PUZZLE_CONFIG.vaccineCount + 2,
      transmissionProbability:
        DAILY_PUZZLE_CONFIG.transmissionProbability * UPGRADE_BALANCE.transmissionMultiplierPerMask,
      refuserCount: Math.floor(DAILY_PUZZLE_CONFIG.refuserCount / 2),
      indexPatientCount: DAILY_PUZZLE_CONFIG.indexPatientCount - 1,
    });
    expect(upgraded.rules).toEqual({
      quarantinesPerDay: 2,
      quarantinesBeforeFirstSpread: 1,
      vaccinatedNeighbourTransmissionFactor: UPGRADE_BALANCE.ringVaccinationFactor,
      spreadCanFizzle: true,
      naturallyImmuneCount:
        UPGRADE_BALANCE.immunePeoplePerStack + Math.ceil(DAILY_PUZZLE_CONFIG.refuserCount / 2),
      indexPatientsKnownInAdvance: true,
    });
    expect(upgraded.passThresholdPercent).toBe(
      60 - UPGRADE_BALANCE.passThresholdPointsPerSafetyMargin,
    );
    expect(upgraded.undoCharges).toBe(1);
    expect(upgraded.contactTracing).toBe(true);
  });

  it('keeps at least one index patient and never more vaccines than can be spent', () => {
    const tiny = { ...DAILY_PUZZLE_CONFIG, nodeCount: 6, vaccineCount: 4, indexPatientCount: 1 };
    const upgraded = applyUpgrades(tiny, 50, [
      'smaller-outbreak',
      'smaller-outbreak',
      'extra-vaccine',
      'extra-vaccine',
    ]);
    expect(upgraded.config.indexPatientCount).toBe(1);
    expect(upgraded.config.vaccineCount).toBe(
      tiny.nodeCount - tiny.refuserCount - upgraded.config.indexPatientCount,
    );
  });
});

describe('drawUpgradeOffer', () => {
  it('offers distinct, unlocked upgrades the run can still take', () => {
    const owned: UpgradeId[] = ['double-shift'];
    const unlocked = new Set<UpgradeId>(['double-shift', 'masks', 'extra-vaccine', 'outreach']);
    for (let index = 0; index < 50; index++) {
      const offer = drawUpgradeOffer(owned, unlocked, 3, offerRandom('abcd1234', 2, index));
      expect(new Set(offer).size).toBe(3);
      expect(offer).not.toContain('double-shift');
      for (const id of offer) expect(unlocked.has(id)).toBe(true);
    }
  });

  it('offers fewer when fewer are available, and nothing once everything is maxed', () => {
    const unlocked = new Set<UpgradeId>(['outreach', 'masks']);
    expect(drawUpgradeOffer([], unlocked, 3, offerRandom('abcd1234', 1, 0))).toHaveLength(2);
    expect(
      drawUpgradeOffer(['outreach', 'masks', 'masks', 'masks'], unlocked, 3, () => 0.5),
    ).toEqual([]);
  });

  it('is reproducible from the run seed, level and reroll count', () => {
    const draw = (level: number, reroll: number): UpgradeId[] =>
      drawUpgradeOffer([], EVERYTHING, 3, offerRandom('abcd1234', level, reroll));
    expect(draw(4, 0)).toEqual(draw(4, 0));
    const variety = new Set(Array.from({ length: 20 }, (_, reroll) => draw(4, reroll).join()));
    expect(variety.size).toBeGreaterThan(10);
  });

  it('draws commons more often than rares', () => {
    const counts = { common: 0, uncommon: 0, rare: 0 };
    for (let index = 0; index < 2000; index++) {
      const [first] = drawUpgradeOffer([], EVERYTHING, 1, offerRandom('rarity00', 1, index));
      if (first !== undefined) counts[UPGRADES[first].rarity]++;
    }
    expect(counts.common).toBeGreaterThan(counts.uncommon);
    expect(counts.uncommon).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(0);
  });
});

describe('ids', () => {
  it('recognises upgrade IDs and counts stacks', () => {
    expect(isUpgradeId('masks')).toBe(true);
    expect(isUpgradeId('Masks')).toBe(false);
    expect(isUpgradeId(3)).toBe(false);
    expect(countUpgrades(['masks', 'masks', 'outreach']).get('masks')).toBe(2);
  });
});
