/**
 * Records the two preview videos CrazyGames requires at submission (Requirements → Game covers →
 * Preview video): 1080p landscape (1920 × 1080) and 1080p portrait (1080 × 1620, 2:3), at most
 * 20 seconds, no sound, opening on the static cover.
 *
 * It serves the portal with the dev server (local platform, Basic Launch: no SDK, no ads), seeds
 * a save so the game opens on a mid-run level, and has the simulator's bot play it in real time
 * in Chromium while Playwright records; then ffmpeg puts a one-second still of the cover in front,
 * trims and encodes H.264 MP4s into `release/videos/`.
 *
 * Usage: `npm run videos:portal`. Needs `ffmpeg` (with libx264) on the PATH and the Playwright
 * Chromium the end-to-end tests use. Playwright records at real time with modest quality; if
 * the result looks soft, re-record with a screen recorder using the same seeded save.
 */
import { chromium, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, runnerImport } from 'vite';

const ROOT = new URL('..', import.meta.url).pathname;
const CONFIG_FILE = join(ROOT, 'vite.portal.config.ts');
const OUTPUT = join(ROOT, 'release', 'videos');
const COVER_SECONDS = 1;
const MAXIMUM_SECONDS = 19;
/** The dev platform's storage key for the save (`src/portal/platform/local.ts`). */
const DEV_SAVE_KEY = 'germle-endless-dev:germle-endless-save';
const LEVEL = 7;
const PICKS = ['contact-tracing', 'extra-vaccine', 'masks'] as const;

/**
 * The game is recorded at a common viewport (1280 × 720, or 720 × 1080 upright) and scaled 1.5×
 * to 1080p by ffmpeg, so text and people look as they do on a real screen rather than tiny on a
 * 1080p canvas. Playwright records at CSS-pixel size whatever the device scale, so the scaling
 * happens in ffmpeg; the cover still is a 1.5× screenshot and stays sharp.
 */
const SCALE = 1.5;
const FORMATS = [
  { name: 'landscape', width: 1920, height: 1080 },
  { name: 'portrait', width: 1080, height: 1620 },
] as const;

try {
  execFileSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore' });
} catch {
  console.error('ffmpeg is not on the PATH; install it (with libx264) and run again.');
  process.exit(1);
}

const load = async <Module>(path: string): Promise<Module> =>
  (await runnerImport<Module>(path, { root: ROOT, configFile: false, logLevel: 'error' })).module;
const levels = await load<typeof import('../src/endless/levels.ts')>('/src/endless/levels.ts');
const run = await load<typeof import('../src/endless/run.ts')>('/src/endless/run.ts');
const simulation = await load<typeof import('../src/endless/simulation.ts')>(
  '/src/endless/simulation.ts',
);
const rules = await load<typeof import('../src/engine/rules.ts')>('/src/engine/rules.ts');
const save = await load<typeof import('../src/endless/save.ts')>('/src/endless/save.ts');

/** A run seed on which the bot passes the level, so the video ends on a win. */
function seedTheBotPasses(): string {
  for (let index = 0; index < 500; index++) {
    const seed = `vid${String(index).padStart(5, '0')}`;
    const prepared = levels.prepareLevel(seed, LEVEL, PICKS);
    if (run.judgeLevel(prepared, simulation.playLevelWithBot(prepared)).passed) return seed;
  }
  throw new Error(`No seed where the bot passes level ${LEVEL}`);
}
const seed = seedTheBotPasses();
const seededSave = JSON.stringify({
  ...save.FRESH_SAVE,
  runsFinished: 3,
  tutorialDone: true,
  bestRun: { levelsCleared: 12, peopleSaved: 380 },
  settings: { sound: false, skipAnimations: false, showContactCounts: false },
  run: {
    ...run.startRun(seed, { startingPicks: PICKS, freeRerolls: 0 }),
    level: LEVEL,
    levelsCleared: LEVEL - 1,
    peopleSaved: 140,
  },
});

async function playLevel(page: Page): Promise<void> {
  const prepared = levels.prepareLevel(seed, LEVEL, PICKS);
  let state = rules.startGameWithRules(prepared.puzzle, prepared.rules).state;
  const board = page.locator('.portal-board:not(.portal-backdrop)');
  while (state.phase !== 'ended') {
    const node = simulation.chooseBotMove(prepared, state);
    await page.waitForFunction(
      () =>
        document
          .querySelector('.portal-board:not(.portal-backdrop)')
          ?.getAttribute('data-animating') === 'false',
    );
    await page.waitForTimeout(150);
    await board.locator(`.node[data-node-id="${node}"]`).click();
    state = rules.applyTapWithRules(prepared.puzzle, prepared.rules, state, node).state;
  }
}

const server = await createServer({
  configFile: CONFIG_FILE,
  logLevel: 'warn',
  server: { port: 0, strictPort: false },
});
await server.listen();
const address = server.resolvedUrls?.local[0];
if (address === undefined) throw new Error('The dev server has no local address');
mkdirSync(OUTPUT, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'germle-videos-'));
const browser = await chromium.launch();
try {
  for (const { name, width, height } of FORMATS) {
    const viewport = { width: width / SCALE, height: height / SCALE };
    const coverPage = await browser.newPage({
      viewport,
      deviceScaleFactor: SCALE,
      colorScheme: 'light',
    });
    await coverPage.goto(new URL('cover.html', address).href);
    await coverPage.locator('#cover[data-ready="true"] .node').first().waitFor();
    const coverPath = join(scratch, `${name}-cover.png`);
    await coverPage.screenshot({ path: coverPath });
    await coverPage.close();

    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: SCALE,
      colorScheme: 'light',
      recordVideo: { dir: scratch, size: viewport },
    });
    const recordingStarted = Date.now();
    const page = await context.newPage();
    await page.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key, value);
      },
      [DEV_SAVE_KEY, seededSave] as const,
    );
    // The dev server builds for Basic Launch, so no simulated ad break interrupts the video.
    await page.goto(address);
    await page.getByRole('button', { name: /Continue/ }).click();
    const gameplayStartsAt = (Date.now() - recordingStarted) / 1000;
    await page.waitForTimeout(1300);
    await playLevel(page);
    const toChoice = page.getByRole('button', { name: 'Choose an upgrade' });
    await toChoice.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1400);
    await toChoice.click();
    await page.waitForTimeout(1400);
    await page.locator('.upgrade-card').first().click();
    await page.waitForTimeout(1800);
    const video = page.video();
    await context.close();
    if (video === null) throw new Error('Playwright recorded no video');
    const recording = await video.path();

    const output = join(OUTPUT, `germle-endless-preview-${name}-${width}x${height}.mp4`);
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-loop',
        '1',
        '-t',
        String(COVER_SECONDS),
        '-i',
        coverPath,
        '-ss',
        gameplayStartsAt.toFixed(2),
        '-i',
        recording,
        '-filter_complex',
        `[0:v]scale=${width}:${height},fps=30,format=yuv420p,setsar=1[cover];` +
          `[1:v]scale=${width}:${height}:flags=lanczos,fps=30,format=yuv420p,setsar=1[game];` +
          '[cover][game]concat=n=2:v=1:a=0[out]',
        '-map',
        '[out]',
        '-t',
        String(MAXIMUM_SECONDS),
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '18',
        '-movflags',
        '+faststart',
        output,
      ],
      { stdio: 'inherit' },
    );
    console.log(`Wrote release/videos/${output.slice(OUTPUT.length + 1)}`);
  }
} finally {
  await browser.close();
  await server.close();
  rmSync(scratch, { recursive: true, force: true });
}
