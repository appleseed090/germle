import { expect, type Locator } from '@playwright/test';

/** Checks that all the links in a line of text sit on the same line, so it has not wrapped. */
export async function expectOnOneLine(line: Locator): Promise<void> {
  const linkTops = await line
    .locator('a')
    .evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().top)));
  expect(linkTops.length).toBeGreaterThan(1);
  expect(new Set(linkTops).size).toBe(1);
}
