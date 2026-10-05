import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectVerdictToMatchScore } from './verdict';

const SHARE_FIRST_LINE = /^Germle #\d+ · \d+% saved$/;
const SHARE_SQUARES_LINE = /^[🟦🟨⬜🟥]{10}$/u;

async function tapFirstTappablePerson(page: Page): Promise<void> {
  await page.locator('.node[data-tappable="true"]').first().click();
  await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
}

/** Clicks Share and returns what landed on the clipboard (the projects all run Chromium). */
async function copyResult(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('#share-status')).toHaveText('Copied to clipboard');
  await expect(page.locator('#share-status')).toBeInViewport();
  return page.evaluate(() => navigator.clipboard.readText());
}

test('plays a full daily game, copies the result and restores it on reload', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await expect(page.locator('.how-to-steps p')).toHaveText([
    'Tap people to vaccinate them. The outbreak starts when you have exhausted all vaccines.',
    'Once the outbreak starts, you can quarantine one person per day.',
    'The game ends when the outbreak has nowhere left to go. Save as many people as you can!',
  ]);
  await expect(page.locator('.verdict-rule')).toHaveText(
    'Save 70% or more and the outbreak is Contained; below that, it Spread.',
  );
  await expect(page.locator('#daily-constants')).toHaveText(
    'Every daily puzzle: 40 people · 4 vaccines · 2 outbreaks · 2 refusers · 35% contagious',
  );
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
    if ((await page.locator('#phase-label').getAttribute('data-phase')) === 'ended') break;
    await tapFirstTappablePerson(page);
  }
  await expect(resultsDialog).toBeVisible();
  await expect(page.locator('#phase-label')).toHaveAttribute('data-phase', 'ended');
  await expectVerdictToMatchScore(page);

  const copied = await copyResult(page);
  const [firstLine, squares, domain, ...extraLines] = copied.split('\n');
  expect(firstLine).toMatch(SHARE_FIRST_LINE);
  expect(firstLine).toContain(
    ` · ${(await page.locator('#result-score').textContent()) ?? ''} saved`,
  );
  expect(squares).toMatch(SHARE_SQUARES_LINE);
  expect(domain).toBe('germle.com');
  expect(extraLines).toEqual([]);

  await page.reload();
  await expect(resultsDialog).toBeVisible();
  await expect(page.locator('#stat-played')).toHaveText('1');
  expect(await copyResult(page)).toBe(copied);

  // Without a clipboard (an insecure context, an old browser) the text is shown, selected.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('#share-fallback-text')).toBeVisible();
  await expect(page.locator('#share-fallback-text')).toHaveValue(copied);
  await expect(page.locator('#share-fallback-text')).toBeFocused();
});

test('the about page credits the inspiration and states the privacy policy', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'About Germle' })).toBeVisible();
  await expect(page.locator('.content h2')).toHaveText(['Inspiration', 'Privacy']);
  await expect(
    page.getByText('inspired by Vax! (2014), created by Ellsworth Campbell and Isaac Bromley'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vax!' })).toHaveAttribute(
    'href',
    'https://github.com/digitalepidemiologylab/VaxGame',
  );
  await expect(page.getByRole('link', { name: 'CC BY-SA 3.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by-sa/3.0/',
  );
  await expect(page.locator('.content-footer')).toHaveText('© 2026 Jonathan Liu');
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

test.describe('on a short phone screen', () => {
  test.use({ viewport: { width: 375, height: 560 } });

  test('opens how to play at its top, with Start playing focused', async ({ page }) => {
    await page.goto('/');
    const dialog = page.locator('#how-to-play-dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await expect(page.getByRole('heading', { name: 'How to play' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Start playing' })).toBeFocused();
  });
});

test('can be played with the keyboard alone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'How to play' })).not.toBeVisible();
  await page.locator('.node[data-tappable="true"]').first().focus();
  for (let vaccine = 0; vaccine < 4; vaccine++) await page.keyboard.press('Enter');
  await expect(page.locator('#phase-label')).toHaveText('Quarantine');
  await expect(page.locator('.node:focus')).toHaveCount(1);
});
