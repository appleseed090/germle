import { LANGUAGES, LANGUAGE_NAMES, type Language } from '../i18n/language';
import type { GameStorage } from '../storage';
import { openDialog, wireDialog } from './dialogs';
import { requireElement } from './dom';

/**
 * Binds the header's globe button to the language dialog of the page shell, which lists every
 * language in its own name. Picking another language stores it and reloads the page, which then
 * starts in that language; a daily or archive game in progress is saved and comes back, while a
 * practice game restarts on the same network, since its moves are not saved.
 *
 * @param current - The language the page is shown in, marked in the list.
 */
export function connectLanguageMenu(
  storage: Pick<GameStorage, 'loadSettings' | 'saveSettings'>,
  current: Language,
): void {
  const dialog = requireElement('language-dialog', HTMLDialogElement);
  wireDialog(dialog);
  const options = LANGUAGES.map((language) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'language-option';
    button.lang = language;
    button.textContent = LANGUAGE_NAMES[language];
    if (language === current) {
      button.setAttribute('aria-current', 'true');
      button.dataset['initialFocus'] = '';
    }
    button.addEventListener('click', () => {
      if (language === current) {
        dialog.close();
        return;
      }
      storage.saveSettings({ ...storage.loadSettings(), language });
      window.location.reload();
    });
    const item = document.createElement('li');
    item.append(button);
    return item;
  });
  requireElement('language-options', HTMLUListElement).replaceChildren(...options);
  requireElement('open-language', HTMLButtonElement).addEventListener('click', () => {
    openDialog(dialog);
  });
}
