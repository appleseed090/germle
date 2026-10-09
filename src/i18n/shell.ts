import type { Language } from './language';
import type { ShellTranslations } from './messages';

/**
 * Set on `<html>` by the before-paint script when the page shell is about to be translated, so
 * the stylesheet hides the English text until {@link localizePage} replaces it.
 */
export const TRANSLATING_ATTRIBUTE = 'data-translating';

/** A piece of a shell translation: plain text, or one of the element's child elements. */
export type ShellSegment =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'element';
      readonly tagName: string;
      /** Replaces the child's content; empty keeps the content it has (an icon, a count). */
      readonly text: string;
    };

const CHILD_ELEMENT = /<([a-z][a-z0-9]*)>([^<]*)<\/\1>/g;

/**
 * Splits a shell translation into text and child elements. The only markup allowed is a child
 * element named by its tag, with plain text or nothing inside: `Play it in the <a>archive</a>.`
 * Text is never parsed as HTML, so a translation cannot add elements or attributes.
 *
 * @throws Error if `<` appears anywhere else: an unclosed, nested or mismatched tag.
 */
export function parseShellTranslation(translation: string): ShellSegment[] {
  const segments: ShellSegment[] = [];
  let textStart = 0;
  const pushText = (end: number): void => {
    const text = translation.slice(textStart, end);
    if (text.includes('<')) throw new Error(`Malformed markup in translation: ${translation}`);
    if (text !== '') segments.push({ kind: 'text', text });
  };
  for (const match of translation.matchAll(CHILD_ELEMENT)) {
    pushText(match.index);
    segments.push({ kind: 'element', tagName: match[1] ?? '', text: match[2] ?? '' });
    textStart = match.index + match[0].length;
  }
  pushText(translation.length);
  return segments;
}

/**
 * Prepares a page for `language`: sets `<html lang>`, which also picks the right Chinese fonts,
 * and translates the page shell, then shows the page if the before-paint script hid it.
 *
 * @param translations - The shell translations of `language`; `undefined` for English, the
 *   language the shells are written in.
 * @throws Error if the shell has a key with no translation, or a translation does not place
 *   exactly the element's own child elements: the shells and catalogs ship together, so that is
 *   a programming error and fails as the page starts.
 */
export function localizePage(
  page: Document,
  language: Language,
  translations: ShellTranslations | undefined,
): void {
  page.documentElement.lang = language;
  try {
    if (translations !== undefined) translatePageShell(page, translations);
  } finally {
    page.documentElement.removeAttribute(TRANSLATING_ATTRIBUTE);
  }
}

function translatePageShell(page: Document, translations: ShellTranslations): void {
  const translationOf = (key: string | null): string => {
    const translation = key === null ? undefined : translations[key];
    if (translation === undefined) throw new Error(`No shell translation for "${String(key)}"`);
    return translation;
  };
  for (const element of page.querySelectorAll('[data-i18n]')) {
    const key = element.getAttribute('data-i18n');
    element.replaceChildren(...translatedChildren(page, element, translationOf(key), String(key)));
  }
  for (const element of page.querySelectorAll('[data-i18n-label]'))
    element.setAttribute('aria-label', translationOf(element.getAttribute('data-i18n-label')));
}

/**
 * The element's new children: the translation's text, with its existing child elements moved
 * into the places the translation names. The n-th `<a>` of the translation is the element's n-th
 * `<a>` child, so links keep their `href` and elements keep the ids scripts look up.
 */
function translatedChildren(
  page: Document,
  element: Element,
  translation: string,
  key: string,
): Node[] {
  const unplaced = new Map<string, Element[]>();
  for (const child of element.children) {
    const tagName = child.tagName.toLowerCase();
    unplaced.set(tagName, [...(unplaced.get(tagName) ?? []), child]);
  }
  const children = parseShellTranslation(translation).map((segment): Node => {
    if (segment.kind === 'text') return page.createTextNode(segment.text);
    const child = unplaced.get(segment.tagName)?.shift();
    if (child === undefined)
      throw new Error(`Shell translation "${key}" names a <${segment.tagName}> the page lacks`);
    if (segment.text !== '') child.textContent = segment.text;
    return child;
  });
  const dropped = [...unplaced.values()].flat();
  if (dropped.length > 0) {
    const tags = dropped.map((child) => `<${child.tagName.toLowerCase()}>`).join(', ');
    throw new Error(`Shell translation "${key}" leaves out ${tags}`);
  }
  return children;
}
