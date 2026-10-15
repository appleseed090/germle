import { createMulberry32, hashStringFnv1a32 } from '../engine/random';
import {
  canBuyUnlock,
  researchForRun,
  runStartOptions,
  unlockCost,
  type UnlockId,
} from './research';
import { compareRunScores, runScore, startRun, type RunState } from './run';
import type { EndlessSave, EndlessSettings } from './save';

/**
 * Pure transitions of the whole save: starting and finishing runs, earning and spending
 * Research. The UI applies one, then writes the result through the platform's save store.
 */

/** Starts a run with the save's unlocked bonuses; any unfinished run is replaced. */
export function beginRun(save: EndlessSave, seed: string): EndlessSave {
  const random = createMulberry32(hashStringFnv1a32(`germle-endless:v1:${seed}:start`));
  return { ...save, run: startRun(seed, runStartOptions(save.unlocks, random)) };
}

/** How many upgrades each offer shows for this save. */
export function offerCountFor(save: EndlessSave): number {
  return runStartOptions(save.unlocks, () => 0).offerCount;
}

/** Stores the run's latest state; clearing level 1 for the first time ends the tutorial. */
export function recordRun(save: EndlessSave, run: RunState): EndlessSave {
  return { ...save, run, tutorialDone: save.tutorialDone || run.levelsCleared > 0 };
}

/** What finishing a run changed, for the run summary. */
export interface FinishedRun {
  readonly save: EndlessSave;
  readonly researchEarned: number;
  readonly isNewBest: boolean;
}

/** Ends a run: banks its Research, updates the best run and clears the save's run. */
export function finishRun(save: EndlessSave, run: RunState): FinishedRun {
  const score = runScore(run);
  const researchEarned = researchForRun(score.levelsCleared);
  const isNewBest =
    score.levelsCleared > 0 && (save.bestRun === null || compareRunScores(score, save.bestRun) > 0);
  return {
    save: {
      ...save,
      research: save.research + researchEarned,
      researchEarned: save.researchEarned + researchEarned,
      bestRun: isNewBest ? score : save.bestRun,
      runsFinished: save.runsFinished + 1,
      tutorialDone: save.tutorialDone || score.levelsCleared > 0,
      run: null,
    },
    researchEarned,
    isNewBest,
  };
}

/**
 * Spends Research on an unlock.
 *
 * @returns The new save, or `undefined` if it is already owned or not affordable.
 */
export function buyUnlock(save: EndlessSave, id: UnlockId): EndlessSave | undefined {
  if (!canBuyUnlock(id, save.research, save.unlocks)) return undefined;
  return { ...save, research: save.research - unlockCost(id), unlocks: [...save.unlocks, id] };
}

/** Replaces the settings. */
export function updateSettings(save: EndlessSave, settings: EndlessSettings): EndlessSave {
  return { ...save, settings };
}
