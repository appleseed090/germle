import { describe, expect, it } from 'vitest';
import { UPGRADE_BALANCE } from '../endless/balance';
import { STRINGS } from './strings';

describe('upgrade descriptions', () => {
  it('quote the numbers the balance actually applies', () => {
    const maskPercent = Math.round((1 - UPGRADE_BALANCE.transmissionMultiplierPerMask) * 100);
    expect(STRINGS.upgrades.masks.description).toContain(`${String(maskPercent)}% less`);
    expect(STRINGS.upgrades['safety-margin'].description).toBe(
      `Every level asks you to save ${String(UPGRADE_BALANCE.passThresholdPointsPerSafetyMargin)}% less: Save 60% becomes Save ${String(60 - UPGRADE_BALANCE.passThresholdPointsPerSafetyMargin)}%.`,
    );
    expect(STRINGS.upgrades['natural-immunity'].description).toMatch(
      new RegExp(`^${String(UPGRADE_BALANCE.immunePeoplePerStack)} random `),
    );
  });
});

describe('naturallyImmune toast', () => {
  it('points at the dashed outline, in the singular and the plural', () => {
    expect(STRINGS.toasts.naturallyImmune(1)).toBe('1 person starts immune: the dashed circle');
    expect(STRINGS.toasts.naturallyImmune(3)).toBe('3 people start immune: the dashed circles');
  });
});
