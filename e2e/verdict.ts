import { expect, type Page } from '@playwright/test';

/**
 * Checks that the results dialog and the toolbar both show the verdict the score earns:
 * "Contained" at 70% saved or above, "Spread" below.
 */
export async function expectVerdictToMatchScore(page: Page): Promise<void> {
  const scoreText = (await page.locator('#result-score').textContent()) ?? '';
  expect(scoreText).toMatch(/^\d+%$/);
  const expectedVerdict = Number.parseInt(scoreText, 10) >= 70 ? 'Contained' : 'Spread';
  await expect(page.locator('#result-verdict')).toHaveText(expectedVerdict);
  await expect(page.locator('#phase-label')).toHaveText(expectedVerdict);
}
