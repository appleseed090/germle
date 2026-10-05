/**
 * A colour theme the player picked explicitly. Wherever the choice is optional, `null` means
 * "follow the device".
 */
export type ThemeChoice = 'light' | 'dark';

/** Narrows untrusted input (storage, form values) to a theme choice. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark';
}

/**
 * Applies a theme to a page. The stylesheet follows `prefers-color-scheme` unless `<html>` carries
 * `data-theme`, so `null` removes the attribute and an explicit choice sets it.
 *
 * Each page has one `<meta name="theme-color" data-scheme="light|dark">` per theme, whose `media`
 * normally matches the device's scheme. An explicit choice switches the chosen theme's meta to
 * `all` and the other to `not all`, so the browser's own UI matches the page; `null` restores the
 * device queries.
 */
export function applyThemeChoice(page: Document, theme: ThemeChoice | null): void {
  const root = page.documentElement;
  if (theme === null) delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
  for (const meta of page.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"][data-scheme]',
  )) {
    const scheme = meta.dataset['scheme'];
    if (!isThemeChoice(scheme)) continue;
    if (theme === null) meta.media = `(prefers-color-scheme: ${scheme})`;
    else meta.media = scheme === theme ? 'all' : 'not all';
  }
}
