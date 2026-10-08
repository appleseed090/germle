import { describe, expect, it } from 'vitest';
import { parseCommunityStanding, type CommunityStanding } from '../src/community-api';
import { handleApiRequest } from './api';
import type { ResultsStore } from './results-store';
import { scoreFinishedGame } from './submission';
import { createMemoryResultsStore, playScriptedGame } from './test-games';

// Puzzle #7's UTC day, so puzzles 1 to 8 are accepted.
const NOW = new Date('2026-10-10T12:00:00Z');
const ORIGIN = 'https://germle.com';

function playerId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function submit(body: unknown, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}/api/results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}

function standingRequest(query: string): Request {
  return new Request(`${ORIGIN}/api/standing?${query}`);
}

async function standingOf(response: Response): Promise<CommunityStanding> {
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const standing = parseCommunityStanding(await response.json());
  if (standing === undefined) throw new Error('Response is not a valid standing');
  return standing;
}

async function expectBareStatus(response: Response, status: number): Promise<void> {
  expect(response.status).toBe(status);
  expect(await response.text()).toBe('');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
}

const finishedGame = playScriptedGame(3);
const otherFinishedGame = playScriptedGame(3, { pickFromEnd: true });
const finishedScore = scoreFinishedGame(3, finishedGame);
const otherFinishedScore = scoreFinishedGame(3, otherFinishedGame);

describe('POST /api/results', () => {
  it('scores the moves itself, stores the first game and answers the standing', async () => {
    const store = createMemoryResultsStore();
    const response = await handleApiRequest(
      submit({ puzzleNumber: 3, playerId: playerId(1), moves: finishedGame }),
      store,
      NOW,
    );
    expect(await standingOf(response)).toMatchObject({
      players: 1,
      below: 0,
      best: finishedScore,
      bestCount: 1,
      counted: true,
    });
    expect(store.rows).toEqual([
      {
        puzzleNumber: 3,
        playerId: playerId(1),
        score: finishedScore,
        submittedAt: NOW.getTime() / 1000,
      },
    ]);
  });

  it('answers a repeat but keeps the first score, comparing the new one with everyone else', async () => {
    expect(finishedScore).not.toBe(otherFinishedScore);
    const store = createMemoryResultsStore();
    const first = { puzzleNumber: 3, playerId: playerId(1), moves: finishedGame };
    await handleApiRequest(submit(first), store, NOW);
    const repeat = await standingOf(await handleApiRequest(submit(first), store, NOW));
    expect(repeat).toMatchObject({ players: 1, below: 0, counted: false });

    const replay = await standingOf(
      await handleApiRequest(submit({ ...first, moves: otherFinishedGame }), store, NOW),
    );
    expect(replay).toMatchObject({ players: 1, below: 0, best: finishedScore, counted: false });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.score).toBe(finishedScore);
  });

  it('counts players with lower scores, never equal ones', async () => {
    const store = createMemoryResultsStore();
    const scores = [10, 40, 40, 75, 90];
    scores.forEach((score, index) => {
      store.rows.push({ puzzleNumber: 3, playerId: playerId(100 + index), score, submittedAt: 0 });
    });
    store.rows.push({ puzzleNumber: 2, playerId: playerId(200), score: 5, submittedAt: 0 });
    const standing = await standingOf(
      await handleApiRequest(
        submit({ puzzleNumber: 3, playerId: playerId(1), moves: finishedGame }),
        store,
        NOW,
      ),
    );
    const own = finishedScore ?? -1;
    expect(standing.players).toBe(6);
    expect(standing.below).toBe(scores.filter((score) => score < own).length);
    expect(standing.best).toBe(Math.max(90, own));
  });

  it.each([
    ['tomorrow in time zones east of UTC', 8, 200],
    ['two days ahead', 9, 400],
    ['puzzle 1', 1, 200],
  ])('accepts puzzle numbers up to one day ahead of UTC: %s', async (_, puzzleNumber, status) => {
    const moves = playScriptedGame(puzzleNumber);
    const response = await handleApiRequest(
      submit({ puzzleNumber, playerId: playerId(1), moves }),
      createMemoryResultsStore(),
      NOW,
    );
    expect(response.status).toBe(status);
  });

  it.each([
    [
      'an unfinished game',
      { puzzleNumber: 3, playerId: playerId(1), moves: finishedGame.slice(0, 6) },
    ],
    ['an illegal move', { puzzleNumber: 3, playerId: playerId(1), moves: [...finishedGame, 0] }],
    [
      'a made-up score',
      { puzzleNumber: 3, playerId: playerId(1), moves: finishedGame, score: 100 },
    ],
    ['a malformed player ID', { puzzleNumber: 3, playerId: 'me', moves: finishedGame }],
    ['puzzle 0', { puzzleNumber: 0, playerId: playerId(1), moves: [] }],
  ])('rejects %s with a bare 400 and stores nothing', async (_, body) => {
    const store = createMemoryResultsStore();
    await expectBareStatus(await handleApiRequest(submit(body), store, NOW), 400);
    expect(store.rows).toEqual([]);
  });

  it('rejects bodies that are not small JSON', async () => {
    const store = createMemoryResultsStore();
    const valid = JSON.stringify({ puzzleNumber: 3, playerId: playerId(1), moves: finishedGame });
    const requests = [
      submit(valid, { headers: { 'Content-Type': 'text/plain' } }),
      submit(valid, { headers: {} }),
      submit('{"puzzleNumber": 3,'),
      submit(`${valid}${' '.repeat(1024)}`),
      submit(new Uint8Array([0x7b, 0xff, 0x7d])),
      submit(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (let chunk = 0; chunk < 8; chunk++) controller.enqueue(new Uint8Array(256));
            controller.close();
          },
        }),
        { duplex: 'half' } as RequestInit,
      ),
    ];
    for (const request of requests)
      await expectBareStatus(await handleApiRequest(request, store, NOW), 400);
    expect(store.rows).toEqual([]);
  });

  it('accepts a charset on the JSON content type', async () => {
    const response = await handleApiRequest(
      submit(
        { puzzleNumber: 3, playerId: playerId(1), moves: finishedGame },
        { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      ),
      createMemoryResultsStore(),
      NOW,
    );
    expect(response.status).toBe(200);
  });
});

describe('GET /api/standing', () => {
  it("answers the standing of the player's counted score, with fresh numbers", async () => {
    const store = createMemoryResultsStore();
    await handleApiRequest(
      submit({ puzzleNumber: 3, playerId: playerId(1), moves: finishedGame }),
      store,
      NOW,
    );
    store.rows.push({ puzzleNumber: 3, playerId: playerId(2), score: 0, submittedAt: 0 });
    store.rows.push({ puzzleNumber: 3, playerId: playerId(3), score: 100, submittedAt: 0 });
    const standing = await standingOf(
      await handleApiRequest(standingRequest(`puzzle=3&player=${playerId(1)}`), store, NOW),
    );
    expect(standing).toMatchObject({ players: 3, best: 100, bestCount: 1, counted: true });
    expect(standing.below).toBe(finishedScore === 0 ? 0 : 1);
  });

  it('answers 404 for a player with no counted score, and 400 for a bad query', async () => {
    const store = createMemoryResultsStore();
    await expectBareStatus(
      await handleApiRequest(standingRequest(`puzzle=3&player=${playerId(1)}`), store, NOW),
      404,
    );
    for (const query of [
      'puzzle=3',
      `puzzle=9&player=${playerId(1)}`,
      `puzzle=x&player=${playerId(1)}`,
    ])
      await expectBareStatus(await handleApiRequest(standingRequest(query), store, NOW), 400);
  });
});

describe('every route', () => {
  it('answers 404 outside the two routes and 405 for the wrong method', async () => {
    const store = createMemoryResultsStore();
    await expectBareStatus(await handleApiRequest(new Request(`${ORIGIN}/api/`), store, NOW), 404);
    await expectBareStatus(
      await handleApiRequest(new Request(`${ORIGIN}/api/results/`), store, NOW),
      404,
    );
    const getResults = await handleApiRequest(new Request(`${ORIGIN}/api/results`), store, NOW);
    await expectBareStatus(getResults, 405);
    expect(getResults.headers.get('Allow')).toBe('POST');
    const postStanding = await handleApiRequest(
      new Request(`${ORIGIN}/api/standing`, { method: 'POST' }),
      store,
      NOW,
    );
    await expectBareStatus(postStanding, 405);
    expect(postStanding.headers.get('Allow')).toBe('GET');
  });

  it('answers 503 where no database is bound, as in preview deployments', async () => {
    await expectBareStatus(
      await handleApiRequest(
        submit({ puzzleNumber: 3, playerId: playerId(1), moves: finishedGame }),
        undefined,
        NOW,
      ),
      503,
    );
    await expectBareStatus(
      await handleApiRequest(standingRequest(`puzzle=3&player=${playerId(1)}`), undefined, NOW),
      503,
    );
  });

  it('answers a bare 500 when the database fails', async () => {
    const failing: ResultsStore = {
      insertIfFirst: () => Promise.reject(new Error('D1 is down')),
      countedScore: () => Promise.reject(new Error('D1 is down')),
      scoreTallies: () => Promise.reject(new Error('D1 is down')),
    };
    const quietConsole = console.error;
    console.error = () => undefined;
    try {
      await expectBareStatus(
        await handleApiRequest(
          submit({ puzzleNumber: 3, playerId: playerId(1), moves: finishedGame }),
          failing,
          NOW,
        ),
        500,
      );
    } finally {
      console.error = quietConsole;
    }
  });
});
