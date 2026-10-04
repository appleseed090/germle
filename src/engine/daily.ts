/** A local calendar day. `month` is 1–12. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** The day of puzzle #1. Changing it renumbers every daily puzzle. */
export const LAUNCH_DATE: CalendarDate = Object.freeze({ year: 2026, month: 10, day: 4 });

const MILLISECONDS_PER_DAY = 86_400_000;

/** The calendar day of `date` in the player's local time zone. */
export function localCalendarDate(date: Date): CalendarDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/**
 * Whole days from `from` to `to` (negative if `to` is earlier). Compares Y-M-D components via
 * UTC midnights, so daylight-saving shifts cannot produce fractional days.
 */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const fromMidnight = Date.UTC(from.year, from.month - 1, from.day);
  const toMidnight = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMidnight - fromMidnight) / MILLISECONDS_PER_DAY);
}

/**
 * The daily puzzle number for a calendar day: days since {@link LAUNCH_DATE}, plus one. Days
 * before launch give numbers below 1; callers decide how to handle a wrong device clock.
 */
export function puzzleNumberForDate(date: CalendarDate): number {
  return daysBetween(LAUNCH_DATE, date) + 1;
}

/** The seed key of a daily puzzle: its number in decimal. Part of the frozen seed derivation. */
export function dailySeedKey(puzzleNumber: number): string {
  return String(puzzleNumber);
}
