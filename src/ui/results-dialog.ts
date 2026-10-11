import type { CommunityStanding } from '../community-api';
import { formatCountdown } from '../countdown';
import { buildShareText, copyShareText, type ShareableResult } from '../share';
import { histogramBand, histogramBandLabel } from '../score-bands';
import type { PlayerStats } from '../stats';
import { bindCommunityComparison } from './community-comparison';
import { openDialog, wireDialog } from './dialogs';
import { requireElement } from './dom';
import { renderOutcomeBreakdown, renderVerdict } from './outcome-breakdown';

/** What both kinds of results dialog offer. */
interface ResultsDialog {
  open(): void;
  /**
   * Shows how a score compares with everyone who played the puzzle, or hides the comparison
   * for `undefined` or too few players.
   */
  showCommunity(standing: CommunityStanding | undefined, score: number): void;
}

/** The results and statistics dialog of today's game. */
export interface DailyResultsDialog extends ResultsDialog {
  /** Shows today's result (or the "finish first" note when `undefined`) and the stats. */
  update(result: ShareableResult | undefined, stats: PlayerStats): void;
}

/** The results dialog of a past puzzle played from the archive: no countdown, no stats. */
export interface ArchiveResultsDialog extends ResultsDialog {
  /** Shows the result, or the "finish first" note when `undefined`. */
  update(result: ShareableResult | undefined): void;
}

/**
 * Binds the dialog markup in the page shell for today's game. Share copies the result to the
 * clipboard and says so in the dialog's own status line: the page's toast would sit behind the
 * modal dialog.
 *
 * @param nextPuzzleAt - When the next daily puzzle unlocks; after that the countdown is replaced
 *   by a link to it, for pages left open past midnight.
 */
export function createResultsDialog(nextPuzzleAt: Date): DailyResultsDialog {
  const { dialog, showResult, showCommunity } = bindResultSummary();
  const countdown = requireElement('countdown', HTMLElement);
  const countdownLine = requireElement('countdown-line', HTMLElement);
  const newPuzzleReady = requireElement('new-puzzle-ready', HTMLElement);
  const played = requireElement('stat-played', HTMLElement);
  const streak = requireElement('stat-streak', HTMLElement);
  const best = requireElement('stat-best', HTMLElement);
  const histogram = requireElement('histogram', HTMLOListElement);
  let countdownTimer: number | undefined;

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
    showCommunity,
    update(result, stats) {
      showResult(result);
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

/**
 * Binds the same dialog markup for a past puzzle: the countdown, statistics and Play past puzzles
 * button are hidden, and links to more past puzzles and today's take the countdown's place.
 */
export function createArchiveResultsDialog(): ArchiveResultsDialog {
  const { dialog, showResult, showCommunity } = bindResultSummary();
  for (const id of ['countdown-line', 'new-puzzle-ready', 'stats', 'results-archive-button'])
    requireElement(id, HTMLElement).hidden = true;
  requireElement('archive-links', HTMLElement).hidden = false;
  requireElement('result-pending', HTMLElement).textContent =
    'Finish this puzzle to see your score.';
  return {
    open() {
      openDialog(dialog);
    },
    showCommunity,
    update(result) {
      showResult(result);
    },
  };
}

/** The parts both kinds of results share: score, verdict, breakdown, Share and the community. */
function bindResultSummary(): {
  readonly dialog: HTMLDialogElement;
  readonly showResult: (result: ShareableResult | undefined) => void;
  readonly showCommunity: ResultsDialog['showCommunity'];
} {
  const dialog = requireElement('results-dialog', HTMLDialogElement);
  const title = requireElement('results-title', HTMLElement);
  const summary = requireElement('result-summary', HTMLElement);
  const pending = requireElement('result-pending', HTMLElement);
  const score = requireElement('result-score', HTMLElement);
  const verdict = requireElement('result-verdict', HTMLElement);
  const breakdownBar = requireElement('breakdown-bar', HTMLElement);
  const breakdownLegend = requireElement('breakdown-legend', HTMLElement);
  const shareButton = requireElement('share-button', HTMLButtonElement);
  const shareStatus = requireElement('share-status', HTMLElement);
  const shareFallback = requireElement('share-fallback', HTMLElement);
  const shareFallbackText = requireElement('share-fallback-text', HTMLTextAreaElement);
  let shareText: string | undefined;

  wireDialog(dialog);

  shareButton.addEventListener('click', () => {
    if (shareText === undefined) return;
    const text = shareText;
    shareStatus.textContent = '';
    const clipboard = 'clipboard' in navigator ? navigator.clipboard : undefined;
    void copyShareText(text, clipboard).then((outcome) => {
      shareStatus.textContent = outcome === 'copied' ? 'Copied to clipboard' : '';
      if (outcome === 'manual') {
        shareFallback.hidden = false;
        shareFallbackText.value = text;
        shareFallbackText.focus();
        shareFallbackText.select();
      }
    });
  });

  return {
    dialog,
    showCommunity: bindCommunityComparison(),
    showResult(result) {
      summary.hidden = result === undefined;
      pending.hidden = result !== undefined;
      shareFallback.hidden = true;
      shareStatus.textContent = '';
      if (result !== undefined) {
        title.textContent = `Germle #${result.puzzleNumber}`;
        score.textContent = `${result.score}%`;
        renderVerdict(verdict, result.score);
        renderOutcomeBreakdown(breakdownBar, breakdownLegend, result.counts);
        shareText = buildShareText(result);
      }
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
    label.textContent = histogramBandLabel(band);
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
