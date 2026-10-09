import {
  applyTap,
  computeForceLayout,
  countOutcomes,
  createStreamRandom,
  isTappable,
  layoutBoundsFor,
  scorePercent,
  type GameState,
  type GameStep,
  type Puzzle,
} from '../engine';
import type { Messages } from '../i18n/messages';
import { verdictForScore } from '../verdict';
import { createBoard, type Board } from './board';
import { renderVerdict } from './outcome-breakdown';
import type { Toast } from './toast';

/** The page elements a game session drives. */
export interface GameSessionElements {
  readonly boardContainer: HTMLElement;
  readonly outbreakBanner: HTMLElement;
  readonly phaseLabel: HTMLElement;
  readonly counter: HTMLElement;
  readonly counterSecondary: HTMLElement;
  readonly instruction: HTMLElement;
  readonly toolbarResultsButton: HTMLButtonElement;
  readonly announcer: HTMLElement;
}

/** Display preferences a session applies live. */
export interface GameDisplayOptions {
  readonly reduceMotion: boolean;
}

export interface GameSessionOptions {
  readonly puzzle: Puzzle;
  readonly initialState: GameState;
  readonly elements: GameSessionElements;
  readonly display: GameDisplayOptions;
  readonly toast: Toast;
  /** The page's language. */
  readonly messages: Pick<Messages, 'game' | 'verdicts'>;
  /** Called after every legal move, before its animation; persist here. */
  readonly onMove: (step: GameStep) => void;
  /** Called once the final move's animation has finished. */
  readonly onGameEnded: (state: GameState) => void;
  /** Called when the player asks for results from the toolbar after the game ended. */
  readonly onShowResults: () => void;
}

/** A playable game bound to the page: board, toolbar, banner and announcements. */
export interface GameSession {
  /** The state after the latest move, even while its animation is still playing. */
  getState(): GameState;
  setDisplayOptions(display: GameDisplayOptions): void;
}

const BANNER_DURATION = 1800;

/** Mounts a game on the page and starts accepting taps. */
export function mountGameSession(options: GameSessionOptions): GameSession {
  const { puzzle, elements, toast } = options;
  const text = options.messages.game;
  let state = options.initialState;
  let bannerTimer: number | undefined;
  const layoutBounds = layoutBoundsFor(puzzle.config.nodeCount);
  const board: Board = createBoard(
    {
      container: elements.boardContainer,
      puzzle,
      layout: computeForceLayout(
        puzzle.graph,
        createStreamRandom(puzzle.seedKey, 'layout'),
        layoutBounds,
      ),
      layoutBounds,
      reduceMotion: options.display.reduceMotion,
      text,
      onNodeActivate: (node) => {
        void handleActivate(node);
      },
    },
    state,
  );

  elements.toolbarResultsButton.addEventListener('click', options.onShowResults);
  updateToolbar();

  async function handleActivate(node: number): Promise<void> {
    if (!isTappable(puzzle, state, node)) {
      explainUntappable(node);
      return;
    }
    const step = applyTap(puzzle, state, node);
    state = step.state;
    options.onMove(step);
    await board.animateStep(step);
    updateToolbar();
    announce(step);
    if (step.events.some((event) => event.kind === 'outbreak-started')) {
      showOutbreakBanner();
      board.highlightIndexPatients(state.indexPatients);
    }
    if (step.events.some((event) => event.kind === 'ended')) options.onGameEnded(state);
  }

  function explainUntappable(node: number): void {
    const status = state.nodeStatuses[node];
    if (state.phase === 'ended') return;
    if (status === 'infected') toast.show(text.alreadyInfected);
    else if (state.phase === 'vaccinate' && puzzle.isRefuser[node] === true)
      toast.show(text.refusesVaccines);
  }

  function updateToolbar(): void {
    const { phaseLabel, counter, counterSecondary, instruction, toolbarResultsButton } = elements;
    phaseLabel.dataset['phase'] = state.phase;
    toolbarResultsButton.hidden = state.phase !== 'ended';
    counterSecondary.textContent = '';
    if (state.phase === 'vaccinate') {
      phaseLabel.textContent = text.phaseVaccinate;
      counter.textContent = text.vaccinesLeft(state.vaccinesRemaining);
      instruction.textContent = text.vaccinateInstruction(puzzle.config.vaccineCount);
    } else if (state.phase === 'quarantine') {
      const { infected } = countOutcomes(state);
      phaseLabel.textContent = text.phaseQuarantine;
      counter.textContent = text.quarantinedCount(state.quarantineCount);
      counterSecondary.textContent = text.infectedCount(infected);
      instruction.textContent = text.quarantineInstruction;
    } else {
      const score = scorePercent(countOutcomes(state));
      renderVerdict(phaseLabel, score, options.messages.verdicts);
      counter.textContent = text.percentSaved(score);
      instruction.textContent = text.endedInstruction;
    }
  }

  function announce(step: GameStep): void {
    const messages: string[] = [];
    for (const event of step.events) {
      if (event.kind === 'vaccinated') {
        messages.push(text.announceVaccinated(event.node + 1, state.vaccinesRemaining));
      } else if (event.kind === 'outbreak-started') {
        messages.push(text.announceOutbreak(event.indexPatients.map((node) => node + 1)));
      } else if (event.kind === 'quarantined') {
        messages.push(text.announceQuarantined(event.node + 1));
      } else if (event.kind === 'spread') {
        messages.push(text.announceSpread(event.turn + 1, event.transmissions.length));
      } else {
        const score = scorePercent(countOutcomes(state));
        messages.push(text.announceEnded(verdictForScore(score), score));
      }
    }
    elements.announcer.textContent = messages.join(' ');
  }

  function showOutbreakBanner(): void {
    window.clearTimeout(bannerTimer);
    elements.outbreakBanner.hidden = false;
    bannerTimer = window.setTimeout(() => {
      elements.outbreakBanner.hidden = true;
    }, BANNER_DURATION);
  }

  return {
    getState: () => state,
    setDisplayOptions(display) {
      board.setReduceMotion(display.reduceMotion);
      elements.boardContainer.classList.toggle('board--reduced-motion', display.reduceMotion);
    },
  };
}
