import { AD_BALANCE } from '../../endless/balance';
import { STRINGS } from '../strings';
import type { AdHooks, Platform } from './platform';

const SIMULATED_AD_MILLISECONDS = 2000;
const STORAGE_PREFIX = 'germle-endless-dev:';

/**
 * The platform for `npm run dev:portal`: ads are a two-second overlay, saves go to the dev
 * browser's storage, gameplay events are logged. Never part of the production build (Vite's
 * `import.meta.env.DEV` branch in `main.ts` drops it, and `scripts/check-builds.ts` fails if
 * browser storage appears in `dist-portal/`).
 *
 * Add `?ads=fail` to the dev URL to make every ad fail (the no-reward path), or `?ads=off` to play
 * as if ads were off for this player (an ad blocker or Basic Launch: no rewarded buttons).
 */
export function createLocalPlatform(): Platform {
  const adsMode = new URLSearchParams(window.location.search).get('ads');
  const adsFail = adsMode === 'fail';
  const adsOff = adsMode === 'off';
  let lastMidgameAt = -Infinity;

  const playSimulatedAd = (label: string, hooks: AdHooks): Promise<boolean> => {
    if (adsFail || adsOff) return Promise.resolve(false);
    hooks.onAdStarted();
    const overlay = document.createElement('div');
    overlay.className = 'simulated-ad';
    overlay.textContent = label;
    document.body.append(overlay);
    return new Promise((resolve) => {
      window.setTimeout(() => {
        overlay.remove();
        resolve(true);
      }, SIMULATED_AD_MILLISECONDS);
    });
  };

  const log = (event: string): void => {
    console.debug(`[local platform] ${event}`); // not-player-text
  };

  return {
    ads: {
      async showMidgameAd(hooks) {
        const now = performance.now();
        if (now - lastMidgameAt < AD_BALANCE.localMidgameCooldownSeconds * 1000) {
          log('midgame ad skipped (cooldown)'); // not-player-text
          return;
        }
        lastMidgameAt = now;
        await playSimulatedAd(STRINGS.ads.simulatedMidgame, hooks);
      },
      showRewardedAd: (hooks) => playSimulatedAd(STRINGS.ads.simulatedRewarded, hooks),
      rewardedAdsAvailable: () => !adsOff,
      gameplayStart: () => {
        log('gameplayStart');
      },
      gameplayStop: () => {
        log('gameplayStop');
      },
      loadingStart: () => {
        log('loadingStart');
      },
      loadingStop: () => {
        log('loadingStop');
      },
      happyTime: () => {
        log('happytime');
      },
    },
    saves: {
      getItem: (key) => {
        try {
          return window.localStorage.getItem(STORAGE_PREFIX + key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          window.localStorage.setItem(STORAGE_PREFIX + key, value);
        } catch {
          // Best effort, as the interface promises.
        }
      },
      removeItem: (key) => {
        try {
          window.localStorage.removeItem(STORAGE_PREFIX + key);
        } catch {
          // Best effort, as the interface promises.
        }
      },
    },
    leaderboard: {
      available: false,
      submitLevelsCleared: (levelsCleared) => {
        log(`leaderboard: ${levelsCleared} levels`);
      },
    },
    isAudioMutedByPortal: () => false,
    onPortalMuteChange: () => undefined,
  };
}
