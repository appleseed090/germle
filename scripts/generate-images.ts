/**
 * Renders the favicon set, app icons and the Open Graph card into `public/`.
 *
 * Run with `npm run generate:images` after changing the artwork below, then commit the output.
 * Uses the Playwright Chromium already installed for end-to-end tests. The PNGs are committed so
 * builds never depend on fonts or a browser being present.
 */
import { chromium, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const OUTPUT_DIRECTORY = new URL('../public/', import.meta.url);

const BRAND = {
  page: '#f7f5f0',
  accent: '#1f6f5c',
  text: '#1d2329',
  muted: '#5b646e',
  healthy: '#dde2e7',
  healthyStroke: '#87929e',
  refuser: '#f0892c',
  refuserStroke: '#b05a0c',
  infected: '#d63a3a',
  infectedStroke: '#962020',
  edge: '#b8bfc7',
};

/** The mark: three healthy people and one infected, on a rounded accent tile. */
function iconSvg(options: { rounded: boolean; contentScale: number }): string {
  const radius = options.rounded ? 14 : 0;
  const offset = 32 * (1 - options.contentScale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${radius}" fill="${BRAND.accent}"/>
  <g transform="translate(${offset} ${offset}) scale(${options.contentScale})">
    <path d="M18 20L44 16M18 20L22 46M44 16L46 44M22 46L46 44M18 20L46 44" stroke="#9fc7b9" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <circle cx="18" cy="20" r="8" fill="#f2f6f4"/>
    <circle cx="44" cy="16" r="8" fill="#f2f6f4"/>
    <circle cx="22" cy="46" r="8" fill="#f2f6f4"/>
    <circle cx="46" cy="44" r="9.5" fill="${BRAND.infected}" stroke="#ffffff" stroke-width="2.5"/>
    <circle cx="46" cy="44" r="3" fill="#ffffff"/>
  </g>
</svg>`;
}

/** A small-world ring of 18 people with an outbreak under way, for the social card. */
function networkIllustration(): string {
  const centreX = 900;
  const centreY = 318;
  const jitter = [12, -18, 6, 20, -10, 4, -22, 14, -6, 18, -14, 8, -20, 10, 2, -12, 16, -4];
  const nodes = jitter.map((offset, index) => {
    const angle = (index / jitter.length) * 2 * Math.PI - Math.PI / 2;
    return {
      x: centreX + (220 + offset) * Math.cos(angle),
      y: centreY + (215 + offset) * Math.sin(angle),
    };
  });
  const pairs: [number, number][] = [];
  nodes.forEach((_, index) => {
    pairs.push([index, (index + 1) % nodes.length], [index, (index + 2) % nodes.length]);
  });
  pairs.push([0, 6], [8, 14], [11, 3]);
  const infected = new Set([2, 3, 4, 5, 13]);
  const refusers = new Set([8, 16]);
  const edges = pairs
    .map(([from, to]) => {
      const a = nodes[from];
      const b = nodes[to];
      if (a === undefined || b === undefined) return '';
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${BRAND.edge}" stroke-width="4" stroke-linecap="round"/>`;
    })
    .join('');
  const people = nodes
    .map(({ x, y }, index) => {
      if (infected.has(index)) {
        return `<circle cx="${x}" cy="${y}" r="26" fill="${BRAND.infected}" stroke="${BRAND.infectedStroke}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="8.5" fill="#fff"/>`;
      }
      if (refusers.has(index)) {
        const arm = 11;
        return `<circle cx="${x}" cy="${y}" r="26" fill="${BRAND.refuser}" stroke="${BRAND.refuserStroke}" stroke-width="3"/><path d="M${x - arm} ${y - arm}L${x + arm} ${y + arm}M${x + arm} ${y - arm}L${x - arm} ${y + arm}" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
      }
      return `<circle cx="${x}" cy="${y}" r="26" fill="${BRAND.healthy}" stroke="${BRAND.healthyStroke}" stroke-width="3"/>`;
    })
    .join('');
  const from = nodes[5];
  const to = nodes[6];
  const pathogen =
    from && to
      ? `<circle cx="${(from.x + to.x) / 2}" cy="${(from.y + to.y) / 2}" r="10" fill="#b91c1c" stroke="#fff" stroke-width="3"/>`
      : '';
  return edges + people + pathogen;
}

function openGraphSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BRAND.page}"/>
  ${networkIllustration()}
  <g font-family="Liberation Sans, Arial, Helvetica, sans-serif">
    <g transform="translate(80 150) scale(1.6)">${iconSvg({ rounded: true, contentScale: 1 }).replace(/<\/?svg[^>]*>/g, '')}</g>
    <text x="80" y="390" font-size="112" font-weight="700" fill="${BRAND.text}" letter-spacing="-2">Germle</text>
    <text x="84" y="452" font-size="42" fill="${BRAND.muted}">A daily outbreak puzzle.</text>
    <text x="84" y="540" font-size="30" font-weight="700" fill="${BRAND.accent}">germle.com</text>
  </g>
</svg>`;
}

async function renderPng(page: Page, svg: string, width: number, height: number): Promise<Buffer> {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><body style="margin:0"><div style="width:${width}px;height:${height}px">${svg.replace(
      '<svg ',
      `<svg width="${width}" height="${height}" `,
    )}</div></body></html>`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

/** An ICO file whose entries are PNG images, which every current browser accepts. */
function icoFromPngs(images: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

function write(name: string, contents: string | Buffer): void {
  writeFileSync(new URL(name, OUTPUT_DIRECTORY), contents);
  console.log(`wrote public/${name}`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const roundedIcon = iconSvg({ rounded: true, contentScale: 1 });
  const squareIcon = iconSvg({ rounded: false, contentScale: 1 });
  const maskableIcon = iconSvg({ rounded: false, contentScale: 0.72 });
  write('favicon.svg', `${roundedIcon}\n`);
  write(
    'favicon.ico',
    icoFromPngs([
      { size: 16, png: await renderPng(page, roundedIcon, 16, 16) },
      { size: 32, png: await renderPng(page, roundedIcon, 32, 32) },
      { size: 48, png: await renderPng(page, roundedIcon, 48, 48) },
    ]),
  );
  write('apple-touch-icon.png', await renderPng(page, squareIcon, 180, 180));
  write('icon-192.png', await renderPng(page, roundedIcon, 192, 192));
  write('icon-512.png', await renderPng(page, roundedIcon, 512, 512));
  write('icon-maskable-512.png', await renderPng(page, maskableIcon, 512, 512));
  write('og.png', await renderPng(page, openGraphSvg(), 1200, 630));
} finally {
  await browser.close();
}
