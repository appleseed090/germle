import { expect, test as base, type Page } from '@playwright/test';
import { CRAZYGAMES_SDK_URL } from '../scripts/build-rules.ts';
import type { GameState } from '../src/engine/game';
import { applyTapWithRules, startGameWithRules } from '../src/engine/rules';
import { prepareLevel } from '../src/endless/levels';
import { SAVE_KEY, parseSave, type EndlessSave } from '../src/endless/save';
import { chooseBotMove } from '../src/endless/simulation';

/** Where the fake SDK keeps the Data module's values in the page's own storage. */
const FAKE_DATA_PREFIX = 'fake-crazygames-data:';
/** Set to `error` in the page's storage to make every fake ad fail. */
const FAKE_AD_MODE_KEY = 'fake-crazygames-ads';

/**
 * A stand-in for the CrazyGames SDK v3, served at the real SDK's URL. It records every call in
 * `window.fakeCrazyGamesCalls`, keeps Data module values in the page's storage (so they survive a
 * reload, like the real module), and plays each ad for 400 ms or fails it, as the test asks.
 */
const FAKE_SDK = `(() => {
  const calls = (window.fakeCrazyGamesCalls = []);
  const record = (name) => () => { calls.push(name); };
  window.CrazyGames = { SDK: {
    environment: 'crazygames',
    init: () => { calls.push('init'); return Promise.resolve(); },
    ad: {
      requestAd: (type, callbacks) => {
        calls.push('requestAd:' + type);
        if (localStorage.getItem('${FAKE_AD_MODE_KEY}') === 'error') {
          setTimeout(() => callbacks.adError && callbacks.adError({ code: 'unfilled' }), 50);
          return;
        }
        setTimeout(() => {
          calls.push('adStarted');
          callbacks.adStarted && callbacks.adStarted();
          setTimeout(() => { calls.push('adFinished'); callbacks.adFinished && callbacks.adFinished(); }, 400);
        }, 50);
      },
      hasAdblock: () => Promise.resolve(false),
    },
    game: {
      gameplayStart: record('gameplayStart'),
      gameplayStop: record('gameplayStop'),
      loadingStart: record('loadingStart'),
      loadingStop: record('loadingStop'),
      happytime: record('happytime'),
      settings: { muteAudio: false },
      addSettingsChangeListener: () => {},
    },
    data: {
      getItem: (key) => localStorage.getItem('${FAKE_DATA_PREFIX}' + key),
      setItem: (key, value) => { calls.push('data.setItem'); localStorage.setItem('${FAKE_DATA_PREFIX}' + key, value); },
      removeItem: (key) => localStorage.removeItem('${FAKE_DATA_PREFIX}' + key),
      clear: () => {},
    },
  } };
})();`;

/**
 * Playwright's `test` for the portal build: serves the fake SDK, and fails the test on any page
 * error or any request to another origin (the portal build must not reach other sites).
 */
export const test = base.extend<{ portalGuards: undefined }>({
  portalGuards: [
    async ({ page }, use) => {
      const problems: string[] = [];
      await page.route(CRAZYGAMES_SDK_URL, (route) =>
        route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }),
      );
      page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.hostname !== 'localhost' && request.url() !== CRAZYGAMES_SDK_URL)
          problems.push(`request to another site: ${request.url()}`);
      });
      await use(undefined);
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The calls the game made to the (fake) SDK so far, in order. */
export function sdkCalls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { fakeCrazyGamesCalls: string[] }).fakeCrazyGamesCalls,
  );
}

/** Makes every later ad fail (`error`) or play to the end (`finish`). */
export async function setAdMode(page: Page, mode: 'error' | 'finish'): Promise<void> {
  await page.evaluate(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [FAKE_AD_MODE_KEY, mode] as const,
  );
}

/** The save as the game last wrote it through the Data module. */
export async function readSave(page: Page): Promise<EndlessSave> {
  const text = await page.evaluate(
    (key) => localStorage.getItem(key),
    `${FAKE_DATA_PREFIX}${SAVE_KEY}`,
  );
  return parseSave(text).save;
}

/** Stores a save before the game loads, as if a previous session had written it. */
export async function seedSave(page: Page, save: EndlessSave): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('seeded') === null) {
        localStorage.setItem(key, value);
        sessionStorage.setItem('seeded', 'yes');
      }
    },
    [`${FAKE_DATA_PREFIX}${SAVE_KEY}`, JSON.stringify(save)] as const,
  );
}

/**
 * Plays the level on screen to its end with the simulator's bot, computing each move with the
 * game's own engine from the saved run (seed, level, upgrades) and tapping that person.
 *
 * @returns The final state, as the game also reached it.
 */
export async function playLevelWithBot(page: Page): Promise<GameState> {
  const run = (await readSave(page)).run;
  if (run === null) throw new Error('No run is saved');
  const prepared = prepareLevel(run.seed, run.level, run.picks);
  let state = startGameWithRules(prepared.puzzle, prepared.rules).state;
  while (state.phase !== 'ended') {
    const node = chooseBotMove(prepared, state);
    const board = page.locator('.portal-board:not(.portal-backdrop)');
    await expect(board).toHaveAttribute('data-animating', 'false');
    await board.locator(`.node[data-node-id="${node}"]`).click();
    state = applyTapWithRules(prepared.puzzle, prepared.rules, state, node).state;
  }
  return state;
}
