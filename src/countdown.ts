import type { CalendarDate } from './engine';

/** Local midnight at the end of `day`, when the next daily puzzle unlocks. */
export function nextPuzzleStart(day: CalendarDate): Date {
  return new Date(day.year, day.month - 1, day.day + 1);
}

/** `HH:MM:SS`, rounding up to the next whole second and never below zero. */
export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
