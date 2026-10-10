import { openDialog, wireDialog } from './dialogs';

/**
 * Wires the header's menu: the menu button opens it as a modal dialog, and a tap outside it,
 * Escape or any of its items closes it. Its buttons close it before their own handlers run, so
 * focus is back on the menu button when they open a dialog, and returns there when that closes.
 * Its links simply navigate away.
 */
export function connectHeaderMenu(menuButton: HTMLButtonElement, menu: HTMLDialogElement): void {
  wireDialog(menu);
  menuButton.addEventListener('click', () => {
    openDialog(menu);
  });
  menu.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('button') !== null) menu.close();
    },
    { capture: true },
  );
}
