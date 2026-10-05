import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const LIGHT_PAGE = 'rgb(247, 245, 240)';
const DARK_PAGE = 'rgb(22, 25, 29)';

async function pageBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function themeColorMedia(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'), (meta) => [
        meta.dataset['scheme'] ?? '',
        meta.media,
      ]),
    ),
  );
}

async function chooseTheme(page: Page, theme: 'System' | 'Light' | 'Dark'): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: theme }).check();
  await page.locator('#settings-dialog').getByRole('button', { name: 'Close' }).click();
}

test('follows the device colour scheme until a theme is chosen', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await pageBackground(page)).toBe(DARK_PAGE);
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await pageBackground(page)).toBe(LIGHT_PAGE);
  await page.getByRole('button', { name: 'Start playing' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Skip animations' })).toBeAttached();
  await expect(page.getByRole('checkbox', { name: 'Show contact numbers' })).toBeChecked();
});

test('applies a chosen theme at once, before the first paint on later visits, on every page', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start playing' }).click();
  await chooseTheme(page, 'Dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await pageBackground(page)).toBe(DARK_PAGE);
  expect(await themeColorMedia(page)).toEqual({ light: 'not all', dark: 'all' });

  // With the game's own scripts blocked, only the render-blocking theme script can apply it.
  await page.route(/\/assets\/(?!theme-).*\.js$/, (route) => route.abort());
  for (const path of ['/', '/practice?seed=theme', '/about']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await pageBackground(page)).toBe(DARK_PAGE);
    expect(await themeColorMedia(page)).toEqual({ light: 'not all', dark: 'all' });
  }
  await page.unroute(/\/assets\/(?!theme-).*\.js$/);

  await page.goto('/practice?seed=theme');
  await chooseTheme(page, 'System');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await pageBackground(page)).toBe(LIGHT_PAGE);
  expect(await themeColorMedia(page)).toEqual({
    light: '(prefers-color-scheme: light)',
    dark: '(prefers-color-scheme: dark)',
  });
  await page.reload();
  expect(await pageBackground(page)).toBe(LIGHT_PAGE);
});

test('a chosen light theme overrides a dark device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/practice?seed=theme');
  await chooseTheme(page, 'Light');
  expect(await pageBackground(page)).toBe(LIGHT_PAGE);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await pageBackground(page)).toBe(LIGHT_PAGE);
  expect(await themeColorMedia(page)).toEqual({ light: 'all', dark: 'not all' });
});
