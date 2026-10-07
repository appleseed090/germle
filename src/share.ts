import { archivePuzzlePath } from './archive';
import type { OutcomeCounts } from './engine';

/** Everything the share card shows about a finished daily game. */
export interface ShareableResult {
  readonly puzzleNumber: number;
  readonly score: number;
  readonly counts: OutcomeCounts;
  /** Played on the puzzle's own day, or later from the archive. */
  readonly playedFrom: 'daily' | 'archive';
}

/**
 * Colour square emojis for the share bar, one per outcome, in the colours of the results bar:
 * blue vaccinated, yellow quarantined, white untouched, red infected. Each is a single code point
 * with emoji presentation by default, so no variation selector is needed.
 */
export const SHARE_SQUARES = Object.freeze({
  vaccinated: '🟦',
  quarantined: '🟨',
  untouched: '⬜',
  infected: '🟥',
});

const SHARE_BAR_LENGTH = 10;
const SHARE_LINK = 'https://germle.com';

/**
 * The three-line share text:
 *
 * ```
 * Germle #12 · 78% saved
 * 🟦🟨🟨⬜⬜⬜⬜⬜🟥🟥
 * https://germle.com
 * ```
 *
 * A game played from the archive ends with a link to that puzzle instead
 * (`https://germle.com/?puzzle=12`), so it is not mistaken for today's and friends can play it.
 * The link keeps its scheme because Discord only links URLs that have one. The first line's format
 * is a public contract (people paste it, tests match it); change it deliberately.
 */
export function buildShareText(result: ShareableResult): string {
  return [
    `Germle #${result.puzzleNumber} · ${result.score}% saved`,
    buildShareBar(result.counts),
    result.playedFrom === 'daily'
      ? SHARE_LINK
      : `${SHARE_LINK}${archivePuzzlePath(result.puzzleNumber)}`,
  ].join('\n');
}

/**
 * Ten squares, each a tenth of the population, in the order vaccinated, quarantined, untouched,
 * infected. The saved/infected split rounds like the score (half up); the saved squares are then
 * shared among the three saved outcomes by largest remainder, ties going to the earlier outcome.
 */
export function buildShareBar(counts: OutcomeCounts): string {
  const total = counts.vaccinated + counts.quarantined + counts.untouched + counts.infected;
  const saved = total - counts.infected;
  const savedSquares = Math.round((saved * SHARE_BAR_LENGTH) / total);
  const savedOutcomes = [
    { square: SHARE_SQUARES.vaccinated, count: counts.vaccinated },
    { square: SHARE_SQUARES.quarantined, count: counts.quarantined },
    { square: SHARE_SQUARES.untouched, count: counts.untouched },
  ];
  const squareCounts = apportionByLargestRemainder(
    savedOutcomes.map(({ count }) => count),
    savedSquares,
  );
  const savedPart = savedOutcomes
    .map(({ square }, index) => square.repeat(squareCounts[index] ?? 0))
    .join('');
  return savedPart + SHARE_SQUARES.infected.repeat(SHARE_BAR_LENGTH - savedSquares);
}

function apportionByLargestRemainder(weights: readonly number[], seats: number): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) return weights.map(() => 0);
  const quotas = weights.map((weight) => (weight * seats) / totalWeight);
  const allocation = quotas.map((quota) => Math.floor(quota));
  let remainingSeats = seats - allocation.reduce((sum, value) => sum + value, 0);
  const byRemainder = quotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const { index } of byRemainder) {
    if (remainingSeats === 0) break;
    allocation[index] = (allocation[index] ?? 0) + 1;
    remainingSeats--;
  }
  return allocation;
}

/** Whether the share text reached the clipboard, or must be shown for the player to copy. */
export type CopyOutcome = 'copied' | 'manual';

/**
 * Copies the share text to the clipboard. Where there is no clipboard (an insecure context, an
 * old browser) or it refuses, reports `manual` so the page can show the text instead. Never
 * throws.
 */
export async function copyShareText(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined,
): Promise<CopyOutcome> {
  if (clipboard === undefined) return 'manual';
  try {
    await clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'manual';
  }
}
