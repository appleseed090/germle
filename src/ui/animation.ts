/** One segment of an animation. `update` receives eased progress from 0 to 1. */
export interface AnimationPhase {
  readonly durationMilliseconds: number;
  readonly update?: (progress: number) => void;
  /** Runs once when the phase completes, whether played or skipped. */
  readonly finish?: () => void;
}

/** A running sequence of phases. */
export interface RunningAnimation {
  /** Resolves when every phase has finished. */
  readonly finished: Promise<void>;
  /** Jumps to the end: completes the current and remaining phases immediately. */
  skip(): void;
}

function easeInOutQuad(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
}

/**
 * Plays phases one after another on `requestAnimationFrame`. With `instant`, or for phases of
 * zero duration, each phase jumps straight to its end state.
 */
export function playPhases(phases: readonly AnimationPhase[], instant: boolean): RunningAnimation {
  let phaseIndex = 0;
  let phaseStart: number | undefined;
  let frameRequest: number | undefined;
  let resolveFinished: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const completeCurrentPhase = (): void => {
    const phase = phases[phaseIndex];
    phase?.update?.(1);
    phase?.finish?.();
    phaseIndex++;
    phaseStart = undefined;
  };

  const completeAll = (): void => {
    if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    frameRequest = undefined;
    while (phaseIndex < phases.length) completeCurrentPhase();
    resolveFinished();
  };

  const onFrame = (now: number): void => {
    frameRequest = undefined;
    while (phaseIndex < phases.length) {
      const phase = phases[phaseIndex] as AnimationPhase;
      phaseStart ??= now;
      const progress =
        phase.durationMilliseconds <= 0 ? 1 : (now - phaseStart) / phase.durationMilliseconds;
      if (progress < 1) {
        phase.update?.(easeInOutQuad(progress));
        frameRequest = requestAnimationFrame(onFrame);
        return;
      }
      completeCurrentPhase();
    }
    resolveFinished();
  };

  if (instant) completeAll();
  else frameRequest = requestAnimationFrame(onFrame);
  return { finished, skip: completeAll };
}
