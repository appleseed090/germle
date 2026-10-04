import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, createGameStorage, type KeyValueStore } from './storage';

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
    storage.saveSettings({ sizeNodesByDegree: false, reduceMotion: true });
    expect(storage.loadSettings()).toEqual({ sizeNodesByDegree: false, reduceMotion: true });

    expect(storage.loadDailyProgress()).toBeUndefined();
    storage.saveDailyProgress({ puzzleNumber: 3, moves: [1, 2, 3] });
    expect(storage.loadDailyProgress()).toEqual({ puzzleNumber: 3, moves: [1, 2, 3] });

    storage.saveResult(3, sampleResult);
    expect(storage.loadResults()).toEqual(new Map([[3, sampleResult]]));

    expect(storage.hasSeenHowToPlay()).toBe(false);
    storage.markHowToPlaySeen();
    expect(storage.hasSeenHowToPlay()).toBe(true);
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
        'germle.v1.settings': '{"sizeNodesByDegree":"yes","reduceMotion":1}',
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
});
