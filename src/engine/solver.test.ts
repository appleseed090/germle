import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG, type PuzzleConfig } from './config';
import {
  applyTap,
  countOutcomes,
  isTappable,
  replayMoves,
  scorePercent,
  startGame,
  type GameState,
} from './game';
import { createGraph } from './graph';
import { createPuzzle, type Puzzle } from './puzzle';
import { createMulberry32 } from './random';
import { DEFAULT_SOLVER_BUDGET, solvePuzzle, solverBudgetFor } from './solver';
import { createTableTransmissionRolls } from './transmission';

function bestScoreByExhaustiveSearch(puzzle: Puzzle, state: GameState): number {
  if (state.phase === 'ended') return scorePercent(countOutcomes(state));
  let best = 0;
  state.nodeStatuses.forEach((_, node) => {
    if (isTappable(puzzle, state, node)) {
      best = Math.max(
        best,
        bestScoreByExhaustiveSearch(puzzle, applyTap(puzzle, state, node).state),
      );
    }
  });
  return best;
}

describe('solvePuzzle', () => {
  it('finds the optimum of a small network, checked by exhaustive search', () => {
    // 10 people in a ring with chords, 2 vaccines, rolls chosen at random but fixed.
    const config: PuzzleConfig = {
      nodeCount: 10,
      ringNeighbourCount: 2,
      rewireProbability: 0,
      refuserCount: 1,
      vaccineCount: 2,
      indexPatientCount: 1,
      transmissionProbability: 0.35,
    };
    const random = createMulberry32(2024);
    const pairs: [number, number][] = [];
    for (let node = 0; node < 10; node++) pairs.push([node, (node + 1) % 10]);
    pairs.push([0, 5], [2, 7], [3, 8]);
    const graph = createGraph(10, pairs);
    const puzzle: Puzzle = {
      config,
      seedKey: 'small',
      graph,
      isRefuser: graph.adjacency.map((_, node) => node === 4),
      transmissionRolls: createTableTransmissionRolls(
        graph.edges.map(() => Array.from({ length: 12 }, () => random())),
      ),
      createOutbreakRandom: () => createMulberry32(7),
    };
    const optimum = bestScoreByExhaustiveSearch(puzzle, startGame(puzzle).state);
    expect(solvePuzzle(puzzle).score).toBe(optimum);
  });

  it('returns a game the engine replays to the reported score', () => {
    for (let puzzleNumber = 1; puzzleNumber <= 20; puzzleNumber++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, String(puzzleNumber));
      const solution = solvePuzzle(puzzle);
      const replayed = replayMoves(puzzle, solution.moves);
      expect(replayed?.phase).toBe('ended');
      if (replayed === undefined) continue;
      expect(countOutcomes(replayed)).toEqual(solution.counts);
      expect(scorePercent(solution.counts)).toBe(solution.score);
    }
  });

  it('is deterministic', () => {
    const solveFresh = (): unknown => solvePuzzle(createPuzzle(DAILY_PUZZLE_CONFIG, '11'));
    expect(solveFresh()).toEqual(solveFresh());
  });

  it('beats random play on every one of 30 daily puzzles', () => {
    for (let puzzleNumber = 1; puzzleNumber <= 30; puzzleNumber++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, String(puzzleNumber));
      const policy = createMulberry32(puzzleNumber);
      let bestRandomScore = 0;
      for (let attempt = 0; attempt < 20; attempt++) {
        let state = startGame(puzzle).state;
        while (state.phase !== 'ended') {
          const tappable = state.nodeStatuses.flatMap((_, node) =>
            isTappable(puzzle, state, node) ? [node] : [],
          );
          state = applyTap(
            puzzle,
            state,
            tappable[Math.floor(policy() * tappable.length)] ?? 0,
          ).state;
        }
        bestRandomScore = Math.max(bestRandomScore, scorePercent(countOutcomes(state)));
      }
      expect(solvePuzzle(puzzle).score).toBeGreaterThanOrEqual(bestRandomScore);
    }
  });

  it('keeps daily par in the calibrated band (see DECISIONS.md)', () => {
    const pars = Array.from(
      { length: 60 },
      (_, index) => solvePuzzle(createPuzzle(DAILY_PUZZLE_CONFIG, String(index + 1))).score,
    );
    const mean = pars.reduce((sum, par) => sum + par, 0) / pars.length;
    expect(mean).toBeGreaterThan(78);
    expect(mean).toBeLessThan(88);
    expect(pars.filter((par) => par >= 75 && par <= 85).length / pars.length).toBeGreaterThan(0.5);
  });
});

describe('solverBudgetFor', () => {
  it('uses the default up to 40 people and shrinks beyond', () => {
    expect(solverBudgetFor(40)).toBe(DEFAULT_SOLVER_BUDGET);
    const large = solverBudgetFor(80);
    expect(large.vaccineSetsPlayed).toBeLessThan(DEFAULT_SOLVER_BUDGET.vaccineSetsPlayed);
    expect(large.beamWidth).toBeLessThanOrEqual(DEFAULT_SOLVER_BUDGET.beamWidth);
  });
});
