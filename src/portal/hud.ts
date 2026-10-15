import { countOutcomes, type GameState } from '../engine/game';
import { quarantinesUntilNextDay } from '../engine/rules';
import type { PreparedLevel } from '../endless/levels';
import type { RunState } from '../endless/run';
import { countUpgrades } from '../endless/upgrades';
import { button, element } from './dom';
import { STRINGS } from './strings';

/** The level's status panel: beside the board in landscape, above and below it in portrait. */
export interface Hud {
  readonly root: HTMLElement;
  /** Shows a level's state. */
  update(run: RunState, prepared: PreparedLevel, state: GameState, undoChargesLeft: number): void;
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

  return {
    root,
    update(run, prepared, state, undoChargesLeft) {
      const { nodeCount } = prepared.puzzle.config;
      const { infected } = countOutcomes(state);
      const savablePercent = Math.round((100 * (nodeCount - infected)) / nodeCount);
      const goal = prepared.passThresholdPercent;
      level.textContent = STRINGS.hud.level(run.level);
      target.textContent = STRINGS.hud.target(goal);
      meterFill.style.width = `${savablePercent}%`;
      meterMark.style.left = `${goal}%`;
      meter.classList.toggle('hud-meter--short', savablePercent < goal);
      meterCaption.textContent = STRINGS.hud.stillHealthy(savablePercent, goal);

      phase.dataset['phase'] = state.phase;
      secondary.textContent = '';
      if (state.phase === 'vaccinate') {
        phase.textContent = STRINGS.hud.vaccinate;
        counter.textContent = STRINGS.hud.vaccinesLeft(state.vaccinesRemaining);
        instruction.textContent = STRINGS.hud.instructionVaccinate;
      } else if (state.phase === 'quarantine') {
        phase.textContent = STRINGS.hud.quarantine;
        counter.textContent = STRINGS.hud.day(state.turnsElapsed + 1, state.quarantineCount);
        const leftToday = quarantinesUntilNextDay(prepared.rules, state);
        secondary.textContent =
          leftToday > 1
            ? STRINGS.hud.quarantinesLeftToday(leftToday)
            : STRINGS.hud.infected(infected);
        instruction.textContent = STRINGS.hud.instructionQuarantine;
      } else {
        phase.textContent = STRINGS.hud.done;
        counter.textContent = STRINGS.hud.infected(infected);
        instruction.textContent = STRINGS.hud.instructionDone;
      }

      undo.hidden = prepared.undoCharges === 0;
      undo.textContent = STRINGS.hud.undo(undoChargesLeft);
      undo.disabled = undoChargesLeft === 0 || state.moves.length === 0 || state.phase === 'ended';

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
    },
  };
}
