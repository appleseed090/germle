import { en } from './en';
import { formattingLocale, resolveLanguage, type Language } from './language';
import type { Messages } from './messages';
import { localizePage } from './shell';
import { zhHans } from './zh-hans';
import { zhHant } from './zh-hant';

const MESSAGES: Readonly<Record<Language, Messages>> = {
  en,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
};

/** The language a page is shown in, and what its scripts need to write in it. */
export interface PageLanguage {
  readonly language: Language;
  readonly messages: Messages;
  /** The locale for `Intl` date formats; see {@link formattingLocale}. */
  readonly formattingLocale: string;
}

/**
 * Picks the page's language and translates its shell. Every page entry calls this before
 * anything else, so the scripts that follow find the translated shell and write in the same
 * language.
 *
 * @param chosen - The language picked in the language menu; `null` follows the browser.
 * @param browserLanguages - `navigator.languages`.
 * @throws Error if the shell and the language's translations disagree; see `localizePage`.
 */
export function setUpPageLanguage(
  page: Document,
  chosen: Language | null,
  browserLanguages: readonly string[],
): PageLanguage {
  const language = resolveLanguage(chosen, browserLanguages);
  const messages = MESSAGES[language];
  localizePage(page, language, messages.shell);
  return { language, messages, formattingLocale: formattingLocale(language, browserLanguages) };
}
