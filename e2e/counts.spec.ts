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
  await page.addInitScript(() => {
    localStorage.setItem('germle.v1.settings', JSON.stringify({ showContactCounts: true }));
  });
  await page.goto(
    '/practice?people=30&neighbours=4&vaccines=2&outbreaks=1&refusers=2&contagion=40&seed=counts',
  );
  await expect(page.locator('.node-cross:visible, .node-core:visible')).toHaveCount(0);
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

test('refusers carry a cross while vaccinating and infected people a dot, until Settings shows numbers', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/practice?people=30&neighbours=4&vaccines=2&outbreaks=2&refusers=4&contagion=35&seed=marks',
  );
  const crosses = page.locator('.node-cross:visible');
  const refusers = page.locator('.node--refuser');
  await expect(refusers).toHaveCount(4);
  await expect(crosses).toHaveCount(4);
  await expect(refusers.first()).toHaveAttribute('aria-label', /, refuses vaccines, /);
  const refuserIds = await refusers.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-node-id')),
  );

  // Spending the last vaccine starts the outbreak: refusing no longer matters, so the
  // refusers look and read like anyone healthy.
  for (let vaccine = 0; vaccine < 2; vaccine++) {
    await page.locator('.node[data-tappable="true"]').first().click();
    await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  }
  await expect(page.locator('#phase-label')).not.toHaveAttribute('data-phase', 'vaccinate');
  await expect(refusers).toHaveCount(0);
  await expect(crosses).toHaveCount(0);
  const healthyFill = await page
    .locator('.node[data-status="susceptible"] .node-disc')
    .first()
    .evaluate((disc) => getComputedStyle(disc).fill);
  let healthyFormerRefusers = 0;
  for (const id of refuserIds) {
    const formerRefuser = page.locator(`.node[data-node-id="${id ?? ''}"]`);
    if ((await formerRefuser.getAttribute('data-status')) !== 'susceptible') continue;
    healthyFormerRefusers++;
    await expect(formerRefuser).not.toHaveAttribute('aria-label', /refuses vaccines/);
    expect(
      await formerRefuser.locator('.node-disc').evaluate((disc) => getComputedStyle(disc).fill),
    ).toBe(healthyFill);
  }
  expect(healthyFormerRefusers).toBeGreaterThan(0);
  const dots = page.locator('.node--infected .node-core');
  await expect(dots).not.toHaveCount(0);
  for (const dot of await dots.all()) await expect(dot).toBeVisible();
  const counts = page.locator('.node:not(.node--removed) .node-count');
  for (const count of await counts.all()) await expect(count).toBeHidden();

  const showNumbers = page.getByRole('checkbox', { name: 'Show contact numbers' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(showNumbers).not.toBeChecked();
  await showNumbers.check();
  await expect(page.locator('.node-cross:visible, .node-core:visible')).toHaveCount(0);
  for (const count of await counts.all()) await expect(count).toBeVisible();

  // Reloading restarts the practice game from its link, so all 30 people are back, vaccinating.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-contact-counts', 'shown');
  await expect(page.locator('.node-count:visible')).toHaveCount(30);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(showNumbers).toBeChecked();
  await showNumbers.uncheck();
  await expect(page.locator('.node-count:visible')).toHaveCount(0);
  await expect(crosses).toHaveCount(4);
});

test('refusers fade to healthy over 0.6 s, and at once with Skip animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/practice?refusers=4&seed=fade');
  const discFade = () =>
    page
      .locator('.node-disc')
      .first()
      .evaluate((disc) => getComputedStyle(disc).transitionDuration);
  expect(await discFade()).toBe('0.6s');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Skip animations' }).check();
  expect(await discFade()).toBe('0s');
});
