import { expect, test as base, type Page } from '@playwright/test';
import { CRAZYGAMES_SDK_URL } from '../scripts/build-rules.ts';
import type { GameState } from '../src/engine/game';
import { applyTapWithRules, startGameWithRules } from '../src/engine/rules';
import { prepareLevel } from '../src/endless/levels';
import { judgeLevel, type RunState } from '../src/endless/run';
import { FRESH_SAVE, SAVE_KEY, parseSave, type EndlessSave } from '../src/endless/save';
import { chooseBotMove, playLevelWithBot as simulateLevel } from '../src/endless/simulation';
import type { UpgradeId } from '../src/endless/upgrades';

/** Where the fake SDK keeps the Data module's values in the page's own storage. */
const FAKE_DATA_PREFIX = 'fake-crazygames-data:';
/**
 * Set in the page's storage to make every fake ad fail: `unfilled` (no ad this time) or `adblock`
 * (ads are off for this player, which `hasAdblock` also reports).
 */
const FAKE_AD_MODE_KEY = 'fake-crazygames-ads';

/**
 * A stand-in for the CrazyGames SDK v3, served at the real SDK's URL. Like the real one, its
 * modules throw until `init` has resolved. It records every call in
 * `window.fakeCrazyGamesCalls`, keeps Data module values in the page's storage (so they survive a
 * reload, like the real module), and plays each ad for 400 ms or fails it, as the test asks.
 */
const FAKE_SDK = `(() => {
  const calls = (window.fakeCrazyGamesCalls = []);
  const record = (name) => () => { calls.push(name); };
  let initialised = false;
  const modules = {
    ad: {
      requestAd: (type, callbacks) => {
        calls.push('requestAd:' + type);
        const mode = localStorage.getItem('${FAKE_AD_MODE_KEY}');
        if (mode === 'unfilled' || mode === 'adblock') {
          setTimeout(() => callbacks.adError && callbacks.adError({ code: mode }), 50);
          return;
        }
        setTimeout(() => {
          calls.push('adStarted');
          callbacks.adStarted && callbacks.adStarted();
          setTimeout(() => { calls.push('adFinished'); callbacks.adFinished && callbacks.adFinished(); }, 400);
        }, 50);
      },
      hasAdblock: () => Promise.resolve(localStorage.getItem('${FAKE_AD_MODE_KEY}') === 'adblock'),
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
  };
  // Like the real SDK v3: every module throws until init has resolved.
  const guard = (name) => () => {
    if (!initialised) throw new Error('CrazySDK is not initialized yet');
    return modules[name];
  };
  window.CrazyGames = { SDK: {
    get environment() { return initialised ? 'crazygames' : 'uninitialized'; },
    init: () => { calls.push('init'); return Promise.resolve().then(() => { initialised = true; }); },
    get ad() { return guard('ad')(); },
    get game() { return guard('game')(); },
    get data() { return guard('data')(); },
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

/** Makes every later ad go unfilled, fail as blocked, or play to the end (`finish`). */
export async function setAdMode(
  page: Page,
  mode: 'unfilled' | 'adblock' | 'finish',
): Promise<void> {
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

/** Upgrades with which the bot passes most early levels. */
export const STRONG_PICKS: UpgradeId[] = ['double-shift', 'smaller-outbreak', 'extra-vaccine'];

/** A run in progress at `level`, as a save would hold it. */
export function runAt(level: number, overrides: Partial<RunState> = {}): RunState {
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
    levelMoves: [],
    levelUndosUsed: 0,
    ...overrides,
  };
}

/** The save of a player past the tutorial, with `run` under way (or none). */
export function returningPlayer(run: RunState | null): EndlessSave {
  return { ...FRESH_SAVE, runsFinished: 2, tutorialDone: true, run };
}

/** A run seed on which the bot passes `level` with `picks`, so a test can rely on a pass. */
export function seedTheBotPasses(level: number, picks: readonly UpgradeId[]): string {
  for (let index = 0; index < 500; index++) {
    const seed = `e2e${String(index).padStart(5, '0')}`;
    const prepared = prepareLevel(seed, level, picks);
    if (judgeLevel(prepared, simulateLevel(prepared)).passed) return seed;
  }
  throw new Error(`No seed where the bot passes level ${level}`);
}
