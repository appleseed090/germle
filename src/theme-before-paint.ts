/**
 * Applies the theme saved in Settings before the page first draws. The stylesheet follows the
 * device's colour scheme by itself; this only matters for players who picked Light or Dark.
 *
 * Loaded as a classic, render-blocking script at the end of every page's `<head>` (see
 * `vite.config.ts`), because the CSP forbids inline scripts and module scripts run too late to
 * prevent a flash of the wrong theme.
 */
import { browserLocalStorage, loadSettings } from './storage';
import { applyThemeChoice } from './theme';

applyThemeChoice(document, loadSettings(browserLocalStorage()).theme);
