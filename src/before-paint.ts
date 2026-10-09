/**
 * Applies what must be in place before the page first draws: the theme saved in Settings, and the
 * page's language. The stylesheet follows the device's colour scheme by itself, so the theme only
 * matters for players who picked Light or Dark. For a language other than English, `<html lang>`
 * is set (it picks the Chinese fonts) and the page is marked as translating, which hides the
 * English page shell until the page's own script translates it.
 *
 * Loaded as a classic, render-blocking script at the end of every page's `<head>` (see
 * `vite.config.ts`), because the CSP forbids inline scripts and module scripts run too late to
 * prevent a flash of the wrong theme or language. It must stay small: it imports no catalogs.
 */
import { resolveLanguage } from './i18n/language';
import { TRANSLATING_ATTRIBUTE } from './i18n/shell';
import { browserLocalStorage, loadSettings } from './storage';
import { applyThemeChoice } from './theme';

const settings = loadSettings(browserLocalStorage());
applyThemeChoice(document, settings.theme);
const language = resolveLanguage(settings.language, navigator.languages);
document.documentElement.lang = language;
if (language !== 'en') document.documentElement.setAttribute(TRANSLATING_ATTRIBUTE, '');
