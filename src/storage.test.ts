import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, createGameStorage, loadSettings, type KeyValueStore } from './storage';

function createMemoryStore(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const sampleResult = {
  score: 78,
  counts: { vaccinated: 4, quarantined: 7, untouched: 20, infected: 9 },
};

describe('createGameStorage', () => {
  it('round-trips settings, progress, results and the how-to-play flag', () => {
    const storage = createGameStorage(createMemoryStore());
    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    const settings = { reduceMotion: true, theme: 'dark', showContactCounts: true } as const;
    storage.saveSettings(settings);
    expect(storage.loadSettings()).toEqual(settings);

    expect(storage.loadDailyProgress()).toBeUndefined();
    storage.saveDailyProgress({ puzzleNumber: 3, moves: [1, 2, 3] });
    expect(storage.loadDailyProgress()).toEqual({ puzzleNumber: 3, moves: [1, 2, 3] });

    storage.saveResult(3, sampleResult);
    expect(storage.loadResults()).toEqual(new Map([[3, sampleResult]]));

    expect(storage.hasSeenHowToPlay()).toBe(false);
    storage.markHowToPlaySeen();
    expect(storage.hasSeenHowToPlay()).toBe(true);
  });

  it('loads results saved with the retired par field and drops it on the next save', () => {
    const store = createMemoryStore({
      'germle.v1.results': JSON.stringify({ '1': { ...sampleResult, par: 85 } }),
    });
    const storage = createGameStorage(store);
    expect(storage.loadResults()).toEqual(new Map([[1, sampleResult]]));
    storage.saveResult(2, sampleResult);
    expect(JSON.parse(store.data.get('germle.v1.results') ?? '')).toEqual({
      '1': sampleResult,
      '2': sampleResult,
    });
  });

  it('loads older settings as following the device theme, with contact numbers hidden', () => {
    const store = createMemoryStore({
      'germle.v1.settings': JSON.stringify({ reduceMotion: false }),
    });
    expect(createGameStorage(store).loadSettings()).toEqual({
      reduceMotion: false,
      theme: null,
      showContactCounts: false,
    });
  });

  it('loads settings saved with the retired size-by-contacts switch and drops it on the next save', () => {
    const store = createMemoryStore({
      'germle.v1.settings': JSON.stringify({
        sizeNodesByDegree: false,
        reduceMotion: true,
        theme: 'dark',
      }),
    });
    const storage = createGameStorage(store);
    const settings = storage.loadSettings();
    expect(settings).toEqual({ reduceMotion: true, theme: 'dark', showContactCounts: false });
    storage.saveSettings(settings);
    expect(JSON.parse(store.data.get('germle.v1.settings') ?? '')).toEqual({
      reduceMotion: true,
      theme: 'dark',
      showContactCounts: false,
    });
  });

  it('reads settings on their own exactly as the full storage does', () => {
    const store = createMemoryStore({
      'germle.v1.settings': JSON.stringify({ theme: 'light' }),
    });
    expect(loadSettings(store)).toEqual({
      reduceMotion: null,
      theme: 'light',
      showContactCounts: false,
    });
    expect(loadSettings(store)).toEqual(createGameStorage(store).loadSettings());
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('never overwrites a recorded result', () => {
    const storage = createGameStorage(createMemoryStore());
    storage.saveResult(3, sampleResult);
    storage.saveResult(3, { ...sampleResult, score: 100 });
    expect(storage.loadResults().get(3)?.score).toBe(78);
  });

  it('ignores malformed stored values', () => {
    const storage = createGameStorage(
      createMemoryStore({
        'germle.v1.settings': '{"reduceMotion":1,"theme":"sepia","showContactCounts":"no"}',
        'germle.v1.daily-progress': '{"puzzleNumber":3,"moves":[1,"2"]}',
        'germle.v1.results': JSON.stringify({
          '1': sampleResult,
          '2': { score: 101, counts: sampleResult.counts },
          '3': { score: 50 },
          zero: sampleResult,
          '0': sampleResult,
        }),
        'germle.v1.seen-how-to-play': 'not json',
      }),
    );
    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(storage.loadDailyProgress()).toBeUndefined();
    expect([...storage.loadResults().keys()]).toEqual([1]);
    expect(storage.hasSeenHowToPlay()).toBe(false);
  });

  it('keeps archive games apart from daily results and progress', () => {
    const store = createMemoryStore();
    const storage = createGameStorage(store);
    storage.saveArchiveProgress(2, [5, 9]);
    storage.saveArchiveProgress(1, [3]);
    storage.saveArchiveProgress(2, [5, 9, 11]);
    storage.saveArchiveResult(2, sampleResult);
    storage.saveArchiveResult(2, { ...sampleResult, score: 100 });
    expect(storage.loadArchiveProgress()).toEqual(
      new Map([
        [2, [5, 9, 11]],
        [1, [3]],
      ]),
    );
    expect(storage.loadArchiveResults().get(2)?.score).toBe(78);
    expect(storage.loadResults().size).toBe(0);
    expect(storage.loadDailyProgress()).toBeUndefined();
    expect([...store.data.keys()].sort()).toEqual([
      'germle.v1.archive-progress',
      'germle.v1.archive-results',
    ]);
  });

  it('ignores malformed archive entries one by one', () => {
    const storage = createGameStorage(
      createMemoryStore({
        'germle.v1.archive-progress': JSON.stringify({
          '4': [1, 2],
          '5': [1, -2],
          '6': 'moves',
          '0': [1],
          '2.5': [1],
        }),
        'germle.v1.archive-results': JSON.stringify({ '7': sampleResult, '8': { score: 'high' } }),
      }),
    );
    expect(storage.loadArchiveProgress()).toEqual(new Map([[4, [1, 2]]]));
    expect([...storage.loadArchiveResults().keys()]).toEqual([7]);
  });

  it('works without any store and survives a store that throws', () => {
    const missing = createGameStorage(undefined);
    missing.saveResult(1, sampleResult);
    expect(missing.loadResults().size).toBe(0);
    const throwing = createGameStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => {
      throwing.saveSettings(DEFAULT_SETTINGS);
    }).not.toThrow();
    expect(throwing.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('creates a player ID once, keeps it, and replaces a malformed one', () => {
    const store = createMemoryStore();
    const storage = createGameStorage(store);
    const ids = ['3f1c2a9e-5b7d-4c8e-9a1f-2b3c4d5e6f70', '9b2d7c41-0e3a-4f6b-8c5d-1a2b3c4d5e6f'];
    const createPlayerId = (): string => ids.shift() ?? 'unexpected';
    expect(storage.loadOrCreatePlayerId(createPlayerId)).toBe(
      '3f1c2a9e-5b7d-4c8e-9a1f-2b3c4d5e6f70',
    );
    expect(storage.loadOrCreatePlayerId(createPlayerId)).toBe(
      '3f1c2a9e-5b7d-4c8e-9a1f-2b3c4d5e6f70',
    );
    expect(store.data.get('germle.v1.player-id')).toBe('"3f1c2a9e-5b7d-4c8e-9a1f-2b3c4d5e6f70"');

    store.data.set('germle.v1.player-id', '"not-a-uuid"');
    expect(storage.loadOrCreatePlayerId(createPlayerId)).toBe(
      '9b2d7c41-0e3a-4f6b-8c5d-1a2b3c4d5e6f',
    );
    expect(store.data.get('germle.v1.player-id')).toBe('"9b2d7c41-0e3a-4f6b-8c5d-1a2b3c4d5e6f"');
  });

  it('has no player ID where it cannot be kept', () => {
    const createPlayerId = (): string => crypto.randomUUID();
    expect(createGameStorage(undefined).loadOrCreatePlayerId(createPlayerId)).toBeUndefined();
    const full = createGameStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(full.loadOrCreatePlayerId(createPlayerId)).toBeUndefined();
  });

  it('caches community numbers per puzzle and drops malformed ones', () => {
    const standing = {
      players: 12,
      below: 7,
      best: 88,
      bestCount: 2,
      histogram: [0, 0, 1, 0, 2, 3, 0, 4, 2, 0],
      counted: true,
    };
    const store = createMemoryStore({
      'germle.v1.community-standings': JSON.stringify({
        '1': { score: 60, standing },
        '2': { score: 60, standing: { ...standing, players: 99 } },
        '3': { score: 101, standing },
        '4': { standing },
      }),
    });
    const storage = createGameStorage(store);
    expect(storage.loadCommunityStandings()).toEqual(new Map([[1, { score: 60, standing }]]));
    storage.saveCommunityStanding(5, { score: 70, standing });
    storage.saveCommunityStanding(1, { score: 65, standing: { ...standing, counted: false } });
    expect(storage.loadCommunityStandings()).toEqual(
      new Map([
        [1, { score: 65, standing: { ...standing, counted: false } }],
        [5, { score: 70, standing }],
      ]),
    );
  });
});
