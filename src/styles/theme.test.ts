import { describe, expect, it } from 'vitest';
import aboutHtml from '../../about.html?raw';
import dailyHtml from '../../index.html?raw';
import practiceHtml from '../../practice.html?raw';
import stylesheet from './main.css?raw';

type Tokens = ReadonlyMap<string, string>;

function declarationsIn(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g))
    tokens.set(name as string, (value as string).trim());
  return tokens;
}

function blockAfter(selector: string): string {
  const start = stylesheet.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector}" block in main.css`);
  return stylesheet.slice(start, stylesheet.indexOf('}', start));
}

const lightTokens: Tokens = declarationsIn(blockAfter(':root'));
const darkWhenDevicePrefers = declarationsIn(blockAfter(":root:not([data-theme='light'])"));
const darkWhenChosen = declarationsIn(blockAfter(":root[data-theme='dark']"));
const darkTokens: Tokens = new Map([...lightTokens, ...darkWhenChosen]);

function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const [red, green, blue] = match.slice(1).map((pair) => {
    const channel = Number.parseInt(pair, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2 contrast ratio between two tokens of a theme. */
function contrast(tokens: Tokens, first: string, second: string): number {
  const colour = (name: string): string => {
    const value = tokens.get(name);
    if (value === undefined) throw new Error(`Unknown token ${name}`);
    return value;
  };
  const [lighter, darker] = [colour(first), colour(second)]
    .map(relativeLuminance)
    .sort((left, right) => right - left) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text: WCAG AA for normal-size text. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['--color-text', '--color-page'],
  ['--color-text', '--color-surface'],
  ['--color-text-muted', '--color-page'],
  ['--color-text-muted', '--color-surface'],
  ['--color-accent', '--color-page'],
  ['--color-accent', '--color-surface'],
  ['--color-on-accent', '--color-accent'],
  ['--color-on-accent', '--color-accent-strong'],
  ['--color-spread-text', '--color-surface'],
  ['--color-on-status', '--color-vaccinated'],
  ['--color-on-status', '--color-node-infected'],
  ['--color-surface', '--color-text'],
  ['--color-text', '--color-histogram-bar'],
  ['--color-text-muted', '--color-histogram-bar-empty'],
  ['--color-node-healthy-count', '--color-node-healthy'],
  ['--color-node-refuser-count', '--color-node-refuser'],
  ['--color-node-infected-count', '--color-node-infected'],
];

/** Non-text marks a player needs to read the board and results: WCAG AA 3:1 (1.4.11). */
const MARK_PAIRS: readonly (readonly [string, string])[] = [
  ['--color-infected-pattern', '--color-infected'],
  ['--color-pathogen', '--color-page'],
  ['--color-focus', '--color-page'],
  ['--color-focus', '--color-surface'],
];

/** Each person's disc must stand out from the board through its fill or its outline. */
const PEOPLE = ['healthy', 'refuser', 'infected'] as const;

describe.each([
  ['light', lightTokens],
  ['dark', darkTokens],
])('the %s theme', (_, tokens) => {
  it.each(TEXT_PAIRS)('keeps %s on %s at 4.5:1 or more', (foreground, background) => {
    expect(contrast(tokens, foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MARK_PAIRS)('keeps %s against %s at 3:1 or more', (mark, background) => {
    expect(contrast(tokens, mark, background)).toBeGreaterThanOrEqual(3);
  });

  it.each(PEOPLE)('outlines a %s person at 3:1 or more against the board', (person) => {
    const fill = contrast(tokens, `--color-node-${person}`, '--color-page');
    const stroke = contrast(tokens, `--color-node-${person}-stroke`, '--color-page');
    expect(Math.max(fill, stroke)).toBeGreaterThanOrEqual(3);
  });
});

describe('the dark theme', () => {
  it('is declared identically for the device preference and for an explicit choice', () => {
    expect([...darkWhenDevicePrefers]).toEqual([...darkWhenChosen]);
  });

  it('only overrides tokens the light theme defines', () => {
    for (const name of darkWhenChosen.keys()) expect(lightTokens.has(name), name).toBe(true);
  });
});

describe.each([
  ['index.html', dailyHtml],
  ['practice.html', practiceHtml],
  ['about.html', aboutHtml],
])('%s', (_, html) => {
  it('colours the browser UI like the page in each theme', () => {
    const metas = [...html.matchAll(/<meta\s+name="theme-color"([^>]*)>/g)].map(
      ([, attributes]) => ({
        content: /content="([^"]+)"/.exec(attributes ?? '')?.[1],
        media: /media="([^"]+)"/.exec(attributes ?? '')?.[1],
        scheme: /data-scheme="([^"]+)"/.exec(attributes ?? '')?.[1],
      }),
    );
    expect(metas).toEqual([
      {
        content: lightTokens.get('--color-page'),
        media: '(prefers-color-scheme: light)',
        scheme: 'light',
      },
      {
        content: darkTokens.get('--color-page'),
        media: '(prefers-color-scheme: dark)',
        scheme: 'dark',
      },
    ]);
  });
});
