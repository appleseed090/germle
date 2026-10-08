import { describe, expect, it } from 'vitest';
import {
  DAILY_PUZZLE_CONFIG,
  countOutcomes,
  createPuzzle,
  dailySeedKey,
  replayMoves,
  scorePercent,
} from '../src/engine';
import {
  latestAcceptedPuzzleNumber,
  parseStandingQuery,
  parseSubmission,
  scoreFinishedGame,
} from './submission';
import { playScriptedGame } from './test-games';

const PLAYER_ID = '3f1c2a9e-5b7d-4c8e-9a1f-2b3c4d5e6f70';
const LATEST = 8;

describe('latestAcceptedPuzzleNumber', () => {
  it('is one above the number of the current UTC date, whatever the hour', () => {
    expect(latestAcceptedPuzzleNumber(new Date('2026-10-04T00:00:00Z'))).toBe(2);
    expect(latestAcceptedPuzzleNumber(new Date('2026-10-10T00:00:00Z'))).toBe(8);
    expect(latestAcceptedPuzzleNumber(new Date('2026-10-10T23:59:59Z'))).toBe(8);
  });
});

describe('parseSubmission', () => {
  const valid = { puzzleNumber: 3, playerId: PLAYER_ID, moves: [1, 2, 3] };

  it('accepts the three fields in any order', () => {
    expect(parseSubmission(valid, LATEST)).toEqual(valid);
    expect(parseSubmission({ moves: [], playerId: PLAYER_ID, puzzleNumber: 8 }, LATEST)).toEqual({
      puzzleNumber: 8,
      playerId: PLAYER_ID,
      moves: [],
    });
  });

  it.each([
    ['not an object', [valid]],
    ['null', null],
    ['an extra field', { ...valid, score: 100 }],
    ['a missing field', { puzzleNumber: 3, playerId: PLAYER_ID }],
    ['puzzle 0', { ...valid, puzzleNumber: 0 }],
    ['a puzzle past the window', { ...valid, puzzleNumber: LATEST + 1 }],
    ['a fractional puzzle', { ...valid, puzzleNumber: 2.5 }],
    ['a puzzle as text', { ...valid, puzzleNumber: '3' }],
    ['an uppercase player ID', { ...valid, playerId: PLAYER_ID.toUpperCase() }],
    [
      'a player ID that is not version 4',
      { ...valid, playerId: PLAYER_ID.replace('-4c8e', '-1c8e') },
    ],
    ['a player ID that is not a UUID', { ...valid, playerId: 'player-1' }],
    ['moves that are not an array', { ...valid, moves: '1,2,3' }],
    ['a fractional move', { ...valid, moves: [1, 2.5] }],
    ['a move as text', { ...valid, moves: [1, '2'] }],
    ['more moves than people', { ...valid, moves: new Array<number>(41).fill(0) }],
  ])('rejects %s', (_, body) => {
    expect(parseSubmission(body, LATEST)).toBeUndefined();
  });
});

describe('parseStandingQuery', () => {
  const query = (text: string): URLSearchParams => new URLSearchParams(text);

  it('reads a plain puzzle number and a player ID', () => {
    expect(parseStandingQuery(query(`puzzle=8&player=${PLAYER_ID}`), LATEST)).toEqual({
      puzzleNumber: 8,
      playerId: PLAYER_ID,
    });
  });

  it.each(['puzzle=0', 'puzzle=9', 'puzzle=03', 'puzzle=3.0', 'puzzle=%2B3', 'puzzle=', ''])(
    'rejects %j',
    (puzzle) => {
      expect(parseStandingQuery(query(`${puzzle}&player=${PLAYER_ID}`), LATEST)).toBeUndefined();
    },
  );

  it('rejects a missing or malformed player', () => {
    expect(parseStandingQuery(query('puzzle=3'), LATEST)).toBeUndefined();
    expect(parseStandingQuery(query('puzzle=3&player=abc'), LATEST)).toBeUndefined();
  });
});

describe('scoreFinishedGame', () => {
  it("scores a finished game exactly as the player's own engine does", () => {
    for (const puzzleNumber of [1, 2, 3, 100]) {
      const moves = playScriptedGame(puzzleNumber);
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, dailySeedKey(puzzleNumber));
      const state = replayMoves(puzzle, moves);
      if (state === undefined) throw new Error('Scripted game did not replay');
      expect(scoreFinishedGame(puzzleNumber, moves)).toBe(scorePercent(countOutcomes(state)));
    }
  });

  it('rejects an unfinished game, an illegal move and a move after the end', () => {
    const finished = playScriptedGame(3);
    expect(scoreFinishedGame(3, playScriptedGame(3, { moveLimit: 5 }))).toBeUndefined();
    expect(scoreFinishedGame(3, [])).toBeUndefined();
    expect(scoreFinishedGame(3, [finished[0] ?? 0, finished[0] ?? 0])).toBeUndefined();
    expect(scoreFinishedGame(3, [...finished, 0])).toBeUndefined();
    expect(scoreFinishedGame(3, [-1])).toBeUndefined();
    expect(scoreFinishedGame(3, [40])).toBeUndefined();
  });
});
