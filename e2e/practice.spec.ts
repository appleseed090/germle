import { expect, test } from '@playwright/test';
import { expectVerdictToMatchScore } from './verdict';

test('plays a practice game from a link and offers a replay of the same seed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/practice?people=30&neighbours=4&vaccines=3&outbreaks=1&refusers=1&contagion=40&seed=smoke',
  );
  await expect(page.locator('#setup-dialog')).not.toBeVisible();
  await expect(page.locator('.node')).toHaveCount(30);
  await expect(page.locator('#counter')).toHaveText('3 vaccines left');

  const resultsDialog = page.locator('#results-dialog');
  for (
    let move = 0;
    move < 40 && (await page.locator('#phase-label').getAttribute('data-phase')) !== 'ended';
    move++
  ) {
    await page.locator('.node[data-tappable="true"]').first().click();
    await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  }
  await expect(resultsDialog).toBeVisible();
  await expectVerdictToMatchScore(page);
  await expect(page.locator('#practice-summary')).toHaveText(
    '30 people · 3 vaccines · 1 outbreak · 1 refuser · 40% contagious · seed smoke',
  );
  await expect(page.getByRole('link', { name: 'Play again' })).toHaveAttribute(
    'href',
    new URL(page.url()).pathname + new URL(page.url()).search,
  );
});

test('sanitises link parameters and starts a bare visit on the setup', async ({ page }) => {
  await page.goto('/practice?people=999&contagion=abc&seed=%3Cb%3E');
  await expect(page).toHaveURL(/people=80/);
  await expect(page).toHaveURL(/contagion=35/);
  await expect(page).toHaveURL(/seed=b(&|$)/);
  await page.goto('/practice');
  await expect(page.getByRole('heading', { name: 'Practice setup' })).toBeVisible();
  await page.locator('#setup-people').fill('25');
  await page.locator('#setup-seed').fill('Typed Seed');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(/people=25.*seed=typedseed/);
  await expect(page.locator('.node')).toHaveCount(25);
});
