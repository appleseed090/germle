import type { GameStorage, Settings } from '../storage';
import { wireDialog } from './dialogs';
import { prefersReducedMotion, requireElement } from './dom';
import type { GameDisplayOptions, GameSession } from './game-session';

/** The display options implied by stored settings and the device's motion preference. */
export function displayOptionsFor(settings: Settings): GameDisplayOptions {
  return {
    sizeNodesByDegree: settings.sizeNodesByDegree,
    reduceMotion: settings.reduceMotion ?? prefersReducedMotion(),
  };
}

/**
 * Binds the settings dialog of the page shell to stored settings and a running game. The
 * reduce-motion switch shows the device setting until the player touches it, which stores an
 * explicit choice; device changes apply live while no choice is stored.
 *
 * @returns The dialog element, for opening.
 */
export function connectSettingsDialog(
  storage: GameStorage,
  session: GameSession,
): HTMLDialogElement {
  const dialog = requireElement('settings-dialog', HTMLDialogElement);
  const sizeByDegree = requireElement('setting-size-by-degree', HTMLInputElement);
  const reduceMotion = requireElement('setting-reduce-motion', HTMLInputElement);
  let settings = storage.loadSettings();
  wireDialog(dialog);

  const apply = (updated: Settings): void => {
    settings = updated;
    storage.saveSettings(settings);
    session.setDisplayOptions(displayOptionsFor(settings));
  };
  const showCurrent = (): void => {
    sizeByDegree.checked = settings.sizeNodesByDegree;
    reduceMotion.checked = settings.reduceMotion ?? prefersReducedMotion();
  };

  sizeByDegree.addEventListener('change', () => {
    apply({ ...settings, sizeNodesByDegree: sizeByDegree.checked });
  });
  reduceMotion.addEventListener('change', () => {
    apply({ ...settings, reduceMotion: reduceMotion.checked });
  });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    session.setDisplayOptions(displayOptionsFor(settings));
    showCurrent();
  });
  session.setDisplayOptions(displayOptionsFor(settings));
  showCurrent();
  return dialog;
}
