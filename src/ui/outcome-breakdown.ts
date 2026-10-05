import type { OutcomeCounts } from '../engine';
import { verdictForScore } from '../verdict';

const OUTCOME_ORDER = ['vaccinated', 'quarantined', 'untouched', 'infected'] as const;

/**
 * Fills a four-segment breakdown bar and its legend (both in outcome order: vaccinated,
 * quarantined, untouched, infected) from final counts.
 */
export function renderOutcomeBreakdown(
  bar: HTMLElement,
  legend: HTMLElement,
  counts: OutcomeCounts,
): void {
  const total = OUTCOME_ORDER.reduce((sum, outcome) => sum + counts[outcome], 0);
  OUTCOME_ORDER.forEach((outcome, index) => {
    const segment = bar.children[index];
    if (segment instanceof HTMLElement) segment.style.flexGrow = String(counts[outcome] / total);
    const count = legend.children[index]?.querySelector('strong');
    if (count) count.textContent = String(counts[outcome]);
  });
}

/** Shows the verdict word for a score; `data-verdict` (`contained` or `spread`) drives its colour. */
export function renderVerdict(element: HTMLElement, score: number): void {
  const verdict = verdictForScore(score);
  element.textContent = verdict;
  element.dataset['verdict'] = verdict.toLowerCase();
}
