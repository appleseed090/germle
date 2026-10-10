import { expect, test } from './fixtures';
import { expectOnOneLine } from './layout';
import { chooseFromMenu } from './menu';
import { playToTheEnd } from './play';
import { expectVerdictToMatchScore } from './verdict';

// 10 October 2026 in UTC is puzzle #7.
test.use({ timezoneId: 'UTC' });
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('plays a past puzzle from the archive without touching daily stats', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/archive');
  const rows = page.locator('.archive-entry');
  await expect(rows).toHaveCount(7);
  await expect(rows.first()).toHaveText(/^#7Today/);
  await expect(rows.first()).toHaveAttribute('href', '/');
  await expect(rows.last()).toHaveText(/^#1.*Oct.*4.*2026Play$/);
  await expect(rows.last()).toHaveAttribute('href', '/?puzzle=1');

  await rows.filter({ hasText: '#3' }).click();
  await expect(page).toHaveURL(/\/\?puzzle=3$/);
  await expect(page.locator('#puzzle-label')).toHaveText('#3');
  const banner = page.locator('#archive-banner');
  await expect(banner.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive');
  await expect(banner.getByRole('link', { name: "Today's puzzle" })).toHaveAttribute('href', '/');
  await expect(page.locator('#archive-date')).toHaveText(/Oct.*6.*2026/);
  await expect(page.locator('#archive-date')).toHaveAttribute('datetime', '2026-10-06');
  await expectOnOneLine(banner);
  await page.getByRole('button', { name: 'Start playing' }).click();
  await playToTheEnd(page);

  const resultsDialog = page.locator('#results-dialog');
  await expect(resultsDialog).toBeVisible();
  await expect(page.locator('#results-title')).toHaveText('Germle #3');
  await expectVerdictToMatchScore(page);
  await expect(page.locator('#stats')).toBeHidden();
  await expect(page.locator('#countdown-line')).toBeHidden();
  await expect(page.locator('#archive-links')).toBeVisible();
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('#share-status')).toHaveText('Copied to clipboard');
  const [firstLine, , link] = (await page.evaluate(() => navigator.clipboard.readText())).split(
    '\n',
  );
  expect(firstLine).toMatch(/^Germle #3 · \d+% saved$/);
  expect(link).toBe('https://germle.com/?puzzle=3');
  const score = (await page.locator('#result-score').textContent()) ?? '';
  const verdict = (await page.locator('#result-verdict').textContent()) ?? '';

  await page.reload();
  await expect(resultsDialog).toBeVisible();
  await expect(page.locator('#result-score')).toHaveText(score);

  await page.goto('/');
  await expect(page.locator('#puzzle-label')).toHaveText('#7');
  await expect(page.locator('#archive-banner')).toBeHidden();
  await chooseFromMenu(page, 'Results');
  await expect(page.locator('#result-pending')).toHaveText(
    "Finish today's puzzle to see your score.",
  );
  await expect(page.locator('#stat-played')).toHaveText('0');
  await expect(page.locator('#stat-streak')).toHaveText('0');

  await page.goto('/archive');
  await expect(rows.filter({ hasText: '#3' })).toHaveText(new RegExp(`${score} ${verdict}$`));
});

test('marks unfinished games and sends bad or future links to today', async ({ page }) => {
  await page.goto('/?puzzle=2');
  await page.getByRole('button', { name: 'Start playing' }).click();
  await page.locator('.node[data-tappable="true"]').first().click();
  await page.goto('/archive');
  await expect(page.locator('.archive-entry').filter({ hasText: '#2' })).toHaveText(/In progress$/);

  for (const search of ['?puzzle=abc', '?puzzle=0', '?puzzle=7']) {
    await page.goto(`/${search}`);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#puzzle-label')).toHaveText('#7');
    await expect(page.locator('#archive-banner')).toBeHidden();
  }
  await page.goto('/?puzzle=8');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#toast')).toHaveText("Puzzle #8 isn't out yet. Here's today's.");
});
