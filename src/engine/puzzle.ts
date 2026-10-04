import { validatePuzzleConfig, type PuzzleConfig } from './config';
import { generateSmallWorldGraph, type Graph } from './graph';
import { createStreamRandom, shuffledCopy, type RandomSource } from './random';
import { createSeededTransmissionRolls, type TransmissionRolls } from './transmission';

/**
 * Everything fixed about one puzzle before the player moves. Two players with the same puzzle
 * and the same moves see identical games.
 */
export interface Puzzle {
  readonly config: PuzzleConfig;
  /** The seed key all streams derive from (the decimal puzzle number for daily puzzles). */
  readonly seedKey: string;
  readonly graph: Graph;
  /** `isRefuser[node]` is true for people who cannot be vaccinated. */
  readonly isRefuser: readonly boolean[];
  readonly transmissionRolls: TransmissionRolls;
  /**
   * A fresh copy of the `outbreaks` stream, consumed once when the vaccine phase ends to choose
   * the index patients. A factory, so replaying a game from scratch draws the same values.
   */
  readonly createOutbreakRandom: () => RandomSource;
}

/**
 * Derives a puzzle from its config and seed key. Each part comes from its own named stream
 * (`graph`, `refusers`, `outbreaks`, `transmission`; `layout` is used by the renderer).
 *
 * @throws RangeError if the config is invalid (see `validatePuzzleConfig`).
 */
export function createPuzzle(config: PuzzleConfig, seedKey: string): Puzzle {
  validatePuzzleConfig(config);
  const graph = generateSmallWorldGraph(config, createStreamRandom(seedKey, 'graph'));
  return {
    config,
    seedKey,
    graph,
    isRefuser: chooseRefusers(config, createStreamRandom(seedKey, 'refusers')),
    transmissionRolls: createSeededTransmissionRolls(
      graph.edges.length,
      createStreamRandom(seedKey, 'transmission'),
    ),
    createOutbreakRandom: () => createStreamRandom(seedKey, 'outbreaks'),
  };
}

function chooseRefusers(config: PuzzleConfig, random: RandomSource): boolean[] {
  const allNodes = Array.from({ length: config.nodeCount }, (_, node) => node);
  const isRefuser = new Array<boolean>(config.nodeCount).fill(false);
  for (const node of shuffledCopy(allNodes, random).slice(0, config.refuserCount)) {
    isRefuser[node] = true;
  }
  return isRefuser;
}
