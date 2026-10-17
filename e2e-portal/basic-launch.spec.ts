import { BASIC_LAUNCH_URL } from '../playwright.portal.config';
import {
  STRONG_PICKS,
  expect,
  playLevelWithBot,
  returningPlayer,
  runAt,
  sdkCalls,
  seedSave,
  seedTheBotPasses,
  test,
} from './fixtures';

// The Basic Launch build (`dist-portal/`): CrazyGames disables ads then and rejects rewarded
// buttons without effect, so the game must never request an ad or offer one.
test.use({ baseURL: BASIC_LAUNCH_URL });

test('a failed level offers no rewarded replay and requests no ad', async ({ page }) => {
  const failedResult = {
    level: 4,
    counts: { vaccinated: 4, quarantined: 6, untouched: 4, infected: 7 },
    savedPercent: 67,
    passThresholdPercent: 70,
    passed: false,
    nearMiss: true,
    moves: 10,
  };
  await seedSave(page, returningPlayer(runAt(4, { phase: 'failed', lastResult: failedResult })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 4' }).click();
  await expect(page.getByRole('heading', { name: 'The outbreak spread' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End run' })).toBeVisible();
  await expect(page.locator('.rewarded-button')).toHaveCount(0);
  await expect(page.getByText('Videos are blocked by an ad blocker.')).toHaveCount(0);
});

test('passing a level past the third goes straight to the choice, with no ad and no reroll', async ({
  page,
}) => {
  const seed = seedTheBotPasses(3, STRONG_PICKS);
  await seedSave(page, returningPlayer(runAt(3, { seed })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 3' }).click();
  await playLevelWithBot(page);
  await page.getByRole('button', { name: 'Choose an upgrade' }).click();
  await expect(page.getByRole('heading', { name: 'Choose an upgrade' })).toBeVisible();
  await expect(page.locator('.portal-app')).toHaveAttribute('data-ad', 'none');
  await expect(page.locator('.upgrade-card')).toHaveCount(3);
  await expect(page.locator('.rewarded-button')).toHaveCount(0);
  const calls = await sdkCalls(page);
  expect(calls).toContain('gameplayStart');
  expect(calls).toContain('data.setItem');
  expect(calls.filter((call) => call.startsWith('requestAd'))).toEqual([]);
});
