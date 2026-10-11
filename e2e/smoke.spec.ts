import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectOnOneLine } from './layout';
import { chooseFromMenu } from './menu';
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
    'Contained: 70% or more saved. Spread: below 70%.',
  );
  await expect(page.locator('.verdict-rule strong')).toHaveText(['Contained', 'Spread']);
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
  await expect(resultsDialog.getByRole('link', { name: 'Play past puzzles' })).toHaveAttribute(
    'href',
    '/archive',
  );

  const copied = await copyResult(page);
  const [firstLine, squares, link, ...extraLines] = copied.split('\n');
  expect(firstLine).toMatch(SHARE_FIRST_LINE);
  expect(firstLine).toContain(
    ` · ${(await page.locator('#result-score').textContent()) ?? ''} saved`,
  );
  expect(squares).toMatch(SHARE_SQUARES_LINE);
  expect(link).toBe('https://germle.com');
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
  await expect(page.getByRole('link', { name: 'Play it here!' })).toHaveAttribute(
    'href',
    'https://stemcodingohio.github.io/vaxgame/',
  );
  await expect(page.getByRole('link', { name: 'CC BY-SA 3.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by-sa/3.0/',
  );
  await expect(page.locator('.content-footer')).toHaveText('© 2026 Jonathan Liu');
  await expect(page.locator('.content h2:has-text("Privacy") ~ p')).toHaveText([
    "You don't need an account, and Germle never asks for your name. Your progress is stored in your browser, which also generates a random ID for Germle. That ID is not tied to your name or to any account.",
    "When you finish a daily puzzle, your moves are sent to Germle so it can check your score and compare it with everyone else's. Germle keeps only:",
    "If you clear this site's data in your browser, you get a new ID. Scores you have already sent are not deleted.",
  ]);
  await expect(page.locator('.content h2:has-text("Privacy") ~ ul li')).toHaveText([
    'the puzzle number',
    'the random ID generated by your browser',
    'your score',
    'the date and time Germle received your score',
  ]);
});

test('the menu closes on a tap outside it without tapping the person underneath', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start playing' }).click();
  const counter = page.locator('#counter');
  await expect(counter).toHaveText('4 vaccines left');
  const menuButton = page.getByRole('button', { name: 'Menu' });
  await menuButton.click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  const personBesideTheMenu = await page.evaluate(() => {
    const menuLeft = document.querySelector('#game-menu')?.getBoundingClientRect().left ?? 0;
    for (const person of document.querySelectorAll('.node[data-tappable="true"]')) {
      const { left, right, top, bottom } = person.getBoundingClientRect();
      if (right < menuLeft - 8) return { x: (left + right) / 2, y: (top + bottom) / 2 };
    }
    return undefined;
  });
  if (personBesideTheMenu === undefined) throw new Error('Every person is behind the menu.');
  await page.mouse.click(personBesideTheMenu.x, personBesideTheMenu.y);
  await expect(menu).toBeHidden();
  await expect(counter).toHaveText('4 vaccines left');

  await chooseFromMenu(page, 'Settings');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menuButton).toBeFocused();
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
    await chooseFromMenu(page, 'Results');
    await expect(page.locator('#result-pending')).toBeVisible();
    await expect(page.locator('#countdown')).toHaveText('00:00:10');
    await page.clock.fastForward('00:15');
    await expect(page.getByText('A new Germle is ready.')).toBeVisible();
  });
});

test.describe('on a short phone screen', () => {
  test.use({ viewport: { width: 375, height: 560 } });

  test('opens how to play at its top, with its heading focused and the legend in view', async ({
    page,
  }) => {
    await page.goto('/');
    const dialog = page.locator('#how-to-play-dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await expect(page.getByRole('heading', { name: 'How to play' })).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'How to play' })).toBeFocused();
    const legend = dialog.locator('.legend');
    await expect(legend).toHaveText('Healthy, refuses vaccines, infected.');
    await expect(legend).toBeInViewport({ ratio: 1 });
    const legendBottom = await legend.evaluate((element) => element.getBoundingClientRect().bottom);
    const stepsTop = await dialog
      .locator('.how-to-steps')
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(legendBottom).toBeLessThanOrEqual(stepsTop);
  });
});

test.describe('on a puzzle where focus moves on to a refuser', () => {
  // Puzzle #5: person 2 refuses vaccines, so after person 1 is vaccinated the focus lands on
  // someone Enter cannot vaccinate, and a keyboard player tabs past them.
  test.use({ timezoneId: 'UTC' });

  test('can be played with the keyboard alone', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#puzzle-label')).toHaveText('#5');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'How to play' })).not.toBeVisible();
    await page.locator('.node[data-tappable="true"]').first().focus();
    let tabsPastUntappable = 0;
    for (let vaccine = 0; vaccine < 4; vaccine++) {
      while ((await page.locator('.node:focus').getAttribute('data-tappable')) !== 'true') {
        await page.keyboard.press('Tab');
        tabsPastUntappable++;
      }
      await page.keyboard.press('Enter');
      await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
    }
    expect(tabsPastUntappable).toBeGreaterThan(0);
    await expect(page.locator('#phase-label')).toHaveText('Quarantine');
    await expect(page.locator('.node:focus')).toHaveCount(1);
  });
});

test.describe('on a 360 px phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('every page has one menu linking to today, the archive, practice and about, marking where you are', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('germle.v1.seen-how-to-play', 'true');
    });
    for (const [path, currentPage] of [
      ['/', "Today's puzzle"],
      ['/?puzzle=1', undefined],
      ['/practice?seed=header', 'Practice'],
      ['/archive', 'Archive'],
      ['/about', 'About'],
    ] as const) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
      await expect(page.getByRole('button', { name: 'Menu' })).toBeInViewport({ ratio: 1 });
      await page.getByRole('button', { name: 'Menu' }).click();
      const menu = page.getByRole('dialog', { name: 'Menu' });
      await expect(menu).toBeInViewport({ ratio: 1 });
      for (const [name, href] of [
        ["Today's puzzle", '/'],
        ['Archive', '/archive'],
        ['Practice', '/practice'],
        ['About', '/about'],
      ] as const)
        await expect(menu.getByRole('link', { name })).toHaveAttribute('href', href);
      const markedCurrent = menu.locator('[aria-current="page"]');
      if (currentPage === undefined) await expect(markedCurrent).toHaveCount(0);
      else await expect(markedCurrent).toHaveText(currentPage);
    }
    await page.goto('/?puzzle=1');
    await expectOnOneLine(page.locator('#archive-banner'));
    await expect(
      page.locator(
        'dialog:not(#game-menu) a[href="/practice"], dialog:not(#game-menu) a[href="/about"]',
      ),
    ).toHaveCount(0);
  });
});
