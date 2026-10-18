import type { GameState } from '../engine/game';
import { AD_BALANCE } from '../endless/balance';
import { prepareLevel, type PreparedLevel } from '../endless/levels';
import {
  beginRun,
  buyUnlock,
  finishRun,
  offerCountFor,
  recordRun,
  updateSettings,
} from '../endless/profile';
import { unlockedUpgrades, type UnlockId } from '../endless/research';
import {
  abandonRun,
  canUseSecondChance,
  createRunSeed,
  currentOffer,
  endRun,
  finishLevel,
  judgeLevel,
  pickUpgrade,
  recordLevelProgress,
  rerollOffer,
  skipOffer,
  useSecondChance,
  type LevelResult,
  type RunState,
} from '../endless/run';
import {
  SAVE_KEY,
  parseSave,
  serialiseSave,
  type EndlessSave,
  type EndlessSettings,
} from '../endless/save';
import { UPGRADE_IDS, type UpgradeId } from '../endless/upgrades';
import { createSound, type Sound } from './audio';
import { mountScene, outbreakScene } from './backdrop';
import { element, pause } from './dom';
import { createHud, type Hud } from './hud';
import { mountLevel, type LevelView } from './level-view';
import type { AdHooks, Platform } from './platform/platform';
import {
  choiceScreen,
  confirmQuitScreen,
  homeScreen,
  levelIntroCard,
  pauseScreen,
  researchScreen,
  runOverScreen,
  settingsScreen,
  summaryScreen,
  type RerollOption,
  type RewardedOption,
} from './screens';
import { STRINGS } from './strings';

/** Pause after a level's last move before its summary, so the final spread can be seen. */
const SUMMARY_DELAY_MILLISECONDS = 900;
const INTRO_MILLISECONDS = 1600;
const PICK_FEEDBACK_MILLISECONDS = 380;
const TOAST_MILLISECONDS = 2200;
const COUNT_UP_MILLISECONDS = 650;

/**
 * Germle Endless: the flow between home, levels, summaries, upgrade choices, the run summary and
 * Research. Owns the save and writes it through the platform after every tap (so a reload resumes
 * a level rather than restarting it) and at each decision. Ends the platform's loading phase
 * (`loadingStop`) just before the first screen, so it always comes before the first
 * `gameplayStart`.
 *
 * @param root - The page's `#portal-app` element; the app fills it.
 */
export function startApp(root: HTMLElement, platform: Platform): void {
  const parsed = parseSave(platform.saves.getItem(SAVE_KEY));
  let save: EndlessSave = parsed.save;
  // A save from a newer version of the game is never overwritten by this one.
  const saveWritable = parsed.source !== 'newer';
  const sound: Sound = createSound();
  const deviceReducesMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let level: { view: LevelView; prepared: PreparedLevel } | undefined;
  let toastTimer: number | undefined;
  let removeBackdrop: (() => void) | undefined;
  let secondChanceTakenThisSession = false;

  const stage = element('main', { className: 'stage' });
  const overlay = element('div', { className: 'overlay-layer' });
  overlay.hidden = true;
  const hud: Hud = createHud({
    onUndo: () => level?.view.undo(),
    onMenu: openPauseMenu,
  });
  const toast = element('p', { className: 'toast portal-toast', attributes: { role: 'status' } });
  toast.hidden = true;
  const announcer = element('p', {
    className: 'visually-hidden',
    attributes: { 'aria-live': 'polite' },
  });
  root.replaceChildren(stage, hud.root, overlay, toast, announcer);

  platform.onPortalMuteChange((muted) => {
    sound.setMuted('portal', muted);
  });
  sound.setMuted('portal', platform.isAudioMutedByPortal());
  applySettings(save.settings);

  function persist(): void {
    if (saveWritable) platform.saves.setItem(SAVE_KEY, serialiseSave(save));
  }

  function skipAnimations(): boolean {
    return save.settings.skipAnimations ?? deviceReducesMotion.matches;
  }

  function applySettings(settings: EndlessSettings): void {
    sound.setMuted('setting', !settings.sound);
    if (settings.showContactCounts) document.documentElement.dataset['contactCounts'] = 'shown';
    else delete document.documentElement.dataset['contactCounts'];
    document.documentElement.classList.toggle('portal-reduced-motion', skipAnimations());
    level?.view.setReduceMotion(skipAnimations());
  }

  function showToast(message: string): void {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, TOAST_MILLISECONDS);
  }

  function announce(message: string): void {
    announcer.textContent = message;
  }

  function showOverlay(screen: HTMLElement | undefined): void {
    root.dataset['overlay'] = screen === undefined ? 'none' : 'open';
    if (screen === undefined) {
      overlay.replaceChildren();
      overlay.hidden = true;
      level?.view.setInputBlocked(false);
      return;
    }
    level?.view.setInputBlocked(true);
    overlay.replaceChildren(screen);
    overlay.hidden = false;
    runCountUps(screen);
    // The heading, not a button: focusing the first upgrade card would look like a choice made.
    screen.querySelector<HTMLElement>('.panel-heading')?.focus({ preventScroll: true });
  }

  /** Counts each `[data-count-to]` number up from zero, keeping the text around it. */
  function runCountUps(screen: HTMLElement): void {
    if (skipAnimations()) return;
    for (const target of screen.querySelectorAll<HTMLElement>('[data-count-to]')) {
      const finalText = target.textContent;
      const goal = Number(target.dataset['countTo']);
      const started = performance.now();
      const step = (now: number): void => {
        const progress = Math.min(1, (now - started) / COUNT_UP_MILLISECONDS);
        const eased = 1 - (1 - progress) ** 3;
        target.textContent = finalText.replace(String(goal), String(Math.round(goal * eased)));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  function currentRun(): RunState {
    if (save.run === null) throw new Error('No run in progress');
    return save.run;
  }

  function setRun(run: RunState): void {
    save = recordRun(save, run);
    persist();
  }

  /**
   * Runs an ad. The whole game is inert from the request until the ad finishes or fails, as
   * CrazyGames requires (not only once it starts); sound mutes only once it starts.
   */
  async function withAd<Result>(show: (hooks: AdHooks) => Promise<Result>): Promise<Result> {
    root.dataset['ad'] = 'playing';
    root.inert = true;
    level?.view.setInputBlocked(true);
    try {
      return await show({
        onAdStarted: () => {
          sound.setMuted('ad', true);
        },
      });
    } finally {
      sound.setMuted('ad', false);
      root.inert = false;
      root.dataset['ad'] = 'none';
    }
  }

  // ---------- Screens and flow ----------

  function showHome(): void {
    leaveLevel();
    removeBackdrop ??= mountScene(stage, outbreakScene(12, 0.3), 'portal-backdrop');
    root.dataset['screen'] = 'home';
    showOverlay(
      homeScreen(save, {
        onPlay: startNewRun,
        onContinue: resumeRun,
        onNewRun: () => {
          const run = save.run;
          if (run !== null) save = finishRun(save, abandonRun(run)).save;
          startNewRun();
        },
        onResearch: () => {
          showResearch(showHome);
        },
        onSettings: () => {
          showSettings(showHome);
        },
      }),
    );
  }

  function startNewRun(): void {
    save = beginRun(save, createRunSeed(Math.random));
    persist();
    playLevel();
  }

  function resumeRun(): void {
    const run = currentRun();
    if (run.phase === 'playing') {
      playLevel();
      return;
    }
    // No level is on screen to fill the side panel, so it shows the finished one from the save.
    if (run.lastResult !== null)
      hud.showFinished(run, prepareLevel(run.seed, run.level, run.picks), run.lastResult);
    if (run.phase === 'choosing') showChoice();
    else if (run.phase === 'failed' && run.lastResult !== null) showSummary(run.lastResult);
    else showHome();
  }

  function leaveLevel(): void {
    removeBackdrop?.();
    removeBackdrop = undefined;
    level?.view.destroy();
    level = undefined;
    root.dataset['level'] = 'none';
  }

  function playLevel(): void {
    leaveLevel();
    const run = currentRun();
    const prepared = prepareLevel(run.seed, run.level, run.picks);
    root.dataset['screen'] = 'level';
    root.dataset['level'] = String(run.level);
    showOverlay(undefined);
    const view = mountLevel({
      stage,
      prepared,
      reduceMotion: skipAnimations(),
      showHints: !save.tutorialDone && run.level === 1,
      sound,
      showToast,
      announce,
      resumeMoves: run.levelMoves,
      undoChargesUsed: run.levelUndosUsed,
      onProgress: (moves, undoChargesUsed) => {
        setRun(recordLevelProgress(currentRun(), moves, undoChargesUsed));
      },
      onStateShown: (state, undoChargesLeft) => {
        hud.update(currentRun(), prepared, state, undoChargesLeft);
      },
      onEnded: (state) => {
        void finishPlayedLevel(prepared, state);
      },
    });
    level = { view, prepared };
    showLevelIntro(prepared);
    platform.ads.gameplayStart();
  }

  function showLevelIntro(prepared: PreparedLevel): void {
    const card = levelIntroCard(prepared);
    stage.append(card);
    window.setTimeout(
      () => {
        card.remove();
      },
      skipAnimations() ? INTRO_MILLISECONDS / 2 : INTRO_MILLISECONDS,
    );
  }

  async function finishPlayedLevel(prepared: PreparedLevel, finalState: GameState): Promise<void> {
    platform.ads.gameplayStop();
    const result = judgeLevel(prepared, finalState);
    setRun(finishLevel(currentRun(), result));
    sound.play(result.passed ? 'pass' : 'fail');
    level?.view.setInputBlocked(true);
    await pause(SUMMARY_DELAY_MILLISECONDS, skipAnimations());
    showSummary(result);
  }

  function showSummary(result: LevelResult): void {
    root.dataset['screen'] = 'summary';
    showOverlay(
      summaryScreen(result, secondChanceOption(), {
        onContinue: () => {
          void continueAfterPass();
        },
        onSecondChance: () => {
          void takeSecondChance();
        },
        onEndRun: () => {
          finishTheRun(endRun(currentRun()));
        },
      }),
    );
  }

  async function continueAfterPass(): Promise<void> {
    // A natural break, never right after a failure (no midgame ad beside a rewarded offer).
    if (currentRun().levelsCleared >= AD_BALANCE.firstMidgameAfterLevelsCleared) {
      showOverlay(undefined);
      await withAd((hooks) => platform.ads.showMidgameAd(hooks));
    }
    showChoice();
  }

  /** How a rewarded option shows: playable, disabled by an ad blocker, or not at all. */
  function rewardedOption(): RewardedOption {
    switch (platform.ads.rewardedAds()) {
      case 'available':
        return 'video';
      case 'blocked-by-adblock':
        return 'blocked';
      case 'unavailable':
        return 'none';
    }
  }

  /**
   * Second chance is a rewarded "keep playing": once per run, at most once per session (the
   * CrazyGames monetisation guide's limit for revives), and never offered when ads are off.
   */
  function secondChanceOption(): RewardedOption {
    return canUseSecondChance(currentRun()) && !secondChanceTakenThisSession
      ? rewardedOption()
      : 'none';
  }

  async function takeSecondChance(): Promise<void> {
    const rewarded = await withAd((hooks) => platform.ads.showRewardedAd(hooks));
    const result = currentRun().lastResult;
    if (!rewarded) {
      showToast(STRINGS.toasts.adUnavailable);
      // Redraw: if ads turned out to be off, the offer disappears.
      if (result !== null) showSummary(result);
      return;
    }
    secondChanceTakenThisSession = true;
    setRun(useSecondChance(currentRun()));
    playLevel();
  }

  function showChoice(): void {
    leaveLevel();
    root.dataset['screen'] = 'choice';
    const run = currentRun();
    const unlocked = unlockedUpgrades(save.unlocks);
    const offer = currentOffer(run, unlocked, offerCountFor(save));
    const rerollOption: RerollOption = run.freeRerollsLeft > 0 ? 'free' : rewardedOption();
    showOverlay(
      choiceScreen(run, offer, rerollOption, unlocked.size < UPGRADE_IDS.length, {
        onPick: (upgrade, card) => {
          void pick(upgrade, offer, card);
        },
        onReroll: () => {
          void reroll();
        },
        onSkip: () => {
          setRun(skipOffer(currentRun()));
          playLevel();
        },
      }),
    );
  }

  async function pick(
    upgrade: UpgradeId,
    offer: readonly UpgradeId[],
    card: HTMLElement,
  ): Promise<void> {
    // The pick is final: a double tap or a reroll during the feedback must not reach the run.
    overlay.inert = true;
    overlay.classList.add('overlay-layer--picked');
    card.classList.add('upgrade-card--chosen');
    sound.play('pick');
    setRun(pickUpgrade(currentRun(), upgrade, offer));
    await pause(PICK_FEEDBACK_MILLISECONDS, skipAnimations());
    overlay.classList.remove('overlay-layer--picked');
    overlay.inert = false;
    playLevel();
  }

  async function reroll(): Promise<void> {
    if (currentRun().freeRerollsLeft === 0) {
      const rewarded = await withAd((hooks) => platform.ads.showRewardedAd(hooks));
      if (!rewarded) {
        showToast(STRINGS.toasts.adUnavailable);
        showChoice();
        return;
      }
    }
    setRun(rerollOffer(currentRun()));
    showChoice();
  }

  function finishTheRun(over: RunState): void {
    leaveLevel();
    const finished = finishRun(save, over);
    save = finished.save;
    persist();
    if (platform.leaderboard.available)
      platform.leaderboard.submitLevelsCleared(over.levelsCleared);
    if (finished.isNewBest) {
      platform.ads.happyTime();
      sound.play('best');
    }
    root.dataset['screen'] = 'run-over';
    showOverlay(
      runOverScreen(over, finished, {
        onPlayAgain: startNewRun,
        onResearch: () => {
          showResearch(showHome);
        },
        onHome: showHome,
      }),
    );
  }

  function showResearch(back: () => void): void {
    root.dataset['screen'] = 'research';
    showOverlay(
      researchScreen(save, {
        onBuy: (id: UnlockId) => {
          const bought = buyUnlock(save, id);
          if (bought === undefined) return;
          save = bought;
          persist();
          sound.play('pick');
          showResearch(back);
        },
        onBack: back,
      }),
    );
  }

  function showSettings(back: () => void): void {
    showOverlay(
      settingsScreen(save.settings, skipAnimations(), {
        onChange: (settings) => {
          save = updateSettings(save, settings);
          applySettings(settings);
        },
        onDone: () => {
          persist();
          back();
        },
      }),
    );
  }

  function openPauseMenu(): void {
    if (level === undefined) return;
    platform.ads.gameplayStop();
    const resume = (): void => {
      showOverlay(undefined);
      platform.ads.gameplayStart();
    };
    const menu = (): void => {
      showOverlay(
        pauseScreen({
          onResume: resume,
          onSettings: () => {
            showSettings(menu);
          },
          onQuit: () => {
            showOverlay(
              confirmQuitScreen({
                onConfirm: () => {
                  finishTheRun(abandonRun(currentRun()));
                },
                onCancel: menu,
              }),
            );
          },
        }),
      );
    };
    menu();
  }

  // A brand-new player lands straight in level 1; anyone else sees the title screen first.
  const isFirstVisit = save.run === null && save.runsFinished === 0 && !save.tutorialDone;
  platform.ads.loadingStop();
  if (isFirstVisit) startNewRun();
  else showHome();
}
