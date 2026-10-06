import { describe, expect, it } from 'vitest';
import {
  LAUNCH_DATE,
  calendarDateForPuzzleNumber,
  dailySeedKey,
  daysBetween,
  localCalendarDate,
  puzzleNumberForDate,
} from './daily';

describe('puzzleNumberForDate', () => {
  it('is 1 on launch day and counts calendar days after it', () => {
    expect(puzzleNumberForDate(LAUNCH_DATE)).toBe(1);
    expect(puzzleNumberForDate({ year: 2026, month: 10, day: 5 })).toBe(2);
    expect(puzzleNumberForDate({ year: 2026, month: 11, day: 4 })).toBe(32);
    expect(puzzleNumberForDate({ year: 2027, month: 10, day: 4 })).toBe(366);
  });

  it('goes below 1 before launch', () => {
    expect(puzzleNumberForDate({ year: 2026, month: 10, day: 3 })).toBe(0);
  });
});

describe('calendarDateForPuzzleNumber', () => {
  it('names the day of each puzzle, across month, year and leap-day boundaries', () => {
    expect(calendarDateForPuzzleNumber(1)).toEqual(LAUNCH_DATE);
    expect(calendarDateForPuzzleNumber(29)).toEqual({ year: 2026, month: 11, day: 1 });
    expect(calendarDateForPuzzleNumber(90)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(calendarDateForPuzzleNumber(514)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('inverts puzzleNumberForDate for every puzzle of the first four years', () => {
    for (let puzzleNumber = 1; puzzleNumber <= 1461; puzzleNumber++)
      expect(puzzleNumberForDate(calendarDateForPuzzleNumber(puzzleNumber))).toBe(puzzleNumber);
  });
});

describe('daysBetween', () => {
  it('counts whole days across daylight-saving changes and leap days', () => {
    expect(daysBetween({ year: 2027, month: 3, day: 13 }, { year: 2027, month: 3, day: 15 })).toBe(
      2,
    );
    expect(daysBetween({ year: 2026, month: 10, day: 31 }, { year: 2026, month: 11, day: 2 })).toBe(
      2,
    );
    expect(daysBetween({ year: 2028, month: 2, day: 28 }, { year: 2028, month: 3, day: 1 })).toBe(
      2,
    );
  });
});

describe('localCalendarDate', () => {
  it('reads local date components, not UTC ones', () => {
    const lateEvening = new Date(2026, 9, 4, 23, 59, 59);
    expect(localCalendarDate(lateEvening)).toEqual({ year: 2026, month: 10, day: 4 });
    const justAfterMidnight = new Date(2026, 9, 5, 0, 0, 1);
    expect(localCalendarDate(justAfterMidnight)).toEqual({ year: 2026, month: 10, day: 5 });
  });
});

describe('dailySeedKey', () => {
  it('is the puzzle number in decimal', () => {
    expect(dailySeedKey(17)).toBe('17');
  });
});
