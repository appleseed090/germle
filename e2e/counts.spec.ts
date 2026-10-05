import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

interface PersonOnBoard {
  readonly shownCount: number;
  readonly label: string;
  readonly tappable: boolean;
}

async function peopleOnBoard(page: Page): Promise<PersonOnBoard[]> {
  return page.locator('.node:not(.node--removed)').evaluateAll((nodes) =>
    nodes.map((node) => ({
      shownCount: Number(node.querySelector('.node-count')?.textContent),
      label: node.getAttribute('aria-label') ?? '',
      tappable: node.getAttribute('data-tappable') === 'true',
    })),
  );
}

function sumOfCounts(people: readonly PersonOnBoard[]): number {
  return people.reduce((sum, person) => sum + person.shownCount, 0);
}

function expectLabelsToMatchCounts(people: readonly PersonOnBoard[]): void {
  for (const { label, shownCount } of people)
    expect(label).toMatch(new RegExp(`, ${shownCount} contacts?$`));
}

test('shows live contact counts that only your moves change, and reads them out', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/practice?people=30&neighbours=4&vaccines=2&outbreaks=1&refusers=2&contagion=40&seed=counts',
  );
  await expect(page.locator('.node-cross, .node-core')).toHaveCount(0);
  let people = await peopleOnBoard(page);
  expectLabelsToMatchCounts(people);

  // Removing someone with c contacts removes c contacts: their own c and one from each neighbour.
  // Infections in the same move change no count, so the sum falls by exactly 2c every time.
  let movesThatAlsoInfected = 0;
  for (let move = 0; move < 6; move++) {
    if ((await page.locator('#phase-label').getAttribute('data-phase')) === 'ended') break;
    const tapped = people.findIndex((person) => person.tappable);
    const removedContacts = (people[tapped] as PersonOnBoard).shownCount;
    const infectedBefore = await page.locator('.node[data-status="infected"]').count();
    await page.locator('.node:not(.node--removed)').nth(tapped).click();
    await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
    const after = await peopleOnBoard(page);
    expect(sumOfCounts(after)).toBe(sumOfCounts(people) - 2 * removedContacts);
    expectLabelsToMatchCounts(after);
    if ((await page.locator('.node[data-status="infected"]').count()) > infectedBefore)
      movesThatAlsoInfected++;
    people = after;
  }
  expect(movesThatAlsoInfected).toBeGreaterThan(0);
});
