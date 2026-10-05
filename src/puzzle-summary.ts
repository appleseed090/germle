import type { PuzzleConfig } from './engine';
import { pluralize } from './pluralize';

/**
 * The numbers that shape a puzzle, on one line:
 * `40 people · 4 vaccines · 2 outbreaks · 2 refusers · 35% contagious`. Practice results add the
 * seed; the daily how-to-play dialog shows it for `DAILY_PUZZLE_CONFIG`.
 */
export function describePuzzleConfig(config: PuzzleConfig): string {
  return [
    pluralize(config.nodeCount, 'person', 'people'),
    pluralize(config.vaccineCount, 'vaccine', 'vaccines'),
    pluralize(config.indexPatientCount, 'outbreak', 'outbreaks'),
    pluralize(config.refuserCount, 'refuser', 'refusers'),
    `${Math.round(config.transmissionProbability * 100)}% contagious`,
  ].join(' · ');
}
