import { describe, expect, it, vi } from 'vitest';
import type { CommunityStanding, ResultSubmission } from './community-api';
import {
  communityChartBands,
  createCommunityApi,
  createCommunityComparison,
  describeRank,
  describeTopScore,
  isStandingShown,
  percentBeaten,
  type CommunityApi,
  type FetchFunction,
} from './community';
import { en } from './i18n/en';
import { zhHans } from './i18n/zh-hans';
import { zhHant } from './i18n/zh-hant';
import { createGameStorage, type KeyValueStore } from './storage';

const PLAYER_ID = '3f1c2a9e-5b7d-4c8e-9a1f-2b3c4d5e6f70';

const STANDING: CommunityStanding = {
  players: 318,
  below: 229,
  best: 88,
  bestCount: 14,
  histogram: [2, 3, 10, 20, 31, 52, 60, 70, 56, 14],
  counted: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('createCommunityApi', () => {
  it('posts the moves as JSON and returns the validated standing', async () => {
    const fetchFunction = vi.fn<FetchFunction>(() => Promise.resolve(jsonResponse(STANDING)));
    const api = createCommunityApi(fetchFunction);
    const submission: ResultSubmission = { puzzleNumber: 7, playerId: PLAYER_ID, moves: [1, 2] };
    expect(await api.submit(submission)).toEqual(STANDING);
    const [url, init] = fetchFunction.mock.calls[0] ?? [];
    expect(url).toBe('/api/results');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual(submission);
  });

  it('asks for the standing by puzzle and player, and reports a player with no score', async () => {
    const fetchFunction = vi.fn<FetchFunction>(() => Promise.resolve(jsonResponse(STANDING)));
    expect(await createCommunityApi(fetchFunction).fetchStanding(7, PLAYER_ID)).toEqual(STANDING);
    expect(fetchFunction.mock.calls[0]?.[0]).toBe(`/api/standing?puzzle=7&player=${PLAYER_ID}`);
    const notFound = createCommunityApi(() => Promise.resolve(new Response(null, { status: 404 })));
    expect(await notFound.fetchStanding(7, PLAYER_ID)).toBe('not-counted');
  });

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a server error', () => Promise.resolve(new Response(null, { status: 500 }))],
    ['a body that is not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['a malformed standing', () => Promise.resolve(jsonResponse({ ...STANDING, players: -1 }))],
    ['an empty body', () => Promise.resolve(new Response(null, { status: 200 }))],
  ])('resolves %s to undefined', async (_, fetchFunction: FetchFunction) => {
    const api = createCommunityApi(fetchFunction);
    expect(await api.submit({ puzzleNumber: 7, playerId: PLAYER_ID, moves: [] })).toBeUndefined();
    expect(await api.fetchStanding(7, PLAYER_ID)).toBeUndefined();
  });

  it('gives up on a request that hangs', async () => {
    vi.useFakeTimers();
    try {
      const hanging: FetchFunction = (_, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      const result = createCommunityApi(hanging).fetchStanding(7, PLAYER_ID);
      await vi.advanceTimersByTimeAsync(6000);
      expect(await result).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createCommunityComparison', () => {
  function setUp({
    submit = vi.fn<CommunityApi['submit']>(() => Promise.resolve(STANDING)),
    fetchStanding = vi.fn<CommunityApi['fetchStanding']>(() => Promise.resolve(STANDING)),
  } = {}) {
    const storage = createGameStorage(createMemoryStore());
    const shown: (CommunityStanding | undefined)[] = [];
    const comparison = createCommunityComparison({
      puzzleNumber: 7,
      api: { submit, fetchStanding },
      storage,
      createPlayerId: () => PLAYER_ID,
      onStanding: (standing) => shown.push(standing),
    });
    return { storage, shown, submit, fetchStanding, comparison };
  }

  it('submits a first game, caches the numbers and shows them', async () => {
    const { storage, shown, submit, fetchStanding, comparison } = setUp();
    comparison.refresh([4, 5, 6], 75);
    await vi.waitFor(() => {
      expect(shown).toEqual([undefined, STANDING]);
    });
    expect(submit).toHaveBeenCalledWith({
      puzzleNumber: 7,
      playerId: PLAYER_ID,
      moves: [4, 5, 6],
    });
    expect(fetchStanding).not.toHaveBeenCalled();
    expect(storage.loadCommunityStandings().get(7)).toEqual({ score: 75, standing: STANDING });
  });

  it('shows cached numbers at once, then fetches fresh ones for a counted score', async () => {
    const fresh = { ...STANDING, players: 320, histogram: [2, 3, 10, 20, 31, 52, 60, 71, 57, 14] };
    const { storage, shown, submit, fetchStanding, comparison } = setUp({
      fetchStanding: vi.fn<CommunityApi['fetchStanding']>(() => Promise.resolve(fresh)),
    });
    storage.saveCommunityStanding(7, { score: 75, standing: STANDING });
    comparison.refresh([4, 5, 6], 75);
    expect(shown).toEqual([STANDING]);
    await vi.waitFor(() => {
      expect(shown).toEqual([STANDING, fresh]);
    });
    expect(fetchStanding).toHaveBeenCalledWith(7, PLAYER_ID);
    expect(submit).not.toHaveBeenCalled();
  });

  it('resends the moves when the server has lost the counted score', async () => {
    const { storage, submit, comparison } = setUp({
      fetchStanding: vi.fn<CommunityApi['fetchStanding']>(() => Promise.resolve('not-counted')),
    });
    storage.saveCommunityStanding(7, { score: 75, standing: STANDING });
    comparison.refresh([4, 5, 6], 75);
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
  });

  it('never shows numbers cached for another score, and resends a repeat game', async () => {
    const { storage, shown, submit, comparison } = setUp();
    storage.saveCommunityStanding(7, { score: 75, standing: { ...STANDING, counted: false } });
    comparison.refresh([1, 2], 40);
    expect(shown).toEqual([undefined]);
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    comparison.refresh([1, 2], 40);
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the cache and shows nothing new when the request fails', async () => {
    const { storage, shown, comparison } = setUp({
      submit: vi.fn<CommunityApi['submit']>(() => Promise.resolve(undefined)),
    });
    comparison.refresh([4, 5, 6], 75);
    await vi.waitFor(() => {
      expect(shown).toEqual([undefined]);
    });
    expect(storage.loadCommunityStandings().size).toBe(0);
  });

  it('runs one request at a time', async () => {
    let finish: (standing: CommunityStanding) => void = () => undefined;
    const submit = vi.fn<CommunityApi['submit']>(
      () =>
        new Promise<CommunityStanding>((resolve) => {
          finish = resolve;
        }),
    );
    const { shown, fetchStanding, comparison } = setUp({ submit });
    comparison.refresh([4, 5, 6], 75);
    comparison.refresh([4, 5, 6], 75);
    expect(submit).toHaveBeenCalledTimes(1);
    finish(STANDING);
    await vi.waitFor(() => {
      expect(shown).toContain(STANDING);
    });
    await Promise.resolve();
    comparison.refresh([4, 5, 6], 75);
    expect(fetchStanding).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('sends nothing where no player ID can be kept or made', async () => {
    const submit = vi.fn(() => Promise.resolve(STANDING));
    const unkept = createCommunityComparison({
      puzzleNumber: 7,
      api: { submit, fetchStanding: vi.fn() },
      storage: createGameStorage(undefined),
      createPlayerId: () => PLAYER_ID,
      onStanding: () => undefined,
    });
    unkept.refresh([4, 5, 6], 75);
    const unmade = createCommunityComparison({
      puzzleNumber: 7,
      api: { submit, fetchStanding: vi.fn() },
      storage: createGameStorage(createMemoryStore()),
      createPlayerId: () => {
        throw new TypeError('crypto.randomUUID is not a function');
      },
      onStanding: () => undefined,
    });
    unmade.refresh([4, 5, 6], 75);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('the comparison text', () => {
  it('rounds the share beaten down, among the other players only', () => {
    expect(percentBeaten(STANDING)).toBe(72);
    expect(percentBeaten({ ...STANDING, below: 317 })).toBe(100);
    expect(percentBeaten({ ...STANDING, below: 316 })).toBe(99);
    expect(percentBeaten({ ...STANDING, below: 0 })).toBe(0);
  });

  it('describes the rank and the top score', () => {
    expect(describeRank(STANDING, en.community)).toBe('Better than 72% of 318 players');
    expect(describeRank({ ...STANDING, players: 1318, below: 949 }, en.community)).toBe(
      'Better than 72% of 1,318 players',
    );
    expect(describeTopScore(STANDING, en.community)).toEqual([
      'Top score so far: 88%',
      'reached by 14 players',
    ]);
    expect(describeTopScore({ ...STANDING, bestCount: 1 }, en.community)).toEqual([
      'Top score so far: 88%',
      'reached by 1 player',
    ]);
  });

  it('describes the rank and the top score in Chinese, grouping thousands as English does', () => {
    expect(describeRank({ ...STANDING, players: 1318, below: 949 }, zhHans.community)).toBe(
      '超过了 1,318 名玩家中 72% 的人',
    );
    expect(describeTopScore(STANDING, zhHant.community)).toEqual([
      '目前最高分：88%',
      '共 14 位玩家達到',
    ]);
  });

  it('is shown from 10 players on', () => {
    expect(isStandingShown(undefined)).toBe(false);
    expect(isStandingShown({ ...STANDING, players: 9 })).toBe(false);
    expect(isStandingShown({ ...STANDING, players: 10 })).toBe(true);
  });
});

describe('communityChartBands', () => {
  it('scales bars to the fullest band and highlights the band of the score', () => {
    const bands = communityChartBands(STANDING, 75);
    expect(bands).toHaveLength(10);
    expect(bands.map((band) => band.label)).toEqual([
      '0–9',
      '10–19',
      '20–29',
      '30–39',
      '40–49',
      '50–59',
      '60–69',
      '70–79',
      '80–89',
      '90–100',
    ]);
    expect(bands.map((band) => band.players)).toEqual(STANDING.histogram);
    expect(bands[7]).toEqual({
      label: '70–79',
      players: 70,
      heightPercent: 100,
      isPlayersBand: true,
    });
    expect(bands[6]?.heightPercent).toBeCloseTo((100 * 60) / 70);
    expect(bands.filter((band) => band.isPlayersBand)).toHaveLength(1);
  });

  it('keeps a band with players visible and leaves an empty one flat', () => {
    const bands = communityChartBands(
      { ...STANDING, players: 101, histogram: [0, 1, 0, 0, 0, 0, 0, 0, 0, 100], best: 100 },
      100,
    );
    expect(bands[0]?.heightPercent).toBe(0);
    expect(bands[1]?.heightPercent).toBe(6);
    expect(bands[9]).toMatchObject({ heightPercent: 100, isPlayersBand: true });
  });
});
