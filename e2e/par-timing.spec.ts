import { expect, test } from '@playwright/test';

/**
 * The par solver must finish in under 300 ms on a mid-range phone. This approximates one the way
 * Lighthouse's mobile preset does: Chromium with the CPU throttled 4×. It plays into the outbreak
 * on today's daily puzzle and on practice puzzles with the daily settings (same size, same solver
 * budget, different seeds), then reads the solver's User Timing measure.
 *
 * Playwright's fake clock replaces `performance`, so dates cannot be faked here; the practice
 * seeds provide the variety instead.
 */
const CPU_SLOWDOWN = 4;
const BUDGET_MILLISECONDS = 300;
const PAGES = [
  '/',
  ...['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'].map(
    (seed) => `/practice?seed=${seed}`,
  ),
];

test('solves par within budget on a throttled CPU', async ({
  browser,
  browserName,
  baseURL,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium' || testInfo.project.name !== 'phone',
    'Throttling needs Chromium; one project is enough',
  );
  const durations: number[] = [];
  for (const path of PAGES) {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      ...(baseURL === undefined ? {} : { baseURL }),
    });
    await context.addInitScript(() => {
      localStorage.setItem('germle.v1.seen-how-to-play', 'true');
    });
    const page = await context.newPage();
    await page.goto(path);
    for (let vaccine = 0; vaccine < 4; vaccine++) {
      await page.locator('.node[data-tappable="true"]').first().click();
    }
    await expect(page.locator('#phase-label')).toHaveText('Quarantine');
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
    const solveMeasure = await page.waitForFunction(
      () => performance.getEntriesByName('germle:par-solve')[0]?.duration,
    );
    durations.push(Number(await solveMeasure.jsonValue()));
    await context.close();
  }
  const summary = durations.map((milliseconds) => `${milliseconds.toFixed(0)} ms`).join(', ');
  testInfo.annotations.push({ type: `par solve at ${CPU_SLOWDOWN}x CPU`, description: summary });
  console.log(`par solve at ${CPU_SLOWDOWN}x CPU: ${summary}`);
  for (const duration of durations) expect(duration).toBeLessThan(BUDGET_MILLISECONDS);
});
