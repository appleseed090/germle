import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCrazyGamesPlatform } from './crazygames';

type AdCallbacks = {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
};

/** A stand-in for the CrazyGames SDK v3 that records calls and plays ads as told. */
function createFakeSdk(options: {
  environment?: string;
  initFails?: boolean;
  ad?: (callbacks: AdCallbacks) => void;
  adblock?: boolean;
  dataThrows?: boolean;
  muteAudio?: boolean;
}) {
  const calls: string[] = [];
  const stored = new Map<string, string>();
  let settingsListener: ((settings: { muteAudio?: boolean }) => void) | undefined;
  const sdk = {
    environment: options.environment ?? 'crazygames',
    init: () => (options.initFails === true ? Promise.reject(new Error('no')) : Promise.resolve()),
    ad: {
      hasAdblock: () => Promise.resolve(options.adblock === true),
      requestAd: (type: string, callbacks: AdCallbacks) => {
        calls.push(`requestAd:${type}`);
        options.ad?.(callbacks);
      },
    },
    game: {
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      happytime: () => calls.push('happytime'),
      settings: { muteAudio: options.muteAudio ?? false },
      addSettingsChangeListener: (listener: (settings: { muteAudio?: boolean }) => void) => {
        settingsListener = listener;
      },
    },
    data: {
      getItem: (key: string) => {
        if (options.dataThrows === true) throw new Error('Progress Save is off');
        return stored.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (options.dataThrows === true) throw new Error('Progress Save is off');
        stored.set(key, value);
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    },
  };
  // Like the real SDK v3, every module throws until `init` has resolved.
  let initialised = false;
  const guarded = {
    get environment() {
      return initialised ? sdk.environment : 'uninitialized';
    },
    init: async () => {
      await sdk.init();
      initialised = true;
    },
    get ad() {
      if (!initialised) throw new Error('CrazySDK is not initialized yet');
      return sdk.ad;
    },
    get game() {
      if (!initialised) throw new Error('CrazySDK is not initialized yet');
      return sdk.game;
    },
    get data() {
      if (!initialised) throw new Error('CrazySDK is not initialized yet');
      return sdk.data;
    },
  };
  return {
    sdk: guarded,
    calls,
    stored,
    changeSettings: (settings: { muteAudio?: boolean }) => settingsListener?.(settings),
  };
}

describe('the CrazyGames platform', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes gameplay and loading events to the SDK', async () => {
    const fake = createFakeSdk({});
    const platform = await createCrazyGamesPlatform(fake.sdk);
    platform.ads.loadingStart();
    platform.ads.loadingStop();
    platform.ads.gameplayStart();
    platform.ads.gameplayStop();
    platform.ads.happyTime();
    expect(fake.calls).toEqual([
      'loadingStart',
      'loadingStop',
      'gameplayStart',
      'gameplayStop',
      'happytime',
    ]);
  });

  it('rewards a rewarded ad only when it finishes, telling the game when it starts', async () => {
    const finishing = createFakeSdk({
      ad: (callbacks) => {
        callbacks.adStarted?.();
        callbacks.adFinished?.();
      },
    });
    const onAdStarted = vi.fn();
    const platform = await createCrazyGamesPlatform(finishing.sdk);
    await expect(platform.ads.showRewardedAd({ onAdStarted })).resolves.toBe(true);
    expect(onAdStarted).toHaveBeenCalledOnce();
    expect(finishing.calls).toEqual(['requestAd:rewarded']);

    const failing = createFakeSdk({ ad: (callbacks) => callbacks.adError?.({ code: 'unfilled' }) });
    const failingPlatform = await createCrazyGamesPlatform(failing.sdk);
    await expect(failingPlatform.ads.showRewardedAd({ onAdStarted })).resolves.toBe(false);
  });

  it('treats an ad that never starts as failed, and a throwing SDK as no ad', async () => {
    const silent = await createCrazyGamesPlatform(createFakeSdk({ ad: () => undefined }).sdk);
    const pending = silent.ads.showRewardedAd({ onAdStarted: () => undefined });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toBe(false);

    const throwing = await createCrazyGamesPlatform(
      createFakeSdk({
        ad: () => {
          throw new Error('boom');
        },
      }).sdk,
    );
    await expect(throwing.ads.showMidgameAd({ onAdStarted: () => undefined })).resolves.toBe(
      undefined,
    );
  });

  it('hides rewarded offers once ads are off, but not after an ad that merely went unfilled', async () => {
    const unfilled = await createCrazyGamesPlatform(
      createFakeSdk({ ad: (callbacks) => callbacks.adError?.({ code: 'unfilled' }) }).sdk,
    );
    await unfilled.ads.showRewardedAd({ onAdStarted: () => undefined });
    expect(unfilled.ads.rewardedAdsAvailable()).toBe(true);

    for (const code of ['adblock', 'adsDisabledBasicLaunch']) {
      const off = await createCrazyGamesPlatform(
        createFakeSdk({ ad: (callbacks) => callbacks.adError?.({ code }) }).sdk,
      );
      expect(off.ads.rewardedAdsAvailable()).toBe(true);
      await off.ads.showRewardedAd({ onAdStarted: () => undefined });
      expect(off.ads.rewardedAdsAvailable()).toBe(false);
    }

    const blocked = await createCrazyGamesPlatform(createFakeSdk({ adblock: true }).sdk);
    await vi.advanceTimersByTimeAsync(0);
    expect(blocked.ads.rewardedAdsAvailable()).toBe(false);
  });

  it('saves through the Data module, and keeps the session going if it refuses', async () => {
    const fake = createFakeSdk({});
    const platform = await createCrazyGamesPlatform(fake.sdk);
    platform.saves.setItem('save', '{"a":1}');
    expect(fake.stored.get('save')).toBe('{"a":1}');
    expect(platform.saves.getItem('save')).toBe('{"a":1}');

    const refusing = await createCrazyGamesPlatform(createFakeSdk({ dataThrows: true }).sdk);
    refusing.saves.setItem('save', 'x');
    expect(refusing.saves.getItem('save')).toBe('x');
  });

  it("follows the portal's mute setting", async () => {
    const fake = createFakeSdk({ muteAudio: true });
    const platform = await createCrazyGamesPlatform(fake.sdk);
    expect(platform.isAudioMutedByPortal()).toBe(true);
    const listener = vi.fn();
    platform.onPortalMuteChange(listener);
    fake.changeSettings({ muteAudio: false });
    expect(listener).toHaveBeenCalledWith(false);
  });

  it.each([
    ['missing', undefined],
    ['not an SDK', { init: 'no' }],
  ])('runs offline when the SDK is %s', async (_, candidate) => {
    const platform = await createCrazyGamesPlatform(candidate);
    await expect(platform.ads.showRewardedAd({ onAdStarted: () => undefined })).resolves.toBe(
      false,
    );
    expect(platform.ads.rewardedAdsAvailable()).toBe(false);
    platform.saves.setItem('k', 'v');
    expect(platform.saves.getItem('k')).toBe('v');
    expect(platform.leaderboard.available).toBe(false);
  });

  it('never reads the SDK before init resolves, as the real SDK throws until then', async () => {
    const fake = createFakeSdk({});
    const platform = await createCrazyGamesPlatform(fake.sdk);
    platform.ads.gameplayStart();
    expect(fake.calls).toEqual(['gameplayStart']);
  });

  it('runs offline when init fails or the environment is disabled', async () => {
    for (const fake of [
      createFakeSdk({ initFails: true }),
      createFakeSdk({ environment: 'disabled' }),
    ]) {
      const platform = await createCrazyGamesPlatform(fake.sdk);
      platform.ads.gameplayStart();
      platform.saves.setItem('k', 'v');
      expect(fake.calls).toEqual([]);
      expect(fake.stored.size).toBe(0);
    }
  });
});
