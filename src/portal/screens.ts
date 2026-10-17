import type { PreparedLevel } from '../endless/levels';
import type { FinishedRun } from '../endless/profile';
import { RESEARCH_CATALOG, type StartingBonusId, type UnlockId } from '../endless/research';
import type { LevelResult, RunState } from '../endless/run';
import type { EndlessSave, EndlessSettings } from '../endless/save';
import { UPGRADES, countUpgrades, isUpgradeId, type UpgradeId } from '../endless/upgrades';
import { button, element } from './dom';
import { STRINGS } from './strings';

/**
 * The overlay screens. Each builds a panel from data and callbacks and knows nothing about the
 * flow between them (that is `app.ts`). Panels are plain elements, never modal `<dialog>`s,
 * because Escape (which closes those) must not be a control on CrazyGames.
 */

function panel(
  className: string,
  heading: string,
  children: readonly (Node | null)[],
): HTMLElement {
  const headingId = `panel-${className}`;
  return element(
    'section',
    {
      className: `panel ${className}`,
      attributes: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': headingId },
    },
    [
      element('h2', {
        className: 'panel-heading',
        text: heading,
        attributes: { id: headingId, tabindex: '-1' },
      }),
      ...children,
    ],
  );
}

export interface HomeScreenActions {
  readonly onPlay: () => void;
  readonly onContinue: () => void;
  readonly onNewRun: () => void;
  readonly onResearch: () => void;
  readonly onSettings: () => void;
}

/** Title screen: one click into play, or back into a saved run. */
export function homeScreen(save: EndlessSave, actions: HomeScreenActions): HTMLElement {
  const run = save.run;
  const primary =
    run === null
      ? button(STRINGS.home.play, actions.onPlay, 'portal-button portal-button--primary')
      : button(
          STRINGS.home.continueRun(run.level),
          actions.onContinue,
          'portal-button portal-button--primary',
        );
  const best =
    save.bestRun === null
      ? null
      : element('p', {
          className: 'home-best',
          text: STRINGS.home.bestRun(save.bestRun.levelsCleared, save.bestRun.peopleSaved),
        });
  return panel('home', STRINGS.title, [
    element('p', { className: 'home-tagline', text: STRINGS.tagline }),
    primary,
    run === null ? null : button(STRINGS.home.newRun, actions.onNewRun, 'portal-button'),
    best,
    element('div', { className: 'button-row' }, [
      button(
        save.research > 0 ? STRINGS.home.researchToSpend(save.research) : STRINGS.home.research,
        actions.onResearch,
        'portal-button portal-button--secondary',
      ),
      button(STRINGS.home.settings, actions.onSettings, 'portal-button portal-button--secondary'),
    ]),
  ]);
}

/** The short card that names a level as it starts; it removes itself. */
export function levelIntroCard(prepared: PreparedLevel): HTMLElement {
  return element('div', { className: 'level-intro', attributes: { 'aria-hidden': 'true' } }, [
    element('p', { className: 'level-intro-title', text: STRINGS.intro.level(prepared.level) }),
    element('p', {
      className: 'level-intro-details',
      text: STRINGS.intro.details(
        prepared.puzzle.config.nodeCount,
        prepared.puzzle.config.indexPatientCount,
        prepared.passThresholdPercent,
      ),
    }),
  ]);
}

export interface SummaryScreenActions {
  readonly onContinue: () => void;
  readonly onSecondChance: () => void;
  readonly onEndRun: () => void;
}

/** After a level: passed or not, by how much, and what comes next. */
/**
 * A rewarded option on a screen: playable (`video`), shown disabled with a notice because the
 * player's ad blocker stops it (`blocked`), or left out because ads are off (`none`).
 */
export type RewardedOption = 'video' | 'blocked' | 'none';

/** The reroll on the upgrade choice: a free one, a rewarded one, or none. */
export type RerollOption = 'free' | RewardedOption;

export function summaryScreen(
  result: LevelResult,
  secondChance: RewardedOption,
  actions: SummaryScreenActions,
): HTMLElement {
  const { counts } = result;
  const margin = result.savedPercent - result.passThresholdPercent;
  const nearMissLine = !result.nearMiss
    ? null
    : element('p', {
        className: `summary-near-miss summary-near-miss--${result.passed ? 'passed' : 'failed'}`,
        text: result.passed ? STRINGS.summary.closeCall : STRINGS.summary.soClose(-margin),
      });
  const score = element('p', {
    className: 'summary-score',
    text: `${result.savedPercent}%`,
    attributes: { 'data-count-to': String(result.savedPercent), 'data-count-suffix': '%' },
  });
  const meterFill = element('span', { className: 'hud-meter-fill' });
  meterFill.style.width = `${result.savedPercent}%`;
  const meterMark = element('span', { className: 'hud-meter-mark' });
  meterMark.style.left = `${result.passThresholdPercent}%`;
  const meter = element(
    'div',
    {
      className: `hud-meter summary-meter${result.passed ? '' : ' hud-meter--short'}`,
      attributes: { 'aria-hidden': 'true' },
    },
    [meterFill, meterMark],
  );
  const actionsRow = result.passed
    ? [button(STRINGS.summary.continue, actions.onContinue, 'portal-button portal-button--primary')]
    : [
        // CrazyGames: the way out must look exactly like the rewarded option beside it.
        secondChance === 'none'
          ? null
          : rewardedAdButton(
              STRINGS.summary.secondChance,
              actions.onSecondChance,
              'portal-button portal-button--primary',
              secondChance === 'blocked',
            ),
        button(STRINGS.summary.endRun, actions.onEndRun, 'portal-button portal-button--primary'),
        secondChance === 'none'
          ? null
          : element('p', {
              className: 'panel-note',
              text:
                secondChance === 'blocked'
                  ? STRINGS.ads.blockedByAdblock
                  : STRINGS.summary.secondChanceNote,
            }),
      ];
  const section = panel(
    `summary summary--${result.passed ? 'passed' : 'failed'}`,
    result.passed ? STRINGS.summary.passed : STRINGS.summary.failed,
    [
      score,
      meter,
      element('p', {
        className: 'summary-detail',
        text: STRINGS.summary.saved(result.savedPercent, result.passThresholdPercent),
      }),
      nearMissLine,
      element('p', {
        className: 'summary-breakdown',
        text: STRINGS.summary.breakdown(
          counts.vaccinated,
          counts.quarantined,
          counts.untouched,
          counts.infected,
        ),
      }),
      ...actionsRow,
    ],
  );
  return section;
}

export interface ChoiceScreenActions {
  readonly onPick: (upgrade: UpgradeId, card: HTMLElement) => void;
  readonly onReroll: () => void;
  readonly onSkip: () => void;
}

/** The upgrade choice between levels: the heart of the mode. */
export function choiceScreen(
  run: RunState,
  offer: readonly UpgradeId[],
  reroll: RerollOption,
  /** Whether Research can still unlock upgrades, for when the offer comes up empty. */
  moreToUnlock: boolean,
  actions: ChoiceScreenActions,
): HTMLElement {
  const owned = countUpgrades(run.picks);
  const cards = offer.map((id, index) => {
    const card = element(
      'button',
      {
        className: `upgrade-card upgrade-card--${UPGRADES[id].rarity}`,
        attributes: { type: 'button', 'data-upgrade': id },
      },
      [
        element('span', {
          className: 'upgrade-card-rarity',
          text: STRINGS.choice.rarity[UPGRADES[id].rarity],
        }),
        element('span', { className: 'upgrade-card-name', text: STRINGS.upgrades[id].name }),
        element('span', {
          className: 'upgrade-card-description',
          text: STRINGS.upgrades[id].description,
        }),
        (owned.get(id) ?? 0) > 0
          ? element('span', {
              className: 'upgrade-card-owned',
              text: STRINGS.choice.owned(owned.get(id) ?? 0),
            })
          : null,
      ],
    );
    card.style.animationDelay = `${index * 90}ms`;
    card.addEventListener('click', () => {
      actions.onPick(id, card);
    });
    return card;
  });
  const rerollButton =
    offer.length === 0 || reroll === 'none'
      ? null
      : reroll === 'free'
        ? button(
            STRINGS.choice.rerollFree,
            actions.onReroll,
            'portal-button portal-button--secondary',
          )
        : rewardedAdButton(
            STRINGS.choice.rerollWithAd,
            actions.onReroll,
            'portal-button portal-button--secondary',
            reroll === 'blocked',
          );
  return panel('choice', STRINGS.choice.heading, [
    offer.length === 0
      ? element('p', {
          className: 'panel-note',
          text: moreToUnlock ? STRINGS.choice.nothingUnlockedLeft : STRINGS.choice.nothingLeft,
        })
      : element('div', { className: 'upgrade-cards' }, cards),
    offer.length === 0
      ? button(STRINGS.choice.skip, actions.onSkip, 'portal-button portal-button--primary')
      : rerollButton,
    rerollButton !== null && reroll === 'blocked'
      ? element('p', { className: 'panel-note', text: STRINGS.ads.blockedByAdblock })
      : null,
  ]);
}

/**
 * A button that plays a rewarded ad, marked with a video icon as CrazyGames asks. Disabled when an
 * ad blocker stops the ad; the screen then shows a notice saying so.
 */
function rewardedAdButton(
  label: string,
  onClick: () => void,
  className: string,
  blockedByAdblock: boolean,
): HTMLButtonElement {
  const created = button(label, onClick, `${className} rewarded-button`);
  created.disabled = blockedByAdblock;
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('rewarded-icon');
  const screen = document.createElementNS(svgNamespace, 'rect');
  for (const [name, value] of Object.entries({
    x: '2',
    y: '5',
    width: '20',
    height: '14',
    rx: '3',
  }))
    screen.setAttribute(name, value);
  const play = document.createElementNS(svgNamespace, 'path');
  play.setAttribute('d', 'M10 9v6l5-3z');
  icon.append(screen, play);
  created.prepend(icon);
  return created;
}

export interface RunOverScreenActions {
  readonly onPlayAgain: () => void;
  readonly onResearch: () => void;
  readonly onHome: () => void;
}

/** The end of a run: score, best, and the Research it earned. */
export function runOverScreen(
  run: RunState,
  finished: FinishedRun,
  actions: RunOverScreenActions,
): HTMLElement {
  const best = finished.save.bestRun;
  return panel('run-over', STRINGS.runOver.heading, [
    element('p', {
      className: 'run-over-levels',
      text: STRINGS.runOver.levelsCleared(run.levelsCleared),
      attributes: { 'data-count-to': String(run.levelsCleared) },
    }),
    element('p', {
      className: 'run-over-saved',
      text: STRINGS.runOver.peopleSaved(run.peopleSaved),
    }),
    finished.isNewBest
      ? element('p', {
          className: 'run-over-best run-over-best--new',
          text: STRINGS.runOver.newBest,
        })
      : best === null
        ? null
        : element('p', {
            className: 'run-over-best',
            text: STRINGS.runOver.best(best.levelsCleared),
          }),
    finished.researchEarned > 0
      ? element('p', {
          className: 'run-over-research',
          text: STRINGS.runOver.researchEarned(finished.researchEarned),
        })
      : null,
    button(STRINGS.runOver.playAgain, actions.onPlayAgain, 'portal-button portal-button--primary'),
    element('div', { className: 'button-row' }, [
      button(
        STRINGS.runOver.research,
        actions.onResearch,
        'portal-button portal-button--secondary',
      ),
      button(STRINGS.runOver.home, actions.onHome, 'portal-button portal-button--secondary'),
    ]),
  ]);
}

function unlockText(id: UnlockId): { name: string; description: string; tag: string } {
  if (isUpgradeId(id)) return { ...STRINGS.upgrades[id], tag: STRINGS.research.upgradeTag };
  return { ...STRINGS.bonuses[id satisfies StartingBonusId], tag: STRINGS.research.bonusTag };
}

/** Spending Research on new upgrades and starting bonuses. */
export function researchScreen(
  save: EndlessSave,
  actions: { readonly onBuy: (id: UnlockId) => void; readonly onBack: () => void },
): HTMLElement {
  const items = RESEARCH_CATALOG.map(({ id, cost }) => {
    const text = unlockText(id);
    const owned = save.unlocks.includes(id);
    const buy = button(
      owned ? STRINGS.research.unlocked : STRINGS.research.unlock(cost),
      () => {
        actions.onBuy(id);
      },
      'portal-button portal-button--secondary research-buy',
    );
    buy.disabled = owned || save.research < cost;
    return element('li', { className: `research-item${owned ? ' research-item--owned' : ''}` }, [
      element('span', { className: 'research-tag', text: text.tag }),
      element('span', { className: 'research-name', text: text.name }),
      element('span', { className: 'research-description', text: text.description }),
      buy,
    ]);
  });
  return panel('research', STRINGS.research.heading, [
    element('p', { className: 'panel-note', text: STRINGS.research.intro }),
    element('p', { className: 'research-balance', text: STRINGS.research.balance(save.research) }),
    element('ul', { className: 'research-list' }, items),
    button(STRINGS.research.back, actions.onBack, 'portal-button portal-button--primary'),
  ]);
}

function switchSetting(
  label: string,
  hint: string | null,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const input = element('input', {
    className: 'switch',
    attributes: { type: 'checkbox' },
  });
  input.checked = checked;
  input.addEventListener('change', () => {
    onChange(input.checked);
  });
  return element('label', { className: 'setting' }, [
    element('span', {}, [
      element('span', { className: 'setting-name', text: label }),
      hint === null ? null : element('span', { className: 'setting-hint', text: hint }),
    ]),
    input,
  ]);
}

/** Sound, animations and contact numbers; each change applies at once. */
export function settingsScreen(
  settings: EndlessSettings,
  effectiveSkipAnimations: boolean,
  actions: {
    readonly onChange: (settings: EndlessSettings) => void;
    readonly onDone: () => void;
  },
): HTMLElement {
  let current = settings;
  const change = (next: Partial<EndlessSettings>): void => {
    current = { ...current, ...next };
    actions.onChange(current);
  };
  return panel('settings', STRINGS.settings.heading, [
    switchSetting(STRINGS.settings.sound, null, settings.sound, (sound) => {
      change({ sound });
    }),
    switchSetting(STRINGS.settings.skipAnimations, null, effectiveSkipAnimations, (skip) => {
      change({ skipAnimations: skip });
    }),
    switchSetting(
      STRINGS.settings.contactCounts,
      STRINGS.settings.contactCountsHint,
      settings.showContactCounts,
      (showContactCounts) => {
        change({ showContactCounts });
      },
    ),
    button(STRINGS.settings.done, actions.onDone, 'portal-button portal-button--primary'),
  ]);
}

/** The in-level menu. */
export function pauseScreen(actions: {
  readonly onResume: () => void;
  readonly onSettings: () => void;
  readonly onQuit: () => void;
}): HTMLElement {
  return panel('pause', STRINGS.pause.heading, [
    button(STRINGS.pause.resume, actions.onResume, 'portal-button portal-button--primary'),
    button(STRINGS.pause.settings, actions.onSettings, 'portal-button portal-button--secondary'),
    button(STRINGS.pause.quit, actions.onQuit, 'portal-button'),
  ]);
}

/** Confirms ending a run from the menu. */
export function confirmQuitScreen(actions: {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): HTMLElement {
  return panel('confirm', STRINGS.pause.confirmQuit, [
    button(STRINGS.pause.cancel, actions.onCancel, 'portal-button portal-button--primary'),
    button(STRINGS.pause.confirm, actions.onConfirm, 'portal-button'),
  ]);
}
