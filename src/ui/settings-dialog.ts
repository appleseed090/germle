import type { GameStorage, Settings } from '../storage';
import { applyThemeChoice, isThemeChoice } from '../theme';
import { wireDialog } from './dialogs';
import { prefersReducedMotion, requireElement } from './dom';
import type { GameDisplayOptions, GameSession } from './game-session';

/** The display options implied by stored settings and the device's motion preference. */
export function displayOptionsFor(settings: Settings): GameDisplayOptions {
  return {
    reduceMotion: settings.reduceMotion ?? prefersReducedMotion(),
  };
}

/**
 * Binds the settings dialog of the page shell to stored settings and a running game. The
 * reduce-motion switch shows the device setting until the player touches it, which stores an
 * explicit choice; device changes apply live while no choice is stored. The theme choice applies
 * to the page at once; "System" stores `null` and leaves the colours to the device. The contact
 * numbers switch applies at once too, to the board and to the how-to-play legend.
 *
 * @returns The dialog element, for opening.
 */
export function connectSettingsDialog(
  storage: GameStorage,
  session: GameSession,
): HTMLDialogElement {
  const dialog = requireElement('settings-dialog', HTMLDialogElement);
  const reduceMotion = requireElement('setting-reduce-motion', HTMLInputElement);
  const contactCounts = requireElement('setting-contact-counts', HTMLInputElement);
  const themeOptions = Array.from(
    requireElement('setting-theme', HTMLElement).querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    ),
  );
  let settings = storage.loadSettings();
  wireDialog(dialog);

  const apply = (updated: Settings): void => {
    settings = updated;
    storage.saveSettings(settings);
    session.setDisplayOptions(displayOptionsFor(settings));
    showContactCounts(document, settings.showContactCounts);
  };
  const showCurrent = (): void => {
    contactCounts.checked = settings.showContactCounts;
    reduceMotion.checked = settings.reduceMotion ?? prefersReducedMotion();
    for (const option of themeOptions)
      option.checked = option.value === (settings.theme ?? 'system');
  };

  contactCounts.addEventListener('change', () => {
    apply({ ...settings, showContactCounts: contactCounts.checked });
  });
  reduceMotion.addEventListener('change', () => {
    apply({ ...settings, reduceMotion: reduceMotion.checked });
  });
  for (const option of themeOptions) {
    option.addEventListener('change', () => {
      const theme = isThemeChoice(option.value) ? option.value : null;
      apply({ ...settings, theme });
      applyThemeChoice(document, theme);
    });
  }
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    session.setDisplayOptions(displayOptionsFor(settings));
    showCurrent();
  });
  session.setDisplayOptions(displayOptionsFor(settings));
  showContactCounts(document, settings.showContactCounts);
  showCurrent();
  return dialog;
}

/**
 * The stylesheet draws contact counts unless `<html>` says `data-contact-counts="hidden"`, in
 * which case the refusers' cross and the infected people's dot come back instead.
 */
function showContactCounts(page: Document, show: boolean): void {
  page.documentElement.dataset['contactCounts'] = show ? 'shown' : 'hidden';
}
