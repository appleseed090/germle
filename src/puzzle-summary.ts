import type { PuzzleConfig } from './engine';
import type { Messages } from './i18n/messages';

/**
 * The numbers that shape a puzzle, on one line:
 * `40 people · 4 vaccines · 2 outbreaks · 2 refusers · 35% contagious` in English. Practice
 * results add the seed; the daily how-to-play dialog shows it for `DAILY_PUZZLE_CONFIG`.
 */
export function describePuzzleConfig(config: PuzzleConfig, text: Messages['summary']): string {
  return [
    text.people(config.nodeCount),
    text.vaccines(config.vaccineCount),
    text.outbreaks(config.indexPatientCount),
    text.refusers(config.refuserCount),
    text.contagious(Math.round(config.transmissionProbability * 100)),
  ].join(' · ');
}
