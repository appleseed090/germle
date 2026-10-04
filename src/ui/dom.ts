/**
 * Looks up an element of the page shell by id and checks its type. The shell is part of the
 * build, so a missing element is a programming error and fails at startup, not mid-game.
 *
 * @throws Error if the element is missing or has the wrong type.
 */
export function requireElement<ElementType extends Element>(
  id: string,
  elementType: abstract new () => ElementType,
): ElementType {
  const element = document.getElementById(id);
  if (!(element instanceof elementType))
    throw new Error(`Page shell is missing #${id} (${elementType.name})`);
  return element;
}

/** Whether the operating system asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
