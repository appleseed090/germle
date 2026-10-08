import { expect, type Page } from '@playwright/test';

/** Taps the first tappable person until the game ends, waiting out each move's animation. */
export async function playToTheEnd(page: Page): Promise<void> {
  for (
    let move = 0;
    move < 60 && (await page.locator('#phase-label').getAttribute('data-phase')) !== 'ended';
    move++
  ) {
    await page.locator('.node[data-tappable="true"]').first().click();
    await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  }
}
