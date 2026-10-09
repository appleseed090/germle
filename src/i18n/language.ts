/** Every language Germle is written in, as BCP 47 tags that `<html lang>` and `Intl` accept. */
export const LANGUAGES = ['en', 'zh-Hans', 'zh-Hant'] as const;

export type Language = (typeof LANGUAGES)[number];

/** Each language's name in itself, as the language menu lists it whatever the page's language. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = Object.freeze({
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
});

/** Narrows untrusted input (storage, form values) to a supported language. */
export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language === value);
}

/**
 * The supported language a browser language tag asks for: any English is `en`, and Chinese goes
 * by its script, so `zh-TW`, `zh-HK` and `zh-Hant` are Traditional while `zh`, `zh-CN`, `zh-SG`
 * and `zh-Hans` are Simplified.
 *
 * @returns `undefined` for other languages and for malformed tags.
 */
export function languageForTag(tag: string): Language | undefined {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(tag);
  } catch {
    return undefined;
  }
  if (locale.language === 'en') return 'en';
  if (locale.language !== 'zh') return undefined;
  return locale.maximize().script === 'Hant' ? 'zh-Hant' : 'zh-Hans';
}

/**
 * The language to show: the one picked in the language menu, else the first of the browser's
 * preferred languages that Germle supports, else English.
 *
 * @param chosen - The stored choice; `null` follows the browser.
 * @param browserLanguages - `navigator.languages`, most preferred first.
 */
export function resolveLanguage(
  chosen: Language | null,
  browserLanguages: readonly string[],
): Language {
  if (chosen !== null) return chosen;
  for (const tag of browserLanguages) {
    const language = languageForTag(tag);
    if (language !== undefined) return language;
  }
  return 'en';
}

/**
 * The locale to format dates in: the first browser language that is a regional form of
 * `language` (`en-GB` for English, `zh-HK` for Traditional Chinese), so players keep their own
 * date order, else `language` itself.
 */
export function formattingLocale(language: Language, browserLanguages: readonly string[]): string {
  return browserLanguages.find((tag) => languageForTag(tag) === language) ?? language;
}
