import { solvePuzzle, solverBudgetFor, type Puzzle, type Solution } from '../engine';

/** Name of the User Timing measure recorded for each solve, read by the performance check. */
export const PAR_MEASURE_NAME = 'germle:par-solve';

/**
 * Solves a puzzle at most once, on demand. Each solve is recorded as a `performance.measure`
 * so its cost can be read from a real page (see `e2e/par-timing.spec.ts`).
 */
export function createParSolver(puzzle: Puzzle): () => Solution {
  let solution: Solution | undefined;
  return () => {
    if (solution === undefined) {
      const start = performance.now();
      solution = solvePuzzle(puzzle, solverBudgetFor(puzzle.config.nodeCount));
      performance.measure(PAR_MEASURE_NAME, { start, end: performance.now() });
    }
    return solution;
  };
}

/** Delay after the outbreak starts before solving, so the outbreak animation runs smoothly. */
export const PAR_SOLVE_DELAY_MILLISECONDS = 900;
