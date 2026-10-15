/** Options for {@link element}. */
export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

/**
 * Creates an HTML element with a class, text and attributes, and appends children. Text is set
 * with `textContent`, never parsed as HTML.
 */
export function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  options: ElementOptions = {},
  children: readonly (Node | null)[] = [],
): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  if (options.className !== undefined) created.className = options.className;
  if (options.text !== undefined) created.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {}))
    created.setAttribute(name, value);
  for (const child of children) if (child !== null) created.append(child);
  return created;
}

/** A `type="button"` button that runs `onClick`. */
export function button(
  label: string,
  onClick: () => void,
  className = 'portal-button',
): HTMLButtonElement {
  const created = element('button', { className, text: label, attributes: { type: 'button' } });
  created.addEventListener('click', onClick);
  return created;
}

/** Resolves after `milliseconds`, or at once when `instant`. */
export function pause(milliseconds: number, instant: boolean): Promise<void> {
  if (instant) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
