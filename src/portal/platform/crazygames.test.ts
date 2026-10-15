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
  return {
    sdk,
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
    platform.saves.setItem('k', 'v');
    expect(platform.saves.getItem('k')).toBe('v');
    expect(platform.leaderboard.available).toBe(false);
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
