import type { GameState, GameStep } from '../engine/game';
import { computeForceLayout, layoutBoundsFor } from '../engine/layout';
import { createStreamRandom } from '../engine/random';
import {
  applyTapWithRules,
  isTappableWithRules,
  predictNextDayInfections,
  replayMovesWithRules,
  startGameWithRules,
} from '../engine/rules';
import type { PreparedLevel } from '../endless/levels';
import { createBoard } from '../ui/board';
import type { Sound } from './audio';
import { element } from './dom';
import { STRINGS } from './strings';

/** What the level needs from the rest of the game. */
export interface LevelViewOptions {
  /** Element the board fills; the level adds and later removes its own children. */
  readonly stage: HTMLElement;
  readonly prepared: PreparedLevel;
  readonly reduceMotion: boolean;
  /** Show the one-line hint for each phase (the first level of a first run). */
  readonly showHints: boolean;
  readonly sound: Sound;
  readonly showToast: (message: string) => void;
  readonly announce: (message: string) => void;
  /** Called after every move's animation, and after an undo, with what is now shown. */
  readonly onStateShown: (state: GameState, undoChargesLeft: number) => void;
  /** Called once, after the final move's animation. */
  readonly onEnded: (state: GameState) => void;
}

/** One level on screen. */
export interface LevelView {
  getState(): GameState;
  /** Undo charges left this level. */
  undoChargesLeft(): number;
  /** Takes back the last move, if a charge is left and the level is still going. */
  undo(): void;
  /** Ignores taps while true (menus, ads). */
  setInputBlocked(blocked: boolean): void;
  setReduceMotion(enabled: boolean): void;
  /** Removes the board and everything the level added to the stage. */
  destroy(): void;
}

const BANNER_MILLISECONDS = 1800;

/** Mounts a level's board on the stage and starts accepting taps. */
export function mountLevel(options: LevelViewOptions): LevelView {
  const { stage, prepared, sound } = options;
  const { puzzle, rules } = prepared;
  let state = startGameWithRules(puzzle, rules).state;
  let undoCharges = prepared.undoCharges;
  let inputBlocked = false;
  let ended = false;
  let bannerTimer: number | undefined;
  let atRiskCount = 0;

  const boardContainer = element('div', { className: 'board portal-board' });
  const banner = element('p', { className: 'outbreak-banner', text: STRINGS.board.outbreak });
  banner.hidden = true;
  const hint = element('p', { className: 'portal-hint', attributes: { 'aria-hidden': 'true' } });
  hint.hidden = true;
  boardContainer.append(banner);
  stage.append(boardContainer, hint);
  boardContainer.classList.toggle('board--reduced-motion', options.reduceMotion);

  const layoutBounds = layoutBoundsFor(puzzle.config.nodeCount);
  const board = createBoard(
    {
      container: boardContainer,
      puzzle,
      layout: computeForceLayout(
        puzzle.graph,
        createStreamRandom(puzzle.seedKey, 'layout'),
        layoutBounds,
      ),
      layoutBounds,
      reduceMotion: options.reduceMotion,
      onNodeActivate: (node) => {
        void handleActivate(node);
      },
    },
    state,
  );
  const nodeGroups = new Map<number, SVGGElement>();
  for (const group of boardContainer.querySelectorAll<SVGGElement>('[data-node-id]'))
    nodeGroups.set(Number(group.dataset['nodeId']), group);

  /**
   * Marks what the classic board cannot know: known index patients (Early Warning) cannot be
   * vaccinated, and Contact Tracing rings the people tomorrow's spread reaches. Runs after the
   * board draws, since the board resets its own classes then.
   */
  function decorate(): void {
    const atRisk = new Set(
      prepared.contactTracing ? predictNextDayInfections(puzzle, rules, state) : [],
    );
    const knownPatients = new Set(state.phase === 'vaccinate' ? state.indexPatients : []);
    for (const [node, group] of nodeGroups) {
      const isKnownPatient = knownPatients.has(node);
      group.classList.toggle('node--known-patient', isKnownPatient);
      group.classList.toggle('node--at-risk', atRisk.has(node));
      if (isKnownPatient) {
        group.classList.remove('node--tappable');
        group.dataset['tappable'] = 'false';
        group.setAttribute('aria-disabled', 'true');
      }
    }
    atRiskCount = atRisk.size;
  }

  function updateHint(): void {
    if (!options.showHints || ended) {
      hint.hidden = true;
      return;
    }
    const tapsThisPhase = state.phase === 'vaccinate' ? state.moves.length : state.quarantineCount;
    hint.textContent =
      state.phase === 'vaccinate' ? STRINGS.hints.vaccinate : STRINGS.hints.quarantine;
    hint.hidden = state.phase === 'ended' || tapsThisPhase > 0;
  }

  function showState(): void {
    decorate();
    updateHint();
    options.onStateShown(state, undoCharges);
  }

  async function handleActivate(node: number): Promise<void> {
    if (inputBlocked || ended) return;
    if (!isTappableWithRules(puzzle, state, node)) {
      explainUntappable(node);
      return;
    }
    const step = applyTapWithRules(puzzle, rules, state, node);
    state = step.state;
    playSounds(step);
    hint.hidden = true;
    await board.animateStep(step);
    showState();
    announce(step);
    if (step.events.some((event) => event.kind === 'outbreak-started')) {
      showOutbreakBanner();
      board.highlightIndexPatients(state.indexPatients);
    }
    if (step.events.some((event) => event.kind === 'ended')) {
      ended = true;
      options.onEnded(state);
    }
  }

  function explainUntappable(node: number): void {
    const status = state.nodeStatuses[node];
    if (state.phase === 'ended') return;
    if (status === 'infected') options.showToast(STRINGS.toasts.alreadyInfected);
    else if (state.phase === 'vaccinate' && state.indexPatients.includes(node))
      options.showToast(STRINGS.toasts.knownPatient);
    else if (state.phase === 'vaccinate' && puzzle.isRefuser[node] === true)
      options.showToast(STRINGS.toasts.refuser);
  }

  function playSounds(step: GameStep): void {
    for (const event of step.events) {
      if (event.kind === 'vaccinated') sound.play('vaccinate');
      else if (event.kind === 'quarantined') sound.play('quarantine');
      else if (event.kind === 'outbreak-started') sound.play('outbreak');
      else if (event.kind === 'spread' && event.transmissions.length > 0) sound.play('infect');
    }
  }

  function announce(step: GameStep): void {
    const messages = step.events.map((event) => {
      switch (event.kind) {
        case 'vaccinated':
          return STRINGS.announce.vaccinated(event.node + 1, state.vaccinesRemaining);
        case 'outbreak-started':
          return STRINGS.announce.outbreak(event.indexPatients.map((node) => node + 1));
        case 'quarantined':
          return STRINGS.announce.quarantined(event.node + 1);
        case 'spread':
          return STRINGS.announce.spread(event.turn + 1, event.transmissions.length);
        case 'ended':
          return '';
      }
    });
    if (atRiskCount > 0) messages.push(STRINGS.announce.atRisk(atRiskCount));
    options.announce(messages.filter((message) => message !== '').join(' '));
  }

  function showOutbreakBanner(): void {
    window.clearTimeout(bannerTimer);
    banner.hidden = false;
    bannerTimer = window.setTimeout(() => {
      banner.hidden = true;
    }, BANNER_MILLISECONDS);
  }

  if (prepared.rules.naturallyImmuneCount > 0)
    options.showToast(STRINGS.toasts.naturallyImmune(prepared.rules.naturallyImmuneCount));
  if (state.indexPatients.length > 0) board.highlightIndexPatients(state.indexPatients);
  showState();
  if (state.phase === 'ended') {
    ended = true;
    options.onEnded(state);
  }

  return {
    getState: () => state,
    undoChargesLeft: () => undoCharges,
    undo() {
      if (undoCharges === 0 || ended || inputBlocked || state.moves.length === 0) return;
      const previous = replayMovesWithRules(puzzle, rules, state.moves.slice(0, -1));
      if (previous === undefined) return;
      undoCharges -= 1;
      state = previous;
      board.render(state);
      showState();
      options.showToast(STRINGS.toasts.undone);
    },
    setInputBlocked(blocked) {
      inputBlocked = blocked;
      boardContainer.classList.toggle('portal-board--blocked', blocked);
    },
    setReduceMotion(enabled) {
      board.setReduceMotion(enabled);
      boardContainer.classList.toggle('board--reduced-motion', enabled);
    },
    destroy() {
      window.clearTimeout(bannerTimer);
      boardContainer.remove();
      hint.remove();
    },
  };
}
