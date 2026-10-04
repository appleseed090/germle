import { TRANSMISSION_TURN_LIMIT } from './config';
import type { RandomSource } from './random';

/**
 * The pre-rolled dice of an outbreak: one number in `[0, 1)` per edge per turn. An infected
 * person infects a susceptible neighbour on a turn when the roll for their shared edge is below
 * the transmission probability.
 */
export interface TransmissionRolls {
  /**
   * @param edgeIndex - Index into the puzzle graph's `edges`.
   * @param turn - Zero-based epidemic turn, below {@link TRANSMISSION_TURN_LIMIT}.
   * @throws RangeError when the turn is outside the pre-rolled range.
   */
  roll(edgeIndex: number, turn: number): number;
}

/**
 * Seeded rolls, generated a whole turn at a time in edge order and memoised. Turns are always
 * generated in sequence, so the value for `(edge, turn)` never depends on which rolls were read
 * first.
 *
 * @param random - The puzzle's `transmission` stream. It must not be shared with anything else.
 */
export function createSeededTransmissionRolls(
  edgeCount: number,
  random: RandomSource,
): TransmissionRolls {
  const rollsByTurn: Float64Array[] = [];
  return {
    roll(edgeIndex, turn) {
      if (turn < 0 || turn >= TRANSMISSION_TURN_LIMIT) {
        throw new RangeError(`Turn ${turn} is outside [0, ${TRANSMISSION_TURN_LIMIT})`);
      }
      while (rollsByTurn.length <= turn) {
        const turnRolls = new Float64Array(edgeCount);
        for (let index = 0; index < edgeCount; index++) turnRolls[index] = random();
        rollsByTurn.push(turnRolls);
      }
      return (rollsByTurn[turn] as Float64Array)[edgeIndex] as number;
    },
  };
}

/** Rolls from an explicit table, `rollTable[edgeIndex][turn]`. For hand-built test fixtures. */
export function createTableTransmissionRolls(
  rollTable: readonly (readonly number[])[],
): TransmissionRolls {
  return {
    roll(edgeIndex, turn) {
      const value = rollTable[edgeIndex]?.[turn];
      if (value === undefined) throw new RangeError(`No roll for edge ${edgeIndex}, turn ${turn}`);
      return value;
    },
  };
}
