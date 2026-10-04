import type { OutcomeCounts } from '../engine';

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

/** One line comparing a score with par, e.g. `Par 83% · 5 points below par`. */
export function describeParComparison(score: number, par: number): string {
  if (score > par) return `Par ${par}% · You beat par!`;
  if (score === par) return `Par ${par}% · You matched par.`;
  const gap = par - score;
  return `Par ${par}% · ${gap} ${gap === 1 ? 'point' : 'points'} below par`;
}
