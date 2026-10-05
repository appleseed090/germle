import '../styles/main.css';
import { nextPuzzleStart } from '../countdown';
import {
  DAILY_PUZZLE_CONFIG,
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
import type { ShareableResult } from '../share';
import { computePlayerStats } from '../stats';
import { browserLocalStorage, createGameStorage } from '../storage';
import { openDialog, wireDialog } from '../ui/dialogs';
import { requireElement } from '../ui/dom';
import { mountGameSession } from '../ui/game-session';
import { createResultsDialog } from '../ui/results-dialog';
import { connectSettingsDialog, displayOptionsFor } from '../ui/settings-dialog';
import { createToast } from '../ui/toast';

const RESULTS_DELAY_AFTER_END = 700;

const storage = createGameStorage(browserLocalStorage());
const today = localCalendarDate(new Date());
// A device clock set before launch still gets a playable puzzle: #1.
const puzzleNumber = Math.max(1, puzzleNumberForDate(today));
const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, dailySeedKey(puzzleNumber));
const savedProgress = storage.loadDailyProgress();
const restoredState =
  savedProgress?.puzzleNumber === puzzleNumber
    ? replayMoves(puzzle, savedProgress.moves)
    : undefined;
const initialState = restoredState ?? startGame(puzzle).state;

const toast = createToast(requireElement('toast', HTMLElement));
const resultsDialog = createResultsDialog(toast, nextPuzzleStart(today));
const howToPlayDialog = requireElement('how-to-play-dialog', HTMLDialogElement);
wireDialog(howToPlayDialog);
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
    storage.saveDailyProgress({ puzzleNumber, moves: step.state.moves });
    if (step.state.phase === 'ended') {
      const counts = countOutcomes(step.state);
      storage.saveResult(puzzleNumber, { score: scorePercent(counts), counts });
    }
  },
  onGameEnded: (state) => {
    refreshResults(state);
    window.setTimeout(() => {
      resultsDialog.open();
    }, RESULTS_DELAY_AFTER_END);
  },
  onShowResults: () => {
    resultsDialog.open();
  },
});

function refreshResults(state: GameState): void {
  let result: ShareableResult | undefined;
  if (state.phase === 'ended') {
    const counts = countOutcomes(state);
    result = { puzzleNumber, score: scorePercent(counts), counts };
  }
  resultsDialog.update(result, computePlayerStats(storage.loadResults(), puzzleNumber));
}

const settingsDialog = connectSettingsDialog(storage, session);

requireElement('open-how-to-play', HTMLButtonElement).addEventListener('click', () => {
  openDialog(howToPlayDialog);
});
requireElement('open-results', HTMLButtonElement).addEventListener('click', () => {
  refreshResults(session.getState());
  resultsDialog.open();
});
requireElement('open-settings', HTMLButtonElement).addEventListener('click', () => {
  openDialog(settingsDialog);
});
howToPlayDialog.addEventListener('close', () => {
  storage.markHowToPlaySeen();
});

refreshResults(initialState);
if (initialState.phase === 'ended') resultsDialog.open();
else if (!storage.hasSeenHowToPlay()) openDialog(howToPlayDialog);
