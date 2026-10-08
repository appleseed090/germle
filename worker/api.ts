import { RESULTS_PATH, STANDING_PATH, type CommunityStanding } from '../src/community-api';
import type { ResultsStore } from './results-store';
import { computeStanding } from './standing';
import {
  latestAcceptedPuzzleNumber,
  parseStandingQuery,
  parseSubmission,
  scoreFinishedGame,
} from './submission';

/** A valid submission is about 200 bytes; anything far larger is not one. */
const MAXIMUM_BODY_BYTES = 1024;

/**
 * Answers a request under `/api/`. Every input is validated here, once; a request that fails any
 * check gets a bare 400. Both routes answer a {@link CommunityStanding} as JSON:
 *
 * - `POST /api/results` with a `ResultSubmission`: replays the moves, stores the score if it is
 *   the player's first for the puzzle, and answers the standing of the submitted score.
 * - `GET /api/standing?puzzle=<n>&player=<id>`: the standing of the player's counted score, or
 *   404 if they have none.
 *
 * @param store - `undefined` where no database is bound (preview deployments): every route then
 *   answers 503, and the page shows no comparison.
 * @param now - The current time, which bounds the accepted puzzle numbers.
 */
export async function handleApiRequest(
  request: Request,
  store: ResultsStore | undefined,
  now: Date,
): Promise<Response> {
  const url = new URL(request.url);
  const route = ROUTES.get(url.pathname);
  if (route === undefined) return emptyResponse(404);
  if (request.method !== route.method) return emptyResponse(405, { Allow: route.method });
  if (store === undefined) return emptyResponse(503);
  try {
    return await route.handle(request, url, store, latestAcceptedPuzzleNumber(now), now);
  } catch (error) {
    console.error('API request failed', error);
    return emptyResponse(500);
  }
}

interface Route {
  readonly method: 'GET' | 'POST';
  readonly handle: (
    request: Request,
    url: URL,
    store: ResultsStore,
    latestPuzzleNumber: number,
    now: Date,
  ) => Promise<Response>;
}

const ROUTES: ReadonlyMap<string, Route> = new Map<string, Route>([
  [RESULTS_PATH, { method: 'POST', handle: handleSubmission }],
  [STANDING_PATH, { method: 'GET', handle: handleStanding }],
]);

async function handleSubmission(
  request: Request,
  _url: URL,
  store: ResultsStore,
  latestPuzzleNumber: number,
  now: Date,
): Promise<Response> {
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('Content-Type') ?? ''))
    return emptyResponse(400);
  const body = await readBodyText(request, MAXIMUM_BODY_BYTES);
  if (body === undefined) return emptyResponse(400);
  const submission = parseSubmission(parseJson(body), latestPuzzleNumber);
  if (submission === undefined) return emptyResponse(400);
  const score = scoreFinishedGame(submission.puzzleNumber, submission.moves);
  if (score === undefined) return emptyResponse(400);

  const { puzzleNumber, playerId } = submission;
  const counted = await store.insertIfFirst({
    puzzleNumber,
    playerId,
    score,
    submittedAt: Math.floor(now.getTime() / 1000),
  });
  const ownCountedScore = counted ? score : await store.countedScore(puzzleNumber, playerId);
  if (ownCountedScore === undefined) throw new Error('A kept result disappeared');
  const tallies = await store.scoreTallies(puzzleNumber);
  return standingResponse(computeStanding(tallies, score, ownCountedScore, counted));
}

async function handleStanding(
  _request: Request,
  url: URL,
  store: ResultsStore,
  latestPuzzleNumber: number,
): Promise<Response> {
  const query = parseStandingQuery(url.searchParams, latestPuzzleNumber);
  if (query === undefined) return emptyResponse(400);
  const score = await store.countedScore(query.puzzleNumber, query.playerId);
  if (score === undefined) return emptyResponse(404);
  const tallies = await store.scoreTallies(query.puzzleNumber);
  return standingResponse(computeStanding(tallies, score, score, true));
}

/**
 * The body as UTF-8 text, or `undefined` if it is larger than `maximumBytes` or not valid UTF-8.
 * Reads the stream itself rather than trusting `Content-Length`, and stops at the limit.
 */
async function readBodyText(request: Request, maximumBytes: number): Promise<string | undefined> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (!(declaredLength <= maximumBytes)) return undefined;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maximumBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const COMMON_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function standingResponse(standing: CommunityStanding): Response {
  return new Response(JSON.stringify(standing), {
    status: 200,
    headers: { ...COMMON_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function emptyResponse(status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...COMMON_HEADERS, ...extraHeaders } });
}
