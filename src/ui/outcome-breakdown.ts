import type { OutcomeCounts } from '../engine';
import type { Messages } from '../i18n/messages';
import { CONTAINED_THRESHOLD_PERCENT, verdictForScore, type Verdict } from '../verdict';

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

/**
 * Shows the verdict word for a score in the page's language; `data-verdict` (`contained` or
 * `spread`, whatever the language) drives its colour.
 */
export function renderVerdict(
  element: HTMLElement,
  score: number,
  verdicts: Messages['verdicts'],
): void {
  const verdict = verdictForScore(score);
  element.textContent = verdicts[verdict];
  element.dataset['verdict'] = verdict.toLowerCase();
}

/**
 * States how the verdict is earned, in the verdict's own words:
 * "**Contained**: 70% or more saved. **Spread**: below 70%." in English. Built from
 * `CONTAINED_THRESHOLD_PERCENT`, so the rule and the verdict cannot disagree.
 */
export function renderVerdictRule(
  element: HTMLElement,
  text: Pick<Messages, 'verdicts' | 'verdictRule'>,
): void {
  const clause = (verdict: Verdict, condition: string): HTMLElement => {
    const label = document.createElement('strong');
    label.textContent = text.verdicts[verdict];
    const span = document.createElement('span');
    span.append(label, condition);
    return span;
  };
  element.replaceChildren(
    clause('Contained', text.verdictRule.contained(CONTAINED_THRESHOLD_PERCENT)),
    text.verdictRule.separator,
    clause('Spread', text.verdictRule.spread(CONTAINED_THRESHOLD_PERCENT)),
  );
}
