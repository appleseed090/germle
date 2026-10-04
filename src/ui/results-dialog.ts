import { formatCountdown } from '../countdown';
import {
  buildShareText,
  shareOrCopy,
  type ShareCapabilities,
  type ShareableResult,
} from '../share';
import { histogramBand, type PlayerStats } from '../stats';
import { openDialog, wireDialog } from './dialogs';
import { requireElement } from './dom';
import { describeParComparison, renderOutcomeBreakdown } from './outcome-breakdown';
import type { Toast } from './toast';

/** The results and statistics dialog of the daily page. */
export interface ResultsDialog {
  open(): void;
  /** Shows today's result (or the "finish first" note when `undefined`) and the stats. */
  update(result: ShareableResult | undefined, stats: PlayerStats): void;
}

/**
 * Binds the dialog markup in the page shell.
 *
 * @param nextPuzzleAt - When the next daily puzzle unlocks; after that the countdown is replaced
 *   by a link to it, for pages left open past midnight.
 */
export function createResultsDialog(toast: Toast, nextPuzzleAt: Date): ResultsDialog {
  const dialog = requireElement('results-dialog', HTMLDialogElement);
  const title = requireElement('results-title', HTMLElement);
  const summary = requireElement('result-summary', HTMLElement);
  const pending = requireElement('result-pending', HTMLElement);
  const score = requireElement('result-score', HTMLElement);
  const parLine = requireElement('result-par', HTMLElement);
  const breakdownBar = requireElement('breakdown-bar', HTMLElement);
  const breakdownLegend = requireElement('breakdown-legend', HTMLElement);
  const sharePreview = requireElement('share-preview', HTMLElement);
  const shareButton = requireElement('share-button', HTMLButtonElement);
  const shareFallback = requireElement('share-fallback', HTMLElement);
  const shareFallbackText = requireElement('share-fallback-text', HTMLTextAreaElement);
  const countdown = requireElement('countdown', HTMLElement);
  const countdownLine = requireElement('countdown-line', HTMLElement);
  const newPuzzleReady = requireElement('new-puzzle-ready', HTMLElement);
  const played = requireElement('stat-played', HTMLElement);
  const streak = requireElement('stat-streak', HTMLElement);
  const best = requireElement('stat-best', HTMLElement);
  const histogram = requireElement('histogram', HTMLOListElement);
  let shareText: string | undefined;
  let countdownTimer: number | undefined;

  wireDialog(dialog);

  shareButton.addEventListener('click', () => {
    if (shareText === undefined) return;
    const text = shareText;
    void shareOrCopy(text, browserShareCapabilities()).then((outcome) => {
      if (outcome === 'copied') toast.show('Copied to clipboard');
      if (outcome === 'manual') {
        shareFallback.hidden = false;
        shareFallbackText.value = text;
        shareFallbackText.focus();
        shareFallbackText.select();
      }
    });
  });

  const renderCountdown = (): void => {
    const remaining = nextPuzzleAt.getTime() - Date.now();
    countdownLine.hidden = remaining <= 0;
    newPuzzleReady.hidden = remaining > 0;
    countdown.textContent = formatCountdown(remaining);
  };
  dialog.addEventListener('close', () => {
    window.clearInterval(countdownTimer);
  });

  return {
    open() {
      renderCountdown();
      window.clearInterval(countdownTimer);
      countdownTimer = window.setInterval(renderCountdown, 1000);
      openDialog(dialog);
    },
    update(result, stats) {
      summary.hidden = result === undefined;
      pending.hidden = result !== undefined;
      shareFallback.hidden = true;
      if (result !== undefined) {
        title.textContent = `Germle #${result.puzzleNumber}`;
        score.textContent = `${result.score}%`;
        parLine.hidden = result.par === undefined;
        if (result.par !== undefined)
          parLine.textContent = describeParComparison(result.score, result.par);
        renderOutcomeBreakdown(breakdownBar, breakdownLegend, result.counts);
        shareText = buildShareText(result);
        sharePreview.textContent = shareText;
      }
      played.textContent = String(stats.played);
      streak.textContent = String(stats.currentStreak);
      best.textContent = stats.bestScore === undefined ? '–' : `${stats.bestScore}%`;
      renderHistogram(
        histogram,
        stats,
        result === undefined ? undefined : histogramBand(result.score),
      );
    },
  };
}

function renderHistogram(
  list: HTMLOListElement,
  stats: PlayerStats,
  highlightedBand: number | undefined,
): void {
  const largestCount = Math.max(1, ...stats.histogram);
  const rows = stats.histogram.map((count, band) => {
    const row = document.createElement('li');
    row.className = 'histogram-row';
    if (band === highlightedBand) row.classList.add('histogram-row--today');
    const label = document.createElement('span');
    label.className = 'histogram-label';
    label.textContent =
      band === stats.histogram.length - 1 ? `${band * 10}–100` : `${band * 10}–${band * 10 + 9}`;
    const track = document.createElement('span');
    track.className = 'histogram-track';
    const bar = document.createElement('span');
    bar.className = count === 0 ? 'histogram-bar histogram-bar--empty' : 'histogram-bar';
    bar.style.width = `${(count / largestCount) * 100}%`;
    bar.textContent = String(count);
    track.append(bar);
    row.append(label, track);
    return row;
  });
  list.replaceChildren(...rows);
}

function browserShareCapabilities(): ShareCapabilities {
  return {
    ...('share' in navigator ? { share: (data: ShareData) => navigator.share(data) } : {}),
    ...('clipboard' in navigator ? { clipboard: navigator.clipboard } : {}),
  };
}
