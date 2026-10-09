import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG } from './engine';
import { en } from './i18n/en';
import { zhHans } from './i18n/zh-hans';
import { zhHant } from './i18n/zh-hant';
import { pluralize } from './pluralize';
import { describePuzzleConfig } from './puzzle-summary';

describe('describePuzzleConfig', () => {
  it('states the daily constants', () => {
    expect(describePuzzleConfig(DAILY_PUZZLE_CONFIG, en.summary)).toBe(
      '40 people · 4 vaccines · 2 outbreaks · 2 refusers · 35% contagious',
    );
  });

  it('uses the singular for one and rounds contagiousness to a whole percent', () => {
    expect(
      describePuzzleConfig(
        {
          ...DAILY_PUZZLE_CONFIG,
          nodeCount: 20,
          vaccineCount: 1,
          indexPatientCount: 1,
          refuserCount: 1,
          transmissionProbability: 0.155,
        },
        en.summary,
      ),
    ).toBe('20 people · 1 vaccine · 1 outbreak · 1 refuser · 16% contagious');
  });

  it('states the daily constants in Chinese, with no plural forms', () => {
    expect(describePuzzleConfig(DAILY_PUZZLE_CONFIG, zhHans.summary)).toBe(
      '40 人 · 4 剂疫苗 · 2 名初始感染者 · 2 名拒绝接种者 · 传染率 35%',
    );
    expect(describePuzzleConfig({ ...DAILY_PUZZLE_CONFIG, vaccineCount: 1 }, zhHant.summary)).toBe(
      '40 人 · 1 劑疫苗 · 2 名初始感染者 · 2 名拒絕接種者 · 傳染率 35%',
    );
  });
});

describe('pluralize', () => {
  it('picks the singular only for exactly one', () => {
    expect([0, 1, 2].map((count) => pluralize(count, 'vaccine', 'vaccines'))).toEqual([
      '0 vaccines',
      '1 vaccine',
      '2 vaccines',
    ]);
  });
});
