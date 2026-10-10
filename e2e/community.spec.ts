import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { chooseFromMenu } from './menu';
import { playToTheEnd } from './play';

// `vite preview` has no Worker, so every test answers /api/* itself.
// 10 October 2026 in UTC is puzzle #7.
test.use({ timezoneId: 'UTC' });
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const PLAYER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const STANDING = {
  players: 318,
  below: 229,
  best: 88,
  bestCount: 14,
  histogram: [2, 3, 10, 20, 31, 52, 60, 70, 56, 14],
  counted: true,
};

interface Submission {
  readonly puzzleNumber: number;
  readonly playerId: string;
  readonly moves: readonly number[];
}

/** Answers every submission with `answer` and records what was sent. */
async function answerSubmissions(
  page: Page,
  answer: (route: Route) => Promise<void>,
): Promise<Submission[]> {
  const submissions: Submission[] = [];
  await page.route('**/api/results', async (route) => {
    submissions.push(route.request().postDataJSON() as Submission);
    await answer(route);
  });
  return submissions;
}

/** Plays a game at `path` to the end; how to play only opens on a player's first visit. */
async function startAndFinish(page: Page, path: string, isFirstVisit = true): Promise<void> {
  await page.goto(path);
  if (isFirstVisit) await page.getByRole('button', { name: 'Start playing' }).click();
  await playToTheEnd(page);
  await expect(page.locator('#results-dialog')).toBeVisible();
}

async function expectShareToWork(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.locator('#share-status')).toHaveText('Copied to clipboard');
}

test('compares a finished game with everyone and refreshes the numbers on reopening', async ({
  page,
}) => {
  const submissions = await answerSubmissions(page, (route) => route.fulfill({ json: STANDING }));
  const standingRequests: string[] = [];
  await page.route('**/api/standing?*', async (route) => {
    standingRequests.push(route.request().url());
    await route.fulfill({
      json: {
        ...STANDING,
        players: 320,
        below: 230,
        histogram: [2, 3, 10, 20, 31, 52, 60, 72, 56, 14],
      },
    });
  });

  await startAndFinish(page, '/');
  const community = page.locator('#community');
  await expect(community).toBeVisible();
  await expect(community.getByRole('heading')).toHaveText("Everyone's scores");
  await expect(page.locator('#community-rank')).toHaveText('Better than 72% of 318 players');
  await expect(page.locator('#community-top-score')).toHaveText(
    'Top score so far: 88% · reached by 14 players',
  );
  const bands = page.locator('#community-chart .community-band');
  await expect(bands).toHaveCount(10);
  const score = Number.parseInt((await page.locator('#result-score').textContent()) ?? '', 10);
  const yourBand = bands.nth(Math.min(9, Math.floor(score / 10)));
  await expect(yourBand).toHaveClass(/community-band--yours/);
  await expect(yourBand.locator('.community-band-marker')).toHaveText('You');
  await expect(page.locator('.community-band--yours')).toHaveCount(1);
  await expect(bands.nth(7)).toContainText('70–79%: 70 players');

  expect(submissions).toHaveLength(1);
  const [submission] = submissions;
  expect(Object.keys(submission ?? {}).sort()).toEqual(['moves', 'playerId', 'puzzleNumber']);
  expect(submission?.puzzleNumber).toBe(7);
  expect(submission?.playerId).toMatch(PLAYER_ID_PATTERN);
  expect(submission?.moves.length).toBeGreaterThan(4);
  const playerId = await page.evaluate(() => localStorage.getItem('germle.v1.player-id'));
  expect(playerId).toBe(JSON.stringify(submission?.playerId));

  await page.reload();
  await expect(page.locator('#community-rank')).toHaveText('Better than 72% of 320 players');
  expect(standingRequests).toEqual([
    `http://localhost:4173/api/standing?puzzle=7&player=${submission?.playerId ?? ''}`,
  ]);
  expect(submissions).toHaveLength(1);

  await startAndFinish(page, '/?puzzle=3', false);
  await expect(page.locator('#community-rank')).toHaveText('Better than 72% of 318 players');
  expect(submissions.map(({ puzzleNumber, playerId }) => ({ puzzleNumber, playerId }))).toEqual([
    { puzzleNumber: 7, playerId: submission?.playerId },
    { puzzleNumber: 3, playerId: submission?.playerId },
  ]);
});

test('shows no comparison until 10 people have played', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const submissions = await answerSubmissions(page, (route) =>
    route.fulfill({
      json: {
        ...STANDING,
        players: 9,
        below: 4,
        bestCount: 1,
        histogram: [0, 0, 0, 0, 1, 2, 3, 2, 1, 0],
      },
    }),
  );
  await startAndFinish(page, '/');
  await expect.poll(() => submissions.length).toBe(1);
  await expect(page.locator('#result-score')).toBeVisible();
  await expect(page.locator('#community')).toBeHidden();
  await expectShareToWork(page);
});

test('keeps the results working when the API fails, and resends once it is back', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const failures: ((route: Route) => Promise<void>)[] = [
    (route) => route.abort('internetdisconnected'),
    (route) => route.fulfill({ status: 500, body: 'Internal error' }),
    (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }),
    (route) => route.fulfill({ json: { ...STANDING, players: 'lots' } }),
    (route) => route.fulfill({ json: { ...STANDING, histogram: [318] } }),
  ];
  let answer = failures[0];
  const submissions = await answerSubmissions(page, (route) =>
    (answer ?? ((working) => working.fulfill({ json: STANDING })))(route),
  );

  await startAndFinish(page, '/');
  await expect(page.locator('#result-score')).toBeVisible();
  for (const [index, failure] of failures.entries()) {
    answer = failure;
    if (index > 0) {
      await page.locator('#results-dialog').getByRole('button', { name: 'Close' }).click();
      await chooseFromMenu(page, 'Results');
    }
    await expect.poll(() => submissions.length).toBe(index + 1);
    await expect(page.locator('#community')).toBeHidden();
    await expectShareToWork(page);
  }

  answer = undefined;
  await page.locator('#results-dialog').getByRole('button', { name: 'Close' }).click();
  await chooseFromMenu(page, 'Results');
  await expect(page.locator('#community-rank')).toHaveText('Better than 72% of 318 players');
  expect(submissions).toHaveLength(failures.length + 1);
  expect(new Set(submissions.map((submission) => JSON.stringify(submission))).size).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('never sends a practice game', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/practice?seed=community');
  await playToTheEnd(page);
  await expect(page.locator('#results-dialog')).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('germle.v1.player-id'))).toBeNull();
});

test.describe('on a 360 px phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('reveals late numbers without moving Share or widening the page', async ({ page }) => {
    let releaseAnswer: () => void = () => undefined;
    const answerReleased = new Promise<void>((resolve) => {
      releaseAnswer = resolve;
    });
    await answerSubmissions(page, async (route) => {
      await answerReleased;
      await route.fulfill({
        json: {
          ...STANDING,
          players: 1318,
          below: 949,
          bestCount: 1,
          histogram: [2, 3, 10, 20, 31, 52, 60, 1070, 56, 14],
        },
      });
    });
    await startAndFinish(page, '/');
    const share = page.getByRole('button', { name: 'Share' });
    await expect(page.locator('#community')).toBeHidden();
    const shareBefore = await share.boundingBox();

    releaseAnswer();
    await expect(page.locator('#community-rank')).toHaveText('Better than 72% of 1,318 players');
    await expect(page.locator('#community-top-score')).toHaveText(
      'Top score so far: 88% · reached by 1 player',
    );
    expect(await share.boundingBox()).toEqual(shareBefore);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    const dialog = page.locator('#results-dialog');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const dialogBox = await dialog.boundingBox();
    for (const band of await page.locator('#community-chart .community-band').all()) {
      const box = await band.boundingBox();
      expect(box?.width).toBeGreaterThan(20);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        (dialogBox?.x ?? 0) + (dialogBox?.width ?? 0),
      );
    }
  });
});
