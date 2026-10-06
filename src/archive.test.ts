import { describe, expect, it } from 'vitest';
import { archivePuzzlePath, buildArchiveEntries, requestedPuzzle } from './archive';

const counts = { vaccinated: 4, quarantined: 2, untouched: 30, infected: 4 };
const result = (score: number) => ({ score, counts });

describe('requestedPuzzle', () => {
  const read = (search: string) => requestedPuzzle(new URLSearchParams(search), 10);

  it('plays today without a puzzle number, or with today’s', () => {
    expect(read('')).toEqual({ kind: 'today' });
    expect(read('puzzle=10')).toEqual({ kind: 'today' });
  });

  it('opens any earlier puzzle and refuses later ones', () => {
    expect(read('puzzle=1')).toEqual({ kind: 'past', puzzleNumber: 1 });
    expect(read('puzzle=09')).toEqual({ kind: 'past', puzzleNumber: 9 });
    expect(read('puzzle=11')).toEqual({ kind: 'not-out-yet', puzzleNumber: 11 });
  });

  it('treats anything but a plain positive whole number as invalid', () => {
    for (const text of ['0', '-3', '2.5', '1e1', ' 4', 'abc', '', '12345678'])
      expect(read(`puzzle=${encodeURIComponent(text)}`)).toEqual({ kind: 'invalid' });
  });

  it('reads back the links it makes', () => {
    expect(
      requestedPuzzle(new URL(archivePuzzlePath(7), 'https://germle.com').searchParams, 10),
    ).toEqual({ kind: 'past', puzzleNumber: 7 });
  });
});

describe('buildArchiveEntries', () => {
  it('lists every puzzle from today back to #1, newest first, with its day', () => {
    const entries = buildArchiveEntries(3, {
      dailyResults: new Map(),
      archiveResults: new Map(),
      unfinishedPuzzleNumbers: new Set(),
    });
    expect(entries.map(({ puzzleNumber, href, isToday }) => [puzzleNumber, href, isToday])).toEqual(
      [
        [3, '/', true],
        [2, '/?puzzle=2', false],
        [1, '/?puzzle=1', false],
      ],
    );
    expect(entries[2]?.date).toEqual({ year: 2026, month: 10, day: 4 });
  });

  it('shows the result from the puzzle’s own day over a later archive game', () => {
    const entries = buildArchiveEntries(4, {
      dailyResults: new Map([[2, result(60)]]),
      archiveResults: new Map([
        [2, result(90)],
        [1, result(75)],
      ]),
      unfinishedPuzzleNumbers: new Set([4, 3, 1]),
    });
    expect(entries.map((entry) => [entry.result?.score, entry.inProgress])).toEqual([
      [undefined, true],
      [undefined, true],
      [60, false],
      [75, false],
    ]);
  });
});
