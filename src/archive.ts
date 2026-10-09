import { calendarDateForPuzzleNumber, type CalendarDate } from './engine';
import type { DailyResult } from './storage';

/**
 * The URL parameter that opens a past daily puzzle on the game page, as in `/?puzzle=12`. Links
 * are shared, so the name is a public format.
 */
const PUZZLE_PARAMETER = 'puzzle';

/** The game-page path that plays a past daily puzzle. */
export function archivePuzzlePath(puzzleNumber: number): string {
  return `/?${PUZZLE_PARAMETER}=${puzzleNumber}`;
}

/** Which daily puzzle the game page's address asks for. */
export type RequestedPuzzle =
  | { readonly kind: 'today' }
  | { readonly kind: 'past'; readonly puzzleNumber: number }
  | { readonly kind: 'not-out-yet'; readonly puzzleNumber: number }
  | { readonly kind: 'invalid' };

/**
 * Reads the requested puzzle from untrusted URL parameters. No parameter, or today's number, is
 * today's game; an earlier number is a past puzzle; a later one is not out yet. Anything that is
 * not a plain positive whole number is invalid.
 */
export function requestedPuzzle(
  parameters: URLSearchParams,
  todayPuzzleNumber: number,
): RequestedPuzzle {
  const text = parameters.get(PUZZLE_PARAMETER);
  if (text === null) return { kind: 'today' };
  if (!/^[0-9]{1,7}$/.test(text)) return { kind: 'invalid' };
  const puzzleNumber = Number(text);
  if (puzzleNumber < 1) return { kind: 'invalid' };
  if (puzzleNumber === todayPuzzleNumber) return { kind: 'today' };
  return puzzleNumber < todayPuzzleNumber
    ? { kind: 'past', puzzleNumber }
    : { kind: 'not-out-yet', puzzleNumber };
}

/**
 * Formats puzzle days, short and in `locale`: "Tue, Oct 6, 2026" in US English, "2026年10月6日周二"
 * in Simplified Chinese.
 */
export function puzzleDateFormatter(locale: string): (date: CalendarDate) => string {
  const format = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (date) => format.format(new Date(date.year, date.month - 1, date.day));
}

/** One row of the archive list. */
export interface ArchiveEntry {
  readonly puzzleNumber: number;
  readonly date: CalendarDate;
  readonly isToday: boolean;
  /** Where the row links: the plain game page for today, the archive link otherwise. */
  readonly href: string;
  /** The player's finished game, if any; a result from the puzzle's own day wins. */
  readonly result: DailyResult | undefined;
  readonly inProgress: boolean;
}

/** What the player has done so far, as the archive list needs it. */
export interface ArchiveHistory {
  readonly dailyResults: ReadonlyMap<number, DailyResult>;
  readonly archiveResults: ReadonlyMap<number, DailyResult>;
  /** Puzzles with moves saved but no result yet, today's daily game included. */
  readonly unfinishedPuzzleNumbers: ReadonlySet<number>;
}

/** Every daily puzzle from today back to #1, newest first. */
export function buildArchiveEntries(
  todayPuzzleNumber: number,
  history: ArchiveHistory,
): ArchiveEntry[] {
  return Array.from({ length: todayPuzzleNumber }, (_, index) => {
    const puzzleNumber = todayPuzzleNumber - index;
    const result =
      history.dailyResults.get(puzzleNumber) ?? history.archiveResults.get(puzzleNumber);
    const isToday = puzzleNumber === todayPuzzleNumber;
    return {
      puzzleNumber,
      date: calendarDateForPuzzleNumber(puzzleNumber),
      isToday,
      href: isToday ? '/' : archivePuzzlePath(puzzleNumber),
      result,
      inProgress: result === undefined && history.unfinishedPuzzleNumbers.has(puzzleNumber),
    };
  });
}
