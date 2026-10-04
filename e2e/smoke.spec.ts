import { expect, test, type Page } from '@playwright/test';

const SHARE_FIRST_LINE = /^Germle #\d+ · \d+% saved · par \d+%$/m;

async function tapFirstTappablePerson(page: Page): Promise<void> {
  await page.locator('.node[data-tappable="true"]').first().click();
  await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
}

test('plays a full daily game, shares the result and restores it on reload', async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === 'chromium')
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await page.getByRole('button', { name: 'Start playing' }).click();
  await expect(page.locator('#phase-label')).toHaveText('Vaccinate');
  await expect(page.locator('.node')).toHaveCount(40);

  for (let vaccine = 0; vaccine < 4; vaccine++) await tapFirstTappablePerson(page);
  await expect(page.locator('#phase-label')).toHaveText('Quarantine');
  await expect(page.locator('.node[data-status="infected"]')).not.toHaveCount(0);

  const resultsDialog = page.locator('#results-dialog');
  for (
    let move = 0;
    move < 40 && !(await resultsDialog.evaluate((dialog: HTMLDialogElement) => dialog.open));
    move++
  ) {
    if ((await page.locator('#phase-label').textContent()) === 'Contained') break;
    await tapFirstTappablePerson(page);
  }
  await expect(resultsDialog).toBeVisible();
  await expect(page.locator('#phase-label')).toHaveText('Contained');
  await expect(page.locator('#result-par')).toHaveText(/^Par \d+% · /);

  const preview = (await page.locator('#share-preview').textContent()) ?? '';
  expect(preview).toMatch(SHARE_FIRST_LINE);
  expect(preview.split('\n')).toHaveLength(3);

  await page.getByRole('button', { name: 'Share' }).click();
  if (browserName === 'chromium' && !(await page.evaluate(() => 'share' in navigator))) {
    await expect(page.locator('#toast')).toHaveText('Copied to clipboard');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(preview);
  }

  await page.reload();
  await expect(resultsDialog).toBeVisible();
  await expect(page.locator('#share-preview')).toHaveText(preview);
  await expect(page.locator('#stat-played')).toHaveText('1');
});

test('the about page credits the inspiration and states the privacy policy', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'About Germle' })).toBeVisible();
  await expect(
    page.getByText('inspired by Vax! (2014) by Ellsworth Campbell and Isaac Bromley'),
  ).toBeVisible();
  await expect(
    page.getByText('No accounts, no tracking in the game; progress is stored in your browser.'),
  ).toBeVisible();
});

test.describe('with a fixed clock', () => {
  test.use({ timezoneId: 'UTC' });

  test('numbers the puzzle from the launch date and announces the next one at midnight', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-10-10T23:59:50Z') });
    await page.goto('/');
    await expect(page.locator('#puzzle-label')).toHaveText('#7');
    await page.getByRole('button', { name: 'Start playing' }).click();
    await page.getByRole('button', { name: 'Results and statistics' }).click();
    await expect(page.locator('#result-pending')).toBeVisible();
    await expect(page.locator('#countdown')).toHaveText('00:00:10');
    await page.clock.fastForward('00:15');
    await expect(page.getByText('A new Germle is ready.')).toBeVisible();
  });
});
