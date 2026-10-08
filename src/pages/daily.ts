import '../styles/main.css';
import { formatPuzzleDate, requestedPuzzle } from '../archive';
import { createCommunityApi, createCommunityComparison } from '../community';
import type { CommunityStanding } from '../community-api';
import { nextPuzzleStart } from '../countdown';
import {
  DAILY_PUZZLE_CONFIG,
  calendarDateForPuzzleNumber,
  countOutcomes,
  createPuzzle,
  dailySeedKey,
  localCalendarDate,
  puzzleNumberForDate,
  replayMoves,
  scorePercent,
  startGame,
  type GameState,
} from '../engine';
import { describePuzzleConfig } from '../puzzle-summary';
import type { ShareableResult } from '../share';
import { computePlayerStats } from '../stats';
import { browserLocalStorage, createGameStorage, type DailyResult } from '../storage';
import { openDialog, wireDialog } from '../ui/dialogs';
import { requireElement } from '../ui/dom';
import { mountGameSession } from '../ui/game-session';
import { renderVerdictRule } from '../ui/outcome-breakdown';
import { createArchiveResultsDialog, createResultsDialog } from '../ui/results-dialog';
import { connectSettingsDialog, displayOptionsFor } from '../ui/settings-dialog';
import { createToast } from '../ui/toast';

const RESULTS_DELAY_AFTER_END = 700;

/** Where this page's game is saved and how its results are shown: today's game or a past one. */
interface PlayedPuzzle {
  readonly puzzleNumber: number;
  readonly playedFrom: ShareableResult['playedFrom'];
  readonly savedMoves: readonly number[] | undefined;
  saveMoves(moves: readonly number[]): void;
  saveResult(result: DailyResult): void;
  openResults(): void;
  refreshResults(result: ShareableResult | undefined): void;
  showCommunity(standing: CommunityStanding | undefined, score: number): void;
}

const storage = createGameStorage(browserLocalStorage());
const today = localCalendarDate(new Date());
// A device clock set before launch still gets a playable puzzle: #1.
const todayPuzzleNumber = Math.max(1, puzzleNumberForDate(today));
const toast = createToast(requireElement('toast', HTMLElement));

const requested = requestedPuzzle(new URLSearchParams(window.location.search), todayPuzzleNumber);
if (requested.kind !== 'past' && window.location.search !== '') {
  // Keep the address bar in step with the game: a bad or future number plays today's puzzle.
  window.history.replaceState(null, '', '/');
}
if (requested.kind === 'not-out-yet')
  toast.show(`Puzzle #${requested.puzzleNumber} isn't out yet. Here's today's.`);
const played = requested.kind === 'past' ? pastPuzzle(requested.puzzleNumber) : todaysPuzzle();
const { puzzleNumber } = played;

// Every numbered puzzle is compared, today's or one from the archive; practice never is.
const community = createCommunityComparison({
  puzzleNumber,
  api: createCommunityApi((url, init) => window.fetch(url, init)),
  storage,
  createPlayerId: () => crypto.randomUUID(),
  onStanding: (standing, score) => {
    played.showCommunity(standing, score);
  },
});

const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, dailySeedKey(puzzleNumber));
const restoredState =
  played.savedMoves === undefined ? undefined : replayMoves(puzzle, played.savedMoves);
const initialState = restoredState ?? startGame(puzzle).state;

const howToPlayDialog = requireElement('how-to-play-dialog', HTMLDialogElement);
wireDialog(howToPlayDialog);
renderVerdictRule(requireElement('verdict-rule', HTMLElement));
requireElement('daily-constants', HTMLElement).textContent =
  `Every daily puzzle: ${describePuzzleConfig(DAILY_PUZZLE_CONFIG)}`;
requireElement('puzzle-label', HTMLElement).textContent = `#${puzzleNumber}`;

const session = mountGameSession({
  puzzle,
  initialState,
  display: displayOptionsFor(storage.loadSettings()),
  toast,
  elements: {
    boardContainer: requireElement('board', HTMLElement),
    outbreakBanner: requireElement('outbreak-banner', HTMLElement),
    phaseLabel: requireElement('phase-label', HTMLElement),
    counter: requireElement('counter', HTMLElement),
    counterSecondary: requireElement('counter-secondary', HTMLElement),
    instruction: requireElement('instruction', HTMLElement),
    toolbarResultsButton: requireElement('toolbar-results', HTMLButtonElement),
    announcer: requireElement('announcer', HTMLElement),
  },
  onMove: (step) => {
    played.saveMoves(step.state.moves);
    if (step.state.phase === 'ended') {
      const counts = countOutcomes(step.state);
      played.saveResult({ score: scorePercent(counts), counts });
      compareWithCommunity(step.state);
    }
  },
  onGameEnded: (state) => {
    played.refreshResults(shareableResult(state));
    window.setTimeout(() => {
      played.openResults();
    }, RESULTS_DELAY_AFTER_END);
  },
  onShowResults: () => {
    compareWithCommunity(session.getState());
    played.openResults();
  },
});

/** Shows the comparison of a finished game, cached at once and fresh when the server answers. */
function compareWithCommunity(state: GameState): void {
  if (state.phase === 'ended') community.refresh(state.moves, scorePercent(countOutcomes(state)));
}

function shareableResult(state: GameState): ShareableResult | undefined {
  if (state.phase !== 'ended') return undefined;
  const counts = countOutcomes(state);
  return { puzzleNumber, score: scorePercent(counts), counts, playedFrom: played.playedFrom };
}

function todaysPuzzle(): PlayedPuzzle {
  const resultsDialog = createResultsDialog(nextPuzzleStart(today));
  const progress = storage.loadDailyProgress();
  return {
    puzzleNumber: todayPuzzleNumber,
    playedFrom: 'daily',
    savedMoves: progress?.puzzleNumber === todayPuzzleNumber ? progress.moves : undefined,
    saveMoves: (moves) => {
      storage.saveDailyProgress({ puzzleNumber: todayPuzzleNumber, moves });
    },
    saveResult: (result) => {
      storage.saveResult(todayPuzzleNumber, result);
    },
    openResults: () => {
      resultsDialog.open();
    },
    refreshResults: (result) => {
      resultsDialog.update(result, computePlayerStats(storage.loadResults(), todayPuzzleNumber));
    },
    showCommunity: (standing, score) => {
      resultsDialog.showCommunity(standing, score);
    },
  };
}

function pastPuzzle(pastPuzzleNumber: number): PlayedPuzzle {
  const resultsDialog = createArchiveResultsDialog();
  const date = calendarDateForPuzzleNumber(pastPuzzleNumber);
  const dateElement = requireElement('archive-date', HTMLTimeElement);
  dateElement.dateTime = [date.year, date.month, date.day]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
  dateElement.textContent = formatPuzzleDate(date);
  requireElement('archive-banner', HTMLElement).hidden = false;
  document.documentElement.classList.add('playing-archive');
  document.title = `Germle #${pastPuzzleNumber} — from the archive`;
  return {
    puzzleNumber: pastPuzzleNumber,
    playedFrom: 'archive',
    savedMoves: storage.loadArchiveProgress().get(pastPuzzleNumber),
    saveMoves: (moves) => {
      storage.saveArchiveProgress(pastPuzzleNumber, moves);
    },
    saveResult: (result) => {
      storage.saveArchiveResult(pastPuzzleNumber, result);
    },
    openResults: () => {
      resultsDialog.open();
    },
    refreshResults: (result) => {
      resultsDialog.update(result);
    },
    showCommunity: (standing, score) => {
      resultsDialog.showCommunity(standing, score);
    },
  };
}

const settingsDialog = connectSettingsDialog(storage, session);

requireElement('open-how-to-play', HTMLButtonElement).addEventListener('click', () => {
  openDialog(howToPlayDialog);
});
requireElement('open-results', HTMLButtonElement).addEventListener('click', () => {
  played.refreshResults(shareableResult(session.getState()));
  compareWithCommunity(session.getState());
  played.openResults();
});
requireElement('open-settings', HTMLButtonElement).addEventListener('click', () => {
  openDialog(settingsDialog);
});
howToPlayDialog.addEventListener('close', () => {
  storage.markHowToPlaySeen();
});

played.refreshResults(shareableResult(initialState));
compareWithCommunity(initialState);
if (initialState.phase === 'ended') played.openResults();
else if (!storage.hasSeenHowToPlay()) openDialog(howToPlayDialog);
