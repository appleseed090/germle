import { describe, expect, it } from 'vitest';
import { createMulberry32 } from './random';
import { createSeededTransmissionRolls } from './transmission';

describe('createSeededTransmissionRolls', () => {
  it('returns the same roll for (edge, turn) whatever order rolls are read in', () => {
    const forwards = createSeededTransmissionRolls(10, createMulberry32(5));
    const backwards = createSeededTransmissionRolls(10, createMulberry32(5));
    const forwardValues: number[] = [];
    for (let turn = 0; turn < 20; turn++) {
      for (let edge = 0; edge < 10; edge++) forwardValues.push(forwards.roll(edge, turn));
    }
    const backwardValues: number[] = [];
    for (let turn = 19; turn >= 0; turn--) {
      for (let edge = 9; edge >= 0; edge--) backwardValues.unshift(backwards.roll(edge, turn));
    }
    expect(backwardValues).toEqual(forwardValues);
  });

  it('lays rolls out turn by turn in edge order', () => {
    const rolls = createSeededTransmissionRolls(3, createMulberry32(8));
    const stream = createMulberry32(8);
    const expected = Array.from({ length: 6 }, () => stream());
    expect([
      rolls.roll(0, 0),
      rolls.roll(1, 0),
      rolls.roll(2, 0),
      rolls.roll(0, 1),
      rolls.roll(1, 1),
      rolls.roll(2, 1),
    ]).toEqual(expected);
  });

  it('only covers turns 0 to 199', () => {
    const rolls = createSeededTransmissionRolls(2, createMulberry32(1));
    expect(() => rolls.roll(0, 199)).not.toThrow();
    expect(() => rolls.roll(0, 200)).toThrow(RangeError);
    expect(() => rolls.roll(0, -1)).toThrow(RangeError);
  });
});
