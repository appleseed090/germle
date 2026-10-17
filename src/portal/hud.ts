import { countOutcomes, type GameState } from '../engine/game';
import { quarantinesUntilNextDay } from '../engine/rules';
import type { PreparedLevel } from '../endless/levels';
import type { LevelResult, RunState } from '../endless/run';
import { countUpgrades } from '../endless/upgrades';
import { button, element } from './dom';
import { STRINGS } from './strings';

/** The level's status panel: beside the board in landscape, above and below it in portrait. */
export interface Hud {
  readonly root: HTMLElement;
  /** Shows a level's state. */
  update(run: RunState, prepared: PreparedLevel, state: GameState, undoChargesLeft: number): void;
  /**
   * Shows a finished level from its saved result, as `update` shows it when it ends, for when a
   * run resumes on its summary or upgrade choice and no level is on screen.
   */
  showFinished(run: RunState, prepared: PreparedLevel, result: LevelResult): void;
}

export interface HudActions {
  readonly onUndo: () => void;
  readonly onMenu: () => void;
}

/** Builds the HUD; `update` fills it in. */
export function createHud(actions: HudActions): Hud {
  const level = element('h2', { className: 'hud-level' });
  const menu = button(STRINGS.hud.menu, actions.onMenu, 'portal-button portal-button--quiet');
  const target = element('p', { className: 'hud-target' });
  const meterFill = element('span', { className: 'hud-meter-fill' });
  const meterMark = element('span', { className: 'hud-meter-mark' });
  const meter = element('div', { className: 'hud-meter', attributes: { 'aria-hidden': 'true' } }, [
    meterFill,
    meterMark,
  ]);
  const meterCaption = element('p', { className: 'hud-meter-caption' });
  const phase = element('span', { className: 'phase-pill hud-phase' });
  const counter = element('span', { className: 'hud-counter' });
  const secondary = element('span', { className: 'hud-counter-secondary' });
  const instruction = element('p', { className: 'hud-instruction' });
  const undo = button('', actions.onUndo, 'portal-button portal-button--secondary hud-undo');
  const upgradesHeading = element('h3', {
    className: 'hud-upgrades-heading',
    text: STRINGS.hud.upgradesHeading,
  });
  const upgrades = element('ul', { className: 'hud-upgrades' });

  const root = element('aside', { className: 'hud', attributes: { 'aria-label': STRINGS.title } }, [
    element('div', { className: 'hud-top' }, [level, menu]),
    element('div', { className: 'hud-goal' }, [target, meter, meterCaption]),
    element('div', { className: 'hud-status' }, [phase, counter, secondary]),
    instruction,
    undo,
    element('section', { className: 'hud-upgrade-list' }, [upgradesHeading, upgrades]),
  ]);

  function showGoal(run: RunState, prepared: PreparedLevel, infected: number): void {
    const { nodeCount } = prepared.puzzle.config;
    const savablePercent = Math.round((100 * (nodeCount - infected)) / nodeCount);
    const goal = prepared.passThresholdPercent;
    level.textContent = STRINGS.hud.level(run.level);
    target.textContent = STRINGS.hud.target(goal);
    meterFill.style.width = `${savablePercent}%`;
    meterMark.style.left = `${goal}%`;
    meter.classList.toggle('hud-meter--short', savablePercent < goal);
    meterCaption.textContent = STRINGS.hud.stillHealthy(savablePercent, goal);
  }

  function showEnded(infected: number): void {
    phase.dataset['phase'] = 'ended';
    phase.textContent = STRINGS.hud.done;
    counter.textContent = STRINGS.hud.infected(infected);
    secondary.textContent = '';
    instruction.textContent = STRINGS.hud.instructionDone;
  }

  function showUpgrades(run: RunState): void {
    upgrades.replaceChildren(
      ...[...countUpgrades(run.picks)].map(([id, count]) =>
        element('li', {
          className: 'hud-upgrade',
          text: STRINGS.hud.stacks(STRINGS.upgrades[id].name, count),
          attributes: { title: STRINGS.upgrades[id].description },
        }),
      ),
    );
    if (run.picks.length === 0)
      upgrades.append(
        element('li', { className: 'hud-upgrade-empty', text: STRINGS.hud.noUpgrades }),
      );
  }

  return {
    root,
    update(run, prepared, state, undoChargesLeft) {
      const { infected } = countOutcomes(state);
      showGoal(run, prepared, infected);
      if (state.phase === 'vaccinate') {
        phase.dataset['phase'] = state.phase;
        phase.textContent = STRINGS.hud.vaccinate;
        counter.textContent = STRINGS.hud.vaccinesLeft(state.vaccinesRemaining);
        secondary.textContent = '';
        instruction.textContent =
          prepared.puzzle.config.refuserCount > 0
            ? STRINGS.hud.instructionVaccinateWithRefusers
            : STRINGS.hud.instructionVaccinate;
      } else if (state.phase === 'quarantine') {
        phase.dataset['phase'] = state.phase;
        phase.textContent = STRINGS.hud.quarantine;
        counter.textContent = STRINGS.hud.day(state.turnsElapsed + 1, state.quarantineCount);
        const leftToday = quarantinesUntilNextDay(prepared.rules, state);
        secondary.textContent =
          leftToday > 1
            ? STRINGS.hud.quarantinesLeftToday(leftToday)
            : STRINGS.hud.infected(infected);
        instruction.textContent = STRINGS.hud.instructionQuarantine;
      } else {
        showEnded(infected);
      }

      undo.hidden = prepared.undoCharges === 0;
      undo.textContent = STRINGS.hud.undo(undoChargesLeft);
      undo.disabled = undoChargesLeft === 0 || state.moves.length === 0 || state.phase === 'ended';
      showUpgrades(run);
    },
    showFinished(run, prepared, result) {
      showGoal(run, prepared, result.counts.infected);
      showEnded(result.counts.infected);
      undo.hidden = true;
      showUpgrades(run);
    },
  };
}
