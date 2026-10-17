/**
 * Packages Germle Endless for upload to the CrazyGames Developer Portal:
 *
 * 1. builds both launch stages with `vite.portal.config.ts`: Basic Launch (`dist-portal/`, no ads,
 *    what a new game is uploaded as) and Full Launch (`dist-portal-full/`, with ads, uploaded once
 *    CrazyGames moves the game to Full Launch); see `src/portal/platform/launch-stage.ts`;
 * 2. checks both against the portal rules (`scripts/build-rules.ts`), and the Basic Launch build
 *    for any ad request, and stops if any fails;
 * 3. zips them into `release/germle-endless-basic-launch.zip` and
 *    `release/germle-endless-full-launch.zip`, with `index.html` at each archive's root;
 * 4. renders the three covers CrazyGames asks for (1920 × 1080, 800 × 1200, 800 × 800) from
 *    `portal/cover.html`, which draws a network mid-outbreak with the real board renderer, into
 *    `release/covers/`.
 *
 * Usage: `npm run package:portal`. Needs the Playwright Chromium the end-to-end tests use. Never
 * uploads anything: the owner uploads the zips and covers by hand.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, createServer } from 'vite';
import { FULL_LAUNCH_MODE } from '../vite.portal.config.ts';
import { basicLaunchBuildViolations, portalBuildViolations } from './build-rules.ts';
import { readFileTree } from './file-tree.ts';
import { createZip } from './zip.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const CONFIG_FILE = join(ROOT, 'vite.portal.config.ts');
const RELEASE = join(ROOT, 'release');
/** The zip each launch stage ships as, from the folder its build writes. */
const PACKAGES = [
  {
    mode: 'production',
    outDir: 'dist-portal',
    zip: 'germle-endless-basic-launch.zip',
    extraRules: basicLaunchBuildViolations,
  },
  {
    mode: FULL_LAUNCH_MODE,
    outDir: 'dist-portal-full',
    zip: 'germle-endless-full-launch.zip',
    extraRules: () => [],
  },
] as const;
/** The single zip earlier versions of this script wrote; removed so it is never uploaded by mistake. */
const OLD_ZIP_PATH = join(RELEASE, 'germle-endless.zip');
const COVERS = join(RELEASE, 'covers');

/** CrazyGames' cover sizes (Requirements → Game covers). */
const COVER_SIZES = [
  { name: 'landscape', width: 1920, height: 1080 },
  { name: 'portrait', width: 800, height: 1200 },
  { name: 'square', width: 800, height: 800 },
] as const;

const builds = [];
for (const launchPackage of PACKAGES) {
  await build({ configFile: CONFIG_FILE, mode: launchPackage.mode, logLevel: 'warn' });
  const files = readFileTree(ROOT, launchPackage.outDir);
  const violations = [...portalBuildViolations(files), ...launchPackage.extraRules(files)];
  if (violations.length > 0) {
    console.error(`${launchPackage.outDir}/ breaks the CrazyGames rules:`);
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  builds.push({ ...launchPackage, files });
}

// Only this script's outputs: `release/videos/` comes from `npm run videos:portal`.
rmSync(OLD_ZIP_PATH, { force: true });
rmSync(COVERS, { recursive: true, force: true });
mkdirSync(COVERS, { recursive: true });
for (const { zip: zipName, files } of builds) {
  const zip = createZip(files.map(({ path, bytes }) => ({ path, data: bytes })));
  writeFileSync(join(RELEASE, zipName), zip);
  console.log(`Wrote release/${zipName}: ${files.length} files, ${zip.length} bytes`);
  for (const { path, byteLength } of files) console.log(`  ${path} (${byteLength} bytes)`);
}

const server = await createServer({
  configFile: CONFIG_FILE,
  logLevel: 'warn',
  server: { port: 0, strictPort: false },
});
await server.listen();
const address = server.resolvedUrls?.local[0];
if (address === undefined) throw new Error('The cover server has no local address');
const browser = await chromium.launch();
try {
  for (const { name, width, height } of COVER_SIZES) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'light' });
    await page.goto(new URL('cover.html', address).href);
    await page.locator('#cover[data-ready="true"] .node').first().waitFor();
    const fileName = `germle-endless-cover-${name}-${width}x${height}.png`;
    await page.screenshot({ path: join(COVERS, fileName) });
    console.log(`Wrote release/covers/${fileName}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
