const TOAST_DURATION = 2200;

/** A transient one-line status message, announced to screen readers. */
export interface Toast {
  show(message: string): void;
}

/** @param element - A `role="status"` element styled as a toast. */
export function createToast(element: HTMLElement): Toast {
  let hideTimer: number | undefined;
  return {
    show(message) {
      window.clearTimeout(hideTimer);
      element.textContent = message;
      element.hidden = false;
      hideTimer = window.setTimeout(() => {
        element.hidden = true;
      }, TOAST_DURATION);
    },
  };
}
