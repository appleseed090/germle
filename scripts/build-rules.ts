/**
 * The rules that keep the two products apart (see CLAUDE.md), as pure functions over file
 * contents so they can be unit-tested. `scripts/check-builds.ts` applies them to `dist/`,
 * `dist-portal/` and the portal sources; `npm run check` runs it.
 */

/** One file of a build output or source tree. `text` is undefined for binary files. */
export interface CheckedFile {
  /** Path relative to the checked directory, with forward slashes. */
  readonly path: string;
  readonly text: string | undefined;
  readonly byteLength: number;
}

/** The only script the portal build may load from another origin. */
export const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/**
 * URLs the portal output may contain. XML namespaces are identifiers, not links: the board creates
 * SVG elements with `createElementNS`.
 */
const PORTAL_ALLOWED_URLS: ReadonlySet<string> = new Set([
  CRAZYGAMES_SDK_URL,
  'http://www.w3.org/2000/svg',
]);

/** CrazyGames' technical requirements (unverified copy; see DECISIONS.md "Germle Endless"). */
export const PORTAL_LIMITS = Object.freeze({
  maximumFileCount: 1500,
  maximumInitialDownloadBytes: 20 * 1024 * 1024,
});

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.svg',
  '.txt',
  '.json',
  '.webmanifest',
  '.xml',
]);

/** Whether a build file is checked as text: known text extensions and extensionless files. */
export function isTextPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 || TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

interface ForbiddenPattern {
  readonly pattern: RegExp;
  readonly reason: string;
}

/** Anything that would mean portal code, strings or the SDK reached germle.com. */
const GERMLE_COM_FORBIDDEN: readonly ForbiddenPattern[] = [
  { pattern: /crazygames/i, reason: 'CrazyGames SDK or name' },
  { pattern: /germle[ -]endless/i, reason: 'Germle Endless name or product marker' },
  { pattern: /dist-portal|src\/portal|src\/endless/, reason: 'portal source path' },
];

/** Other game portals whose branding CrazyGames forbids. */
const OTHER_PORTALS =
  /\b(poki|gamedistribution|gamemonetize|kongregate|armor ?games|y8\.com|itch\.io|newgrounds|coolmath|miniclip|addicting ?games|gamepix|game ?jolt|lagged\.com)\b/i;

const PORTAL_FORBIDDEN: readonly ForbiddenPattern[] = [
  { pattern: /germle\.com/i, reason: 'link to germle.com' },
  {
    pattern: /requestFullscreen|webkitRequestFullscreen|mozRequestFullScreen|msRequestFullscreen/,
    reason: 'custom fullscreen (CrazyGames provides its own)',
  },
  { pattern: /(['"`])Esc(ape)?\1/, reason: 'Escape used as a control' },
  { pattern: /showModal/, reason: 'modal <dialog>, which Escape closes' },
  {
    pattern: /\b(localStorage|sessionStorage|indexedDB)\b/,
    reason: 'browser storage (the SDK Data module is the only save path)',
  },
  { pattern: OTHER_PORTALS, reason: "another portal's branding" },
  {
    pattern: /adsbygoogle|googlesyndication|doubleclick|imasdk|adinplay|applixir/i,
    reason: 'external ad network',
  },
  { pattern: /window\.open\b|target=["']?_blank/, reason: 'opens another site' },
  { pattern: /<a\s[^>]*href/i, reason: 'link element' },
];

const URL_PATTERN = /\b(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>\\]*/gi;

/**
 * Violations of rule 3 in the germle.com output (`dist/`): no CrazyGames SDK, no portal pages,
 * no portal strings.
 *
 * @returns One message per violation; empty when the output is clean.
 */
export function germleComBuildViolations(files: readonly CheckedFile[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    if (/portal|endless/i.test(file.path))
      violations.push(`dist/${file.path}: portal file in the germle.com build`);
    if (file.text === undefined) continue;
    for (const { pattern, reason } of GERMLE_COM_FORBIDDEN)
      if (pattern.test(file.text)) violations.push(`dist/${file.path}: ${reason}`);
  }
  return violations;
}

/**
 * Violations of the portal rules in `dist-portal/`: `index.html` at the root, relative paths, no
 * links or URLs beyond the SDK, nothing CrazyGames forbids, and its size limits.
 *
 * @returns One message per violation; empty when the output is clean.
 */
export function portalBuildViolations(files: readonly CheckedFile[]): string[] {
  const violations: string[] = [];
  if (!files.some((file) => file.path === 'index.html'))
    violations.push('dist-portal/index.html is missing (CrazyGames loads it from the zip root)');
  if (files.length > PORTAL_LIMITS.maximumFileCount)
    violations.push(
      `dist-portal has ${files.length} files (limit ${PORTAL_LIMITS.maximumFileCount})`,
    );
  const totalBytes = files.reduce((sum, file) => sum + file.byteLength, 0);
  if (totalBytes > PORTAL_LIMITS.maximumInitialDownloadBytes)
    violations.push(
      `dist-portal is ${totalBytes} bytes (limit ${PORTAL_LIMITS.maximumInitialDownloadBytes})`,
    );
  for (const file of files) {
    if (file.text === undefined) continue;
    const where = `dist-portal/${file.path}`;
    for (const { pattern, reason } of PORTAL_FORBIDDEN)
      if (pattern.test(file.text)) violations.push(`${where}: ${reason}`);
    for (const url of file.text.match(URL_PATTERN) ?? [])
      if (!PORTAL_ALLOWED_URLS.has(url)) violations.push(`${where}: external URL ${url}`);
    if (/\b(?:src|href)=["']?\//.test(file.text) || /url\(\s*["']?\//.test(file.text))
      violations.push(`${where}: absolute path (CrazyGames needs relative paths)`);
  }
  return violations;
}

/** Words a PEGI 12 game for a general (not child) audience should not show here. */
const CONTENT_FORBIDDEN =
  /\b(kill\w*|dead|death\w*|die|dies|died|dying|corpses?|blood\w*|gore|murder\w*|weapons?|guns?|bombs?|alcohol|drugs?|gambl\w*|casino|kids?|child|children|toddlers?|preschool\w*)\b/i;

const PORTAL_STRINGS_FILE = 'src/portal/strings.ts';

/**
 * Violations in the portal's TypeScript sources: every English string the player can see lives in
 * `src/portal/strings.ts`, and that file stays within the content rules.
 *
 * Elsewhere a string literal fails if it holds two words separated by a space or is a single
 * capitalised word, which is how visible text looks; identifiers, CSS classes, event names and
 * keys do not. A line ending in `// not-player-text` is exempt, for the rare exception.
 *
 * @param files - Sources under `src/portal/` and `src/endless/`, tests excluded.
 */
export function portalSourceViolations(files: readonly CheckedFile[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    if (file.text === undefined) continue;
    if (file.path === PORTAL_STRINGS_FILE) {
      const match = CONTENT_FORBIDDEN.exec(stripComments(file.text));
      if (match !== null)
        violations.push(
          `${file.path}: "${match[0]}" is outside the PEGI 12 / general-audience tone`,
        );
      continue;
    }
    stripComments(file.text)
      .split('\n')
      .forEach((line, index) => {
        if (line.trimEnd().endsWith('// not-player-text')) return;
        for (const literal of stringLiteralContents(line)) {
          if (looksLikePlayerText(literal))
            violations.push(
              `${file.path}:${index + 1}: "${literal}" looks like player text; move it to ${PORTAL_STRINGS_FILE}`,
            );
        }
      });
  }
  return violations;
}

/** Blanks block and line comments, keeping line breaks so line numbers stay right. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/(?! not-player-text).*$/gm, '$1');
}

function stringLiteralContents(line: string): string[] {
  const literals: string[] = [];
  for (const match of line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g))
    literals.push((match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ' '));
  return literals;
}

/** `KeyboardEvent.key` values look like capitalised words but are not text. */
const KEY_NAMES: ReadonlySet<string> = new Set(['Enter', 'Tab', 'Home', 'End', 'Backspace']);

function looksLikePlayerText(literal: string): boolean {
  if (KEY_NAMES.has(literal)) return false;
  return /[A-Za-z]{2,}[,.!?]?\s+[A-Za-z]{2,}/.test(literal) || /^[A-Z][a-z]+[.!?]?$/.test(literal);
}
