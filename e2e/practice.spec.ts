import { expect, test } from './fixtures';
import { expectVerdictToMatchScore } from './verdict';

test('plays a practice game from a link and offers a replay of the same seed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    '/practice?people=30&neighbours=4&vaccines=3&outbreaks=1&refusers=1&contagion=40&seed=smoke',
  );
  await expect(page.locator('#setup-dialog')).not.toBeVisible();
  await expect(page.locator('.node')).toHaveCount(30);
  await expect(page.locator('#counter')).toHaveText('3 vaccines left');

  const resultsDialog = page.locator('#results-dialog');
  for (
    let move = 0;
    move < 40 && (await page.locator('#phase-label').getAttribute('data-phase')) !== 'ended';
    move++
  ) {
    await page.locator('.node[data-tappable="true"]').first().click();
    await expect(page.locator('#board')).toHaveAttribute('data-animating', 'false');
  }
  await expect(resultsDialog).toBeVisible();
  await expectVerdictToMatchScore(page);
  await expect(page.locator('#practice-summary')).toHaveText(
    '30 people · 3 vaccines · 1 outbreak · 1 refuser · 40% contagious · seed smoke',
  );
  await expect(page.getByRole('link', { name: 'Play again' })).toHaveAttribute(
    'href',
    new URL(page.url()).pathname + new URL(page.url()).search,
  );
});

test('sanitises link parameters and starts a bare visit on the setup', async ({ page }) => {
  await page.goto('/practice?people=999&contagion=abc&seed=%3Cb%3E');
  await expect(page).toHaveURL(/people=80/);
  await expect(page).toHaveURL(/contagion=35/);
  await expect(page).toHaveURL(/seed=b(&|$)/);
  await page.goto('/practice');
  await expect(page.getByRole('heading', { name: 'Practice setup' })).toBeVisible();
  await page.locator('#setup-people').fill('25');
  await page.locator('#setup-seed').fill('Typed Seed');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(/people=25.*seed=typedseed/);
  await expect(page.locator('.node')).toHaveCount(25);
});

test('fills the setup from the Easy, Medium and Hard presets', async ({ page }) => {
  await page.goto('/practice');
  const difficulty = page.getByRole('radiogroup', { name: 'Difficulty' });
  const preset = (name: string) => difficulty.getByRole('radio', { name });
  await expect(preset('Medium')).toBeChecked();

  await preset('Hard').check();
  const hardValues = {
    people: '50',
    neighbours: '4',
    vaccines: '5',
    outbreaks: '3',
    refusers: '5',
    contagion: '35%',
  };
  for (const [field, value] of Object.entries(hardValues))
    await expect(page.locator(`#setup-${field}-value`)).toHaveText(value);

  await page.locator('#setup-vaccines').fill('6');
  for (const name of ['Easy', 'Medium', 'Hard']) await expect(preset(name)).not.toBeChecked();

  await preset('Easy').check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(
    /people=30&neighbours=4&vaccines=4&outbreaks=1&refusers=0&contagion=35&seed=/,
  );
  await expect(page.locator('.node')).toHaveCount(30);
  await page.getByRole('button', { name: 'Setup' }).click();
  await expect(preset('Easy')).toBeChecked();
});

test('explains every setup field on tap or keyboard, and to screen readers', async ({ page }) => {
  await page.goto('/practice');
  const setup = page.locator('#setup-dialog');
  for (const field of [
    'People',
    'Neighbors',
    'Vaccines',
    'Outbreaks',
    'Refusers',
    'Contagiousness',
    'Seed',
  ]) {
    await expect(setup.getByRole('button', { name: `About ${field}` })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }

  const contagionInfo = setup.getByRole('button', { name: 'About Contagiousness' });
  const contagionText = page.locator('#setup-contagion-info');
  await expect(contagionText).toBeHidden();
  await contagionInfo.click();
  await expect(contagionInfo).toHaveAttribute('aria-expanded', 'true');
  await expect(contagionText).toHaveText(
    'Each day, the chance the infection passes along each contact between an infected and a healthy person.',
  );
  await expect(contagionText.locator('strong')).toHaveText(
    'the chance the infection passes along each contact',
  );
  await contagionInfo.click();
  await expect(contagionText).toBeHidden();

  const seedInfo = setup.getByRole('button', { name: 'About Seed' });
  await seedInfo.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#setup-seed-info')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('#setup-seed-info')).toBeHidden();

  await expect(setup.getByRole('slider', { name: 'Neighbors' })).toHaveAccessibleDescription(
    'How many contacts each person starts with, on average.',
  );
  await expect(setup.getByRole('slider', { name: 'People' })).toHaveAccessibleDescription(
    'How many people are in the network.',
  );
  await expect(setup.getByRole('textbox', { name: 'Seed' })).toHaveAccessibleDescription(
    'Any word: the same seed and settings always make the same network and outbreak.',
  );
});
