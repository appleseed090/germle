import type { OutcomeCounts } from './engine';

/** Everything the share card shows about a finished daily game. */
export interface ShareableResult {
  readonly puzzleNumber: number;
  readonly score: number;
  readonly counts: OutcomeCounts;
  /** The solver's score for the same puzzle, when known. */
  readonly par?: number;
}

/**
 * Squares for the share bar, one per outcome. They differ in fill pattern, not just colour, so
 * the bar reads correctly in monochrome. None of them has an emoji presentation.
 */
export const SHARE_SQUARES = Object.freeze({
  vaccinated: '▣',
  quarantined: '▨',
  untouched: '□',
  infected: '■',
});

const SHARE_BAR_LENGTH = 10;
const SHARE_DOMAIN = 'germle.com';

/**
 * The three-line share text:
 *
 * ```
 * Germle #12 · 78% saved · par 83%
 * ▣▨▨□□□□□■■
 * germle.com
 * ```
 *
 * The par suffix is left out when par is unknown. The first line's format is a public contract
 * (people paste it, tests match it); change it deliberately.
 */
export function buildShareText(result: ShareableResult): string {
  const parSuffix = result.par === undefined ? '' : ` · par ${result.par}%`;
  return [
    `Germle #${result.puzzleNumber} · ${result.score}% saved${parSuffix}`,
    buildShareBar(result.counts),
    SHARE_DOMAIN,
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

/** How the share text reached the player. `manual` means they must copy it themselves. */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'manual';

/** The narrow slice of `navigator` that sharing needs, so tests can pass a fake. */
export interface ShareCapabilities {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly clipboard?: Pick<Clipboard, 'writeText'>;
}

/**
 * Offers the text on the native share sheet when one exists, otherwise copies it to the
 * clipboard. A share sheet that fails for any reason other than the player dismissing it falls
 * back to the clipboard. Never throws.
 */
export async function shareOrCopy(
  text: string,
  capabilities: ShareCapabilities,
): Promise<ShareOutcome> {
  if (capabilities.share !== undefined) {
    try {
      await capabilities.share({ text });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  if (capabilities.clipboard !== undefined) {
    try {
      await capabilities.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'manual';
    }
  }
  return 'manual';
}
