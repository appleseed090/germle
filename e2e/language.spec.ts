import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const PAGES = ['/', '/?puzzle=1', '/practice?seed=language', '/archive', '/about'];

/** Fails the test on any uncaught page error, such as a shell translation that does not fit. */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function closeOpenDialogs(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const dialog of document.querySelectorAll('dialog[open]'))
      (dialog as HTMLDialogElement).close();
  });
}

for (const { locale, language, howToPlay, archiveLink, phase } of [
  {
    locale: 'zh-CN',
    language: 'zh-Hans',
    howToPlay: '玩法说明',
    archiveLink: '往期谜题',
    phase: '接种',
  },
  {
    locale: 'zh-TW',
    language: 'zh-Hant',
    howToPlay: '玩法說明',
    archiveLink: '過往謎題',
    phase: '接種',
  },
]) {
  test.describe(`a browser set to ${locale}`, () => {
    test.use({ locale });

    test(`shows every page in ${language}`, async ({ page }) => {
      const errors = collectPageErrors(page);
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await expect(page.locator('html')).not.toHaveAttribute('data-translating');
        await expect(page.locator('body')).toBeVisible();
      }

      await page.goto('/');
      await expect(page.getByRole('heading', { name: howToPlay })).toBeVisible();
      await expect(page.locator('.dialog-footnote a[href="/archive"]').first()).toHaveText(
        archiveLink,
      );
      await expect(page.locator('#verdict-rule strong')).toHaveCount(2);
      await closeOpenDialogs(page);
      await expect(page.locator('#phase-label')).toHaveText(phase);
      await expect(page.getByRole('button', { name: howToPlay })).toBeVisible();

      await page.goto('/?puzzle=1');
      await expect(page.locator('#archive-banner a[href="/archive"]')).toHaveText(archiveLink);
      await expect(page.locator('#archive-date')).toHaveText(/2026年10月4日/);
      expect(errors).toEqual([]);
    });
  });
}

test('the globe button switches the language and remembers it on every page', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await closeOpenDialogs(page);
  await page.getByRole('button', { name: 'Language' }).click();
  const options = page.locator('#language-dialog .language-option');
  await expect(options).toHaveText(['English', '简体中文', '繁體中文']);
  await expect(options.first()).toHaveAttribute('aria-current', 'true');
  await expect(options.first()).toBeFocused();

  await options.nth(2).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.getByRole('button', { name: '玩法說明' })).toBeVisible();
  await expect(page.locator('#phase-label')).toHaveText('接種');
  await page.goto('/archive');
  await expect(page.locator('h1')).toHaveText('過往謎題');

  await page.getByRole('button', { name: '語言' }).click();
  await expect(options.nth(2)).toHaveAttribute('aria-current', 'true');
  await options.first().click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('Archive');
  expect(errors).toEqual([]);
});

test('picking the language already shown only closes the menu', async ({ page }) => {
  await page.goto('/about');
  await page.getByRole('button', { name: 'Language' }).click();
  await page.locator('#language-dialog .language-option').first().click();
  await expect(page.locator('#language-dialog')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test.describe('a Chinese browser whose page scripts fail to load', () => {
  test.use({ locale: 'zh-CN' });

  test('still shows the page, in English, instead of a blank screen', async ({ page }) => {
    await page.route(/\/assets\/(?!before-paint-).*\.js$/, (route) => route.abort());
    await page.goto('/about');
    await expect(page.locator('html')).toHaveAttribute('data-translating');
    await expect(page.getByRole('heading', { name: 'About Germle' })).toBeVisible({
      timeout: 3000,
    });
  });
});
