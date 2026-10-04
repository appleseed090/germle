import type { Settings } from '../storage';
import { wireDialog } from './dialogs';
import { requireElement } from './dom';

/**
 * Binds the settings dialog. The reduce-motion switch starts at the device setting; touching it
 * stores an explicit choice.
 *
 * @param onChange - Receives the new settings after each change.
 * @returns The dialog element, for opening.
 */
export function bindSettingsDialog(
  initialSettings: Settings,
  systemPrefersReducedMotion: () => boolean,
  onChange: (settings: Settings) => void,
): HTMLDialogElement {
  const dialog = requireElement('settings-dialog', HTMLDialogElement);
  const sizeByDegree = requireElement('setting-size-by-degree', HTMLInputElement);
  const reduceMotion = requireElement('setting-reduce-motion', HTMLInputElement);
  let settings = initialSettings;
  wireDialog(dialog);
  sizeByDegree.checked = settings.sizeNodesByDegree;
  reduceMotion.checked = settings.reduceMotion ?? systemPrefersReducedMotion();
  sizeByDegree.addEventListener('change', () => {
    settings = { ...settings, sizeNodesByDegree: sizeByDegree.checked };
    onChange(settings);
  });
  reduceMotion.addEventListener('change', () => {
    settings = { ...settings, reduceMotion: reduceMotion.checked };
    onChange(settings);
  });
  dialog.addEventListener('close', () => {
    if (settings.reduceMotion === null) reduceMotion.checked = systemPrefersReducedMotion();
  });
  return dialog;
}
