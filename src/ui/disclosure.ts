import { requireElement } from './dom';

/**
 * Makes every `button[aria-controls][aria-expanded]` inside `container` show and hide the element
 * it controls, so an explanation opens on tap, click, Enter or Space (no hover needed) and screen
 * readers hear whether it is open. Buttons start collapsed, matching their `hidden` panels.
 *
 * @throws Error if a button controls an element that is not in the page shell.
 */
export function wireDisclosureButtons(container: ParentNode): void {
  for (const button of container.querySelectorAll<HTMLButtonElement>(
    'button[aria-controls][aria-expanded]',
  )) {
    const panel = requireElement(button.getAttribute('aria-controls') ?? '', HTMLElement);
    button.addEventListener('click', () => {
      const isOpening = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(isOpening));
      panel.hidden = !isOpening;
    });
  }
}
