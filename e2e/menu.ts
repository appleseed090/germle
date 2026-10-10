import type { Page } from '@playwright/test';

/** Opens the header menu and presses its button named `item` (Results, Setup, Settings…). */
export async function chooseFromMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: item }).click();
}
