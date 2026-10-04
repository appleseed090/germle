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

/** Opens a dialog modally unless it is already open. */
export function openDialog(dialog: HTMLDialogElement): void {
  if (!dialog.open) dialog.showModal();
}
