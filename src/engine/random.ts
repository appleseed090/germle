/** A stream of uniformly distributed numbers in `[0, 1)`. Each call advances the stream. */
export type RandomSource = () => number;

/**
 * The independent random streams a puzzle draws from. Each stream has its own seed, so adding or
 * removing draws in one stream never changes the values another stream produces.
 */
export type SeedStreamName = 'graph' | 'layout' | 'refusers' | 'outbreaks' | 'transmission';

const SEED_NAMESPACE = 'germle:v1';

/**
 * 32-bit FNV-1a hash over the string's UTF-16 code units. Seed keys are ASCII, so this equals
 * FNV-1a over their UTF-8 bytes.
 *
 * @returns An unsigned 32-bit integer.
 */
export function hashStringFnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Seed for one stream of one puzzle: the FNV-1a hash of `germle:v1:<seedKey>:<streamName>`.
 * For the daily puzzle the seed key is the puzzle number in decimal.
 *
 * Changing this derivation changes every puzzle ever published; treat it as a frozen format.
 */
export function deriveStreamSeed(seedKey: string, streamName: SeedStreamName): number {
  return hashStringFnv1a32(`${SEED_NAMESPACE}:${seedKey}:${streamName}`);
}

/**
 * Mulberry32, a small 32-bit PRNG by Tommy Ettinger. Fast, with a 2^32 period, which is plenty
 * for a few thousand draws per puzzle.
 *
 * @param seed - Any number; only its low 32 bits are used.
 */
export function createMulberry32(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: the seeded stream for one puzzle's named stream. */
export function createStreamRandom(seedKey: string, streamName: SeedStreamName): RandomSource {
  return createMulberry32(deriveStreamSeed(seedKey, streamName));
}

/** Uniform integer in `[0, exclusiveUpperBound)`. */
export function randomIntegerBelow(random: RandomSource, exclusiveUpperBound: number): number {
  return Math.floor(random() * exclusiveUpperBound);
}

/**
 * Durstenfeld shuffle of a copy of `items`, walking from the last index down. With a stream that
 * always returns values just below 1 it leaves the order unchanged, which tests rely on.
 */
export function shuffledCopy<Item>(items: readonly Item[], random: RandomSource): Item[] {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = randomIntegerBelow(random, index + 1);
    const current = result[index] as Item;
    result[index] = result[swapIndex] as Item;
    result[swapIndex] = current;
  }
  return result;
}
