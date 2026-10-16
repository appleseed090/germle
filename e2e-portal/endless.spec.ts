import { judgeLevel, type RunState } from '../src/endless/run';
import { prepareLevel } from '../src/endless/levels';
import { FRESH_SAVE, type EndlessSave } from '../src/endless/save';
import { playLevelWithBot as simulateLevel } from '../src/endless/simulation';
import type { UpgradeId } from '../src/endless/upgrades';
import {
  expect,
  playLevelWithBot,
  readSave,
  sdkCalls,
  seedSave,
  setAdMode,
  test,
} from './fixtures';

const STRONG_PICKS: UpgradeId[] = ['double-shift', 'smaller-outbreak', 'extra-vaccine'];

function runAt(level: number, overrides: Partial<RunState> = {}): RunState {
  return {
    seed: 'abcd1234',
    level,
    picks: STRONG_PICKS,
    levelsCleared: level - 1,
    peopleSaved: 40 * (level - 1),
    movesPlayed: 0,
    secondChanceUsed: false,
    rerollsThisOffer: 0,
    freeRerollsLeft: 0,
    phase: 'playing',
    lastResult: null,
    ...overrides,
  };
}

function returningPlayer(run: RunState | null): EndlessSave {
  return { ...FRESH_SAVE, runsFinished: 2, tutorialDone: true, run };
}

/** A run seed on which the bot passes `level` with `picks`, so a test can rely on a pass. */
function seedTheBotPasses(level: number, picks: readonly UpgradeId[]): string {
  for (let index = 0; index < 500; index++) {
    const seed = `e2e${String(index).padStart(5, '0')}`;
    const prepared = prepareLevel(seed, level, picks);
    if (judgeLevel(prepared, simulateLevel(prepared)).passed) return seed;
  }
  throw new Error(`No seed where the bot passes level ${level}`);
}

const board = '.portal-board:not(.portal-backdrop)';

test('a new player lands in level 1, clears it, picks an upgrade and resumes after a reload', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.portal-app')).toHaveAttribute('data-screen', 'level');
  await expect(page.locator('.hud-level')).toHaveText('Level 1');
  await expect(page.locator('.portal-hint')).toHaveText('Tap people to vaccinate them');

  const finalState = await playLevelWithBot(page);
  expect(finalState.phase).toBe('ended');
  await expect(page.getByRole('heading', { name: 'Contained!' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose an upgrade' }).click();

  await expect(page.getByRole('heading', { name: 'Choose an upgrade' })).toBeVisible();
  const cards = page.locator('.upgrade-card');
  await expect(cards).toHaveCount(3);
  const chosen = await cards.first().getAttribute('data-upgrade');
  await cards.first().click();
  await expect(page.locator('.hud-level')).toHaveText('Level 2');

  const saved = await readSave(page);
  expect(saved.run).toMatchObject({
    level: 2,
    levelsCleared: 1,
    phase: 'playing',
    picks: [chosen],
  });
  expect(saved.tutorialDone).toBe(true);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Continue · level 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue · level 2' }).click();
  await expect(page.locator('.hud-level')).toHaveText('Level 2');
  await expect(page.locator(`${board} .node`).first()).toBeVisible();
  await expect(page.locator('.portal-hint')).toBeHidden();

  const calls = await sdkCalls(page);
  expect(calls).toContain('loadingStart');
  expect(calls).toContain('loadingStop');
  expect(calls).toContain('gameplayStart');
  expect(calls).not.toContain('requestAd:midgame');
});

test('naturally immune people stay on the board as dashed outlines, cut off from the network', async ({
  page,
}) => {
  const picks: UpgradeId[] = ['natural-immunity', 'natural-immunity'];
  await seedSave(page, returningPlayer(runAt(5, { picks })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 5' }).click();
  await expect(page.locator('.portal-toast')).toHaveText(
    '2 people start immune: the dashed circles',
  );
  const immune = page.locator(`${board} .node--immune`);
  await expect(immune).toHaveCount(2);
  for (const person of await immune.all()) {
    await expect(person).toBeVisible();
    await expect(person).toHaveAttribute('data-status', 'vaccinated');
    await expect(person).toHaveAttribute('data-tappable', 'false');
    await expect(person.locator('.node-count')).toBeHidden();
  }
  await expect(page.locator(`${board} .node--removed:not(.node--immune)`)).toHaveCount(0);
});

test('a midgame ad plays at the break after level 3, blocking the game while it runs', async ({
  page,
}) => {
  const seed = seedTheBotPasses(3, STRONG_PICKS);
  await seedSave(page, returningPlayer(runAt(3, { seed })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 3' }).click();
  await playLevelWithBot(page);
  await expect(page.getByRole('heading', { name: 'Contained!' })).toBeVisible();
  const callsBeforeBreak = await sdkCalls(page);
  expect(callsBeforeBreak.at(-1)).not.toBe('gameplayStart');
  expect(callsBeforeBreak).toContain('gameplayStop');

  await page.getByRole('button', { name: 'Choose an upgrade' }).click();
  await expect(page.locator('.portal-app')).toHaveAttribute('data-ad', 'playing');
  await expect(page.locator('.portal-app')).toHaveJSProperty('inert', true);
  await expect(page.getByRole('heading', { name: 'Choose an upgrade' })).toBeVisible();
  await expect(page.locator('.portal-app')).toHaveAttribute('data-ad', 'none');
  const calls = await sdkCalls(page);
  const adIndex = calls.indexOf('requestAd:midgame');
  expect(adIndex).toBeGreaterThan(calls.lastIndexOf('gameplayStop'));
  expect(calls.slice(adIndex)).toEqual(['requestAd:midgame', 'adStarted', 'adFinished']);
});

test('a failed ad gives no second chance and no error; a watched one replays the level', async ({
  page,
}) => {
  const failedResult = {
    level: 4,
    counts: { vaccinated: 4, quarantined: 6, untouched: 4, infected: 7 },
    savedPercent: 67,
    passThresholdPercent: 70,
    passed: false,
    nearMiss: true,
    moves: 10,
  };
  await seedSave(page, returningPlayer(runAt(4, { phase: 'failed', lastResult: failedResult })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 4' }).click();
  await expect(page.getByRole('heading', { name: 'The outbreak spread' })).toBeVisible();
  await expect(page.getByText('So close: 3 points short')).toBeVisible();

  await setAdMode(page, 'unfilled');
  await page.getByRole('button', { name: 'Replay this level (watch a video)' }).click();
  await expect(page.getByText('No video available right now.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The outbreak spread' })).toBeVisible();
  expect((await readSave(page)).run).toMatchObject({ phase: 'failed', secondChanceUsed: false });

  await setAdMode(page, 'finish');
  await page.getByRole('button', { name: 'Replay this level (watch a video)' }).click();
  await expect(page.locator('.hud-level')).toHaveText('Level 4');
  expect((await readSave(page)).run).toMatchObject({ phase: 'playing', secondChanceUsed: true });
  expect(await sdkCalls(page)).not.toContain('requestAd:midgame');
});

test('with ads off for the player, no rewarded offer is shown at all', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fake-crazygames-ads', 'adblock');
  });
  const failedResult = {
    level: 4,
    counts: { vaccinated: 4, quarantined: 6, untouched: 4, infected: 7 },
    savedPercent: 50,
    passThresholdPercent: 70,
    passed: false,
    nearMiss: false,
    moves: 10,
  };
  await seedSave(page, returningPlayer(runAt(4, { phase: 'failed', lastResult: failedResult })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 4' }).click();
  await expect(page.getByRole('heading', { name: 'The outbreak spread' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End run' })).toBeVisible();
  await expect(page.locator('.rewarded-button')).toHaveCount(0);
});

test('rerolling the upgrade choice takes a watched video and draws a new offer', async ({
  page,
}) => {
  const passedResult = {
    level: 2,
    counts: { vaccinated: 3, quarantined: 4, untouched: 10, infected: 1 },
    savedPercent: 94,
    passThresholdPercent: 52,
    passed: true,
    nearMiss: false,
    moves: 7,
  };
  await seedSave(
    page,
    returningPlayer(
      runAt(2, { phase: 'choosing', levelsCleared: 2, picks: [], lastResult: passedResult }),
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 2' }).click();
  const offer = () =>
    page
      .locator('.upgrade-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-upgrade')));
  const before = await offer();
  await expect(page.locator('.rewarded-button .rewarded-icon')).toBeVisible();
  await page.getByRole('button', { name: 'Reroll (watch a video)' }).click();
  await expect.poll(offer).not.toEqual(before);
  expect((await readSave(page)).run?.rerollsThisOffer).toBe(1);
  expect(await sdkCalls(page)).toContain('requestAd:rewarded');
});

test('with every unlocked upgrade maxed, the choice points to Research and moves on', async ({
  page,
}) => {
  const everyStarterMaxed: UpgradeId[] = [
    ...Array<UpgradeId>(3).fill('extra-vaccine'),
    ...Array<UpgradeId>(2).fill('masks'),
    ...Array<UpgradeId>(2).fill('safety-margin'),
    ...Array<UpgradeId>(3).fill('natural-immunity'),
    'rapid-response',
    'outreach',
    'smaller-outbreak',
  ];
  await seedSave(
    page,
    returningPlayer(
      runAt(9, {
        phase: 'choosing',
        levelsCleared: 9,
        picks: everyStarterMaxed,
        lastResult: {
          level: 9,
          counts: { vaccinated: 8, quarantined: 6, untouched: 20, infected: 5 },
          savedPercent: 87,
          passThresholdPercent: 62,
          passed: true,
          nearMiss: false,
          moves: 14,
        },
      }),
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 9' }).click();
  await expect(
    page.getByText(
      'You have every upgrade you’ve unlocked. Spend Research between runs to unlock more.',
    ),
  ).toBeVisible();
  await expect(page.locator('.upgrade-card')).toHaveCount(0);
  await expect(page.locator('.rewarded-button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next level' }).click();
  await expect(page.locator('.hud-level')).toHaveText('Level 10');
});

test('ending a run banks Research, records the best run and returns home', async ({ page }) => {
  await seedSave(page, returningPlayer(runAt(6)));
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue · level 6' }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'End this run' }).click();
  await page.getByRole('button', { name: 'End run' }).click();
  await expect(page.getByRole('heading', { name: 'Run over' })).toBeVisible();
  await expect(page.getByText('5 levels cleared')).toBeVisible();
  await expect(page.getByText('New best run!')).toBeVisible();
  await expect(page.getByText('+60 Research')).toBeVisible();
  expect(await sdkCalls(page)).toContain('happytime');
  const saved = await readSave(page);
  expect(saved).toMatchObject({ research: 60, run: null, bestRun: { levelsCleared: 5 } });
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('text stays legible and nothing overflows the frame, down to an 800 × 450 iframe', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.hud-level')).toBeVisible();
  const measure = () =>
    page.evaluate(() => {
      let smallestFont = Infinity;
      for (const element of document.querySelectorAll<HTMLElement>('.portal-app *')) {
        if (element.closest('svg') !== null || element.offsetParent === null) continue;
        const hasText = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (hasText)
          smallestFont = Math.min(smallestFont, parseFloat(getComputedStyle(element).fontSize));
      }
      const root = document.documentElement;
      return {
        smallestFont,
        overflowX: root.scrollWidth - root.clientWidth,
        overflowY: root.scrollHeight - root.clientHeight,
      };
    });
  // 14 px stays readable at device pixel ratio 1 in CrazyGames' smallest 16:9 frame.
  for (const size of [page.viewportSize(), { width: 800, height: 450 }]) {
    if (size !== null) await page.setViewportSize(size);
    const { smallestFont, overflowX, overflowY } = await measure();
    expect(smallestFont).toBeGreaterThanOrEqual(14);
    expect(overflowX).toBe(0);
    expect(overflowY).toBe(0);
  }
});
