import { describe, expect, it } from 'vitest';
import {
  createMulberry32,
  createStreamRandom,
  deriveStreamSeed,
  hashStringFnv1a32,
  shuffledCopy,
} from './random';

describe('hashStringFnv1a32', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(hashStringFnv1a32('')).toBe(0x811c9dc5);
    expect(hashStringFnv1a32('a')).toBe(0xe40c292c);
    expect(hashStringFnv1a32('foobar')).toBe(0xbf9cf968);
  });
});

describe('deriveStreamSeed', () => {
  it('hashes germle:v1:<seedKey>:<streamName>', () => {
    expect(deriveStreamSeed('17', 'graph')).toBe(hashStringFnv1a32('germle:v1:17:graph'));
    expect(deriveStreamSeed('17', 'transmission')).toBe(
      hashStringFnv1a32('germle:v1:17:transmission'),
    );
  });

  it('gives every stream of every puzzle its own seed', () => {
    const seeds = new Set<number>();
    const streams = ['graph', 'layout', 'refusers', 'outbreaks', 'transmission'] as const;
    for (let puzzleNumber = 1; puzzleNumber <= 1000; puzzleNumber++) {
      for (const stream of streams) seeds.add(deriveStreamSeed(String(puzzleNumber), stream));
    }
    expect(seeds.size).toBe(5000);
  });
});

describe('createMulberry32', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const first = createMulberry32(12345);
    const second = createMulberry32(12345);
    const other = createMulberry32(12346);
    const firstValues = Array.from({ length: 50 }, () => first());
    expect(Array.from({ length: 50 }, () => second())).toEqual(firstValues);
    expect(Array.from({ length: 50 }, () => other())).not.toEqual(firstValues);
  });

  it('stays in [0, 1) with a roughly uniform mean', () => {
    const random = createStreamRandom('uniformity', 'graph');
    let sum = 0;
    const sampleCount = 100_000;
    for (let index = 0; index < sampleCount; index++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      sum += value;
    }
    expect(sum / sampleCount).toBeCloseTo(0.5, 2);
  });
});

describe('shuffledCopy', () => {
  it('returns a permutation without touching the input', () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const shuffled = shuffledCopy(items, createMulberry32(7));
    expect(items).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(shuffled.slice().sort((left, right) => left - right)).toEqual(items);
  });

  it('keeps the order when every draw is just below 1', () => {
    expect(shuffledCopy([3, 1, 4, 1, 5], () => 0.99)).toEqual([3, 1, 4, 1, 5]);
  });
});
