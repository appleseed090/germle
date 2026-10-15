import { describe, expect, it } from 'vitest';
import {
  CRAZYGAMES_SDK_URL,
  germleComBuildViolations,
  isTextPath,
  portalBuildViolations,
  portalSourceViolations,
  type CheckedFile,
} from './build-rules.ts';

function textFile(path: string, text: string): CheckedFile {
  return { path, text, byteLength: text.length };
}

const CLEAN_PORTAL_INDEX = textFile(
  'index.html',
  `<script src="${CRAZYGAMES_SDK_URL}"></script><script type="module" src="./assets/index.js"></script>`,
);

describe('isTextPath', () => {
  it('treats code, markup and extensionless config files as text, images as binary', () => {
    expect(isTextPath('assets/index-abc.js')).toBe(true);
    expect(isTextPath('_headers')).toBe(true);
    expect(isTextPath('src/portal/app.ts')).toBe(true);
    expect(isTextPath('og.png')).toBe(false);
  });
});

describe('germleComBuildViolations', () => {
  it('passes a germle.com build with no portal traces', () => {
    expect(
      germleComBuildViolations([
        textFile('index.html', '<a href="https://germle.com">Germle</a>'),
        { path: 'og.png', text: undefined, byteLength: 10 },
      ]),
    ).toEqual([]);
  });

  it('fails on the SDK, the portal name or a portal file', () => {
    expect(
      germleComBuildViolations([
        textFile('assets/a.js', 'window.CrazyGames.SDK.init()'),
        textFile('assets/b.js', '"Germle Endless"'),
        textFile('portal.html', ''),
      ]),
    ).toHaveLength(3);
  });
});

describe('portalBuildViolations', () => {
  it('passes a build with only the SDK URL and the SVG namespace', () => {
    expect(
      portalBuildViolations([
        CLEAN_PORTAL_INDEX,
        textFile('assets/index.js', 'createElementNS("http://www.w3.org/2000/svg","g")'),
      ]),
    ).toEqual([]);
  });

  it('requires index.html at the root', () => {
    expect(portalBuildViolations([textFile('game/index.html', '')])).toEqual([
      'dist-portal/index.html is missing (CrazyGames loads it from the zip root)',
    ]);
  });

  it.each([
    ['a link to germle.com', 'see germle.com'],
    ['another URL', 'fetch("https://example.org/x")'],
    ['custom fullscreen', 'el.requestFullscreen()'],
    ['Escape as a control', 'if (e.key === "Escape") pause()'],
    ['a modal dialog', 'dialog.showModal()'],
    ['browser storage', 'localStorage.setItem(k, v)'],
    ["another portal's branding", 'Also on Poki!'],
    ['an external ad network', 'adsbygoogle.push({})'],
    ['a new window', 'window.open(u)'],
    ['an absolute asset path', '<script src="/assets/x.js"></script>'],
  ])('fails on %s', (_, text) => {
    expect(
      portalBuildViolations([CLEAN_PORTAL_INDEX, textFile('assets/x.js', text)]).length,
    ).toBeGreaterThan(0);
  });

  it('enforces the file count limit', () => {
    const files = Array.from({ length: 1501 }, (_, index) => textFile(`f${index}.js`, ''));
    expect(portalBuildViolations([CLEAN_PORTAL_INDEX, ...files])).toContain(
      'dist-portal has 1502 files (limit 1500)',
    );
  });
});

describe('portalSourceViolations', () => {
  it('accepts identifiers, classes and keys outside the strings file', () => {
    expect(
      portalSourceViolations([
        textFile(
          'src/portal/screen.ts',
          "element.classList.add('hud-level');\nif (event.key === 'Enter') go(); // Starts the run\n" +
            "const css = 'portal-button portal-button--primary';\nthrow new Error('No run in progress');\n",
        ),
      ]),
    ).toEqual([]);
  });

  it('flags visible text outside the strings file, with its line', () => {
    expect(
      portalSourceViolations([
        textFile('src/portal/screen.ts', "\nlabel.textContent = 'Tap to vaccinate';\n"),
      ]),
    ).toEqual([
      'src/portal/screen.ts:2: "Tap to vaccinate" looks like player text; move it to src/portal/strings.ts',
    ]);
    expect(
      portalSourceViolations([textFile('src/endless/upgrades.ts', "const name = 'Masks';")]),
    ).toHaveLength(1);
    expect(
      portalSourceViolations([
        textFile('src/portal/x.ts', "hint.textContent = 'tap to vaccinate';"),
      ]),
    ).toHaveLength(1);
  });

  it('honours the explicit exemption marker', () => {
    expect(
      portalSourceViolations([
        textFile('src/portal/x.ts', "const font = 'Liberation Sans'; // not-player-text"),
      ]),
    ).toEqual([]);
  });

  it('keeps the strings file within the content rules', () => {
    expect(
      portalSourceViolations([
        textFile('src/portal/strings.ts', "export const A = 'Save everyone';"),
      ]),
    ).toEqual([]);
    expect(
      portalSourceViolations([
        textFile('src/portal/strings.ts', "export const A = 'Nobody died';"),
      ]),
    ).toHaveLength(1);
  });
});
