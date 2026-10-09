import { describe, expect, it } from 'vitest';
import { formattingLocale, isLanguage, languageForTag, resolveLanguage } from './language';

describe('languageForTag', () => {
  it('maps any English to English and Chinese by its script', () => {
    expect(['en', 'en-US', 'en-GB'].map(languageForTag)).toEqual(['en', 'en', 'en']);
    expect(['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW'].map(languageForTag)).toEqual(
      Array(5).fill('zh-Hans'),
    );
    expect(['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-CN'].map(languageForTag)).toEqual(
      Array(5).fill('zh-Hant'),
    );
  });

  it('has no language for other languages or malformed tags', () => {
    expect(['fr', 'ja', '', 'not a tag', 'zh_TW'].map(languageForTag)).toEqual(
      Array(5).fill(undefined),
    );
  });
});

describe('resolveLanguage', () => {
  it('prefers the stored choice, then the first supported browser language, then English', () => {
    expect(resolveLanguage('zh-Hant', ['en-US'])).toBe('zh-Hant');
    expect(resolveLanguage(null, ['fr-FR', 'zh-TW', 'en'])).toBe('zh-Hant');
    expect(resolveLanguage(null, ['zh-CN'])).toBe('zh-Hans');
    expect(resolveLanguage(null, ['fr', 'de'])).toBe('en');
    expect(resolveLanguage(null, [])).toBe('en');
  });
});

describe('formattingLocale', () => {
  it("keeps the browser's regional form of the language, else the language itself", () => {
    expect(formattingLocale('en', ['en-GB', 'zh-TW'])).toBe('en-GB');
    expect(formattingLocale('zh-Hant', ['en-GB', 'zh-HK'])).toBe('zh-HK');
    expect(formattingLocale('zh-Hans', ['en-GB', 'zh-HK'])).toBe('zh-Hans');
  });
});

describe('isLanguage', () => {
  it('accepts exactly the supported tags', () => {
    expect(['en', 'zh-Hans', 'zh-Hant'].every(isLanguage)).toBe(true);
    expect(['EN', 'zh', 'zh-hans', null, 1].some(isLanguage)).toBe(false);
  });
});
