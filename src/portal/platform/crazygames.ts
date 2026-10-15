import type { AdHooks, AdsPlatform, Platform, SavePlatform } from './platform';

/**
 * The CrazyGames HTML5 SDK v3, as far as Germle Endless uses it, hand-written from the docs and
 * checked against SDK 3.8.0. Every call is guarded: the SDK is external code that may be missing
 * (a blocked script), uninitialised (its modules throw until `init` resolves), or changed.
 */
interface CrazyGamesSdk {
  init(): Promise<void>;
  readonly environment: string;
  readonly ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (error: unknown) => void;
      },
    ): void;
    hasAdblock?(): Promise<boolean>;
  };
  readonly game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
    readonly settings?: { readonly muteAudio?: boolean };
    addSettingsChangeListener?(listener: (settings: { muteAudio?: boolean }) => void): void;
  };
  readonly data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

const INIT_TIMEOUT_MILLISECONDS = 8000;
/** An ad that has not started by now is treated as failed, so the game never hangs. */
const AD_START_TIMEOUT_MILLISECONDS = 15_000;

/**
 * Connects to the CrazyGames SDK that `portal/index.html` loads. If the SDK is missing, fails to
 * initialise, or reports the `disabled` environment (the game is hosted somewhere else), the game
 * still runs: ads report "unavailable", saves last only for the session and gameplay events are
 * dropped.
 *
 * @param sdkCandidate - `window.CrazyGames?.SDK`, untrusted: only `init` is read before it resolves
 *   (the real SDK throws on any other property until then), the methods used are checked after.
 */
export async function createCrazyGamesPlatform(sdkCandidate: unknown): Promise<Platform> {
  const initialise = initialiser(sdkCandidate);
  if (initialise === undefined) return offlinePlatform();
  try {
    await withTimeout(initialise(), INIT_TIMEOUT_MILLISECONDS);
  } catch {
    return offlinePlatform();
  }
  // The SDK's modules throw until `init` has resolved, so its shape is checked only now.
  const sdk = safely(() => asInitialisedSdk(sdkCandidate));
  if (sdk === undefined || safely(() => sdk.environment) === 'disabled') return offlinePlatform();

  const muteListeners: ((muted: boolean) => void)[] = [];
  safely(() => {
    sdk.game.addSettingsChangeListener?.((settings) => {
      for (const listener of muteListeners) listener(settings.muteAudio === true);
    });
  });

  return {
    ads: sdkAds(sdk),
    saves: sdkSaves(sdk),
    leaderboard: {
      // Invite-only on CrazyGames and needs an encryption key from the Developer Portal; see
      // TODO.md. Until then nothing is submitted and the game never mentions a leaderboard.
      available: false,
      submitLevelsCleared: () => undefined,
    },
    isAudioMutedByPortal: () => safely(() => sdk.game.settings?.muteAudio === true) ?? false,
    onPortalMuteChange: (listener) => {
      muteListeners.push(listener);
    },
  };
}

/** The SDK's `init`, bound to it, if the candidate has one; reading nothing else yet. */
function initialiser(candidate: unknown): (() => Promise<void>) | undefined {
  if (typeof candidate !== 'object' || candidate === null) return undefined;
  const init = safely(() => (candidate as { init?: unknown }).init);
  if (typeof init !== 'function') return undefined;
  return () => Promise.resolve((init as () => unknown).call(candidate)).then(() => undefined);
}

/**
 * The initialised SDK if it has the methods the game uses.
 *
 * @throws Whatever the SDK's getters throw; call through {@link safely}.
 */
function asInitialisedSdk(candidate: unknown): CrazyGamesSdk | undefined {
  const sdk = candidate as Partial<CrazyGamesSdk>;
  const looksUsable =
    typeof sdk.ad?.requestAd === 'function' &&
    typeof sdk.game?.gameplayStart === 'function' &&
    typeof sdk.data?.getItem === 'function';
  return looksUsable ? (sdk as CrazyGamesSdk) : undefined;
}

/** Ad error codes meaning no ad will ever play for this player in this session. */
const ADS_OFF_CODES: ReadonlySet<string> = new Set(['adblock', 'adsDisabledBasicLaunch']);

function adsAreOffFor(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && ADS_OFF_CODES.has(code);
}

function sdkAds(sdk: CrazyGamesSdk): AdsPlatform {
  let adsOff = false;
  void safely(() => sdk.ad.hasAdblock?.())
    ?.then((blocked) => {
      if (blocked) adsOff = true;
    })
    .catch(() => undefined);
  const requestAd = (type: 'midgame' | 'rewarded', hooks: AdHooks): Promise<boolean> =>
    new Promise((resolve) => {
      let settled = false;
      let started = false;
      const settle = (rewarded: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(rewarded);
      };
      globalThis.setTimeout(() => {
        if (!started) settle(false);
      }, AD_START_TIMEOUT_MILLISECONDS);
      const requested = safely(() => {
        sdk.ad.requestAd(type, {
          adStarted: () => {
            started = true;
            safely(hooks.onAdStarted);
          },
          adFinished: () => {
            settle(true);
          },
          adError: (error: unknown) => {
            if (adsAreOffFor(error)) adsOff = true;
            settle(false);
          },
        });
        return true;
      });
      if (requested !== true) settle(false);
    });
  const call = (action: () => void) => () => {
    safely(action);
  };
  return {
    showMidgameAd: async (hooks) => {
      await requestAd('midgame', hooks);
    },
    showRewardedAd: (hooks) => requestAd('rewarded', hooks),
    rewardedAdsAvailable: () => !adsOff,
    gameplayStart: call(() => {
      sdk.game.gameplayStart();
    }),
    gameplayStop: call(() => {
      sdk.game.gameplayStop();
    }),
    loadingStart: call(() => {
      sdk.game.loadingStart();
    }),
    loadingStop: call(() => {
      sdk.game.loadingStop();
    }),
    happyTime: call(() => {
      sdk.game.happytime();
    }),
  };
}

/**
 * The SDK Data module, the only save path in the portal build. If it throws (for example when
 * Progress Save is not enabled for the game), the session falls back to memory.
 */
function sdkSaves(sdk: CrazyGamesSdk): SavePlatform {
  const memory = memorySaves();
  return {
    getItem: (key) => {
      const value = safely(() => sdk.data.getItem(key));
      return value === undefined ? memory.getItem(key) : value;
    },
    setItem: (key, value) => {
      memory.setItem(key, value);
      safely(() => {
        sdk.data.setItem(key, value);
      });
    },
    removeItem: (key) => {
      memory.removeItem(key);
      safely(() => {
        sdk.data.removeItem(key);
      });
    },
  };
}

function memorySaves(): SavePlatform {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function offlinePlatform(): Platform {
  return {
    ads: {
      showMidgameAd: () => Promise.resolve(),
      showRewardedAd: () => Promise.resolve(false),
      rewardedAdsAvailable: () => false,
      gameplayStart: () => undefined,
      gameplayStop: () => undefined,
      loadingStart: () => undefined,
      loadingStop: () => undefined,
      happyTime: () => undefined,
    },
    saves: memorySaves(),
    leaderboard: { available: false, submitLevelsCleared: () => undefined },
    isAudioMutedByPortal: () => false,
    onPortalMuteChange: () => undefined,
  };
}

/** Runs a call into the SDK; anything it throws becomes `undefined`. */
function safely<Result>(action: () => Result): Result | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

function withTimeout<Value>(promise: Promise<Value>, milliseconds: number): Promise<Value> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      globalThis.setTimeout(() => {
        reject(new Error('timeout'));
      }, milliseconds);
    }),
  ]);
}
