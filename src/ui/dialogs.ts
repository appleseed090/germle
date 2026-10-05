/**
 * Wires a `<dialog>` so that its `[data-close-dialog]` buttons and clicks on the backdrop close
 * it. Escape closes it natively.
 */
export function wireDialog(dialog: HTMLDialogElement): void {
  for (const button of dialog.querySelectorAll('[data-close-dialog]')) {
    button.addEventListener('click', () => {
      dialog.close();
    });
  }
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

/**
 * Opens a dialog modally unless it is already open, at its top, then focuses its
 * `[data-initial-focus]` element without scrolling to it. A dialog taller than the screen thus
 * opens with its heading in view even when that element (Start playing, Share) sits lower down.
 * The `autofocus` attribute is not used because it scrolls the dialog to its target. Browsers
 * without `preventScroll` (Safari before 15) scroll anyway; the reset that follows undoes it.
 */
export function openDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  dialog.showModal();
  dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
