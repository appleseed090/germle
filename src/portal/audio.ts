/** The game's sound effects; all synthesised, so there are no audio files. */
export type SoundEffect =
  'vaccinate' | 'quarantine' | 'infect' | 'outbreak' | 'pass' | 'fail' | 'pick' | 'best';

/** Plays short effects; silent while muted for any reason. */
export interface Sound {
  play(effect: SoundEffect): void;
  /** Mutes or unmutes for one reason; sound plays only when no reason mutes it. */
  setMuted(reason: 'setting' | 'portal' | 'ad', muted: boolean): void;
}

interface Tone {
  readonly frequency: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly type: OscillatorType;
  readonly volume: number;
}

const note = (
  frequency: number,
  startSeconds: number,
  durationSeconds = 0.12,
  type: OscillatorType = 'sine',
  volume = 0.12,
): Tone => ({ frequency, startSeconds, durationSeconds, type, volume });

const EFFECTS: Readonly<Record<SoundEffect, readonly Tone[]>> = {
  vaccinate: [note(880, 0, 0.08), note(1320, 0.05, 0.08, 'sine', 0.08)],
  quarantine: [note(220, 0, 0.12, 'triangle', 0.16)],
  infect: [note(160, 0, 0.1, 'sawtooth', 0.04)],
  outbreak: [note(196, 0, 0.18, 'square', 0.05), note(147, 0.14, 0.24, 'square', 0.05)],
  pass: [note(523, 0, 0.12), note(659, 0.1, 0.12), note(784, 0.2, 0.22)],
  fail: [note(392, 0, 0.16, 'triangle'), note(311, 0.15, 0.28, 'triangle')],
  pick: [note(988, 0, 0.1), note(1319, 0.08, 0.16)],
  best: [note(523, 0, 0.1), note(659, 0.09, 0.1), note(784, 0.18, 0.1), note(1047, 0.27, 0.3)],
};

/**
 * Web Audio sound. The audio context is created on the first effect, which always follows a tap,
 * so browsers' autoplay rules allow it. Where Web Audio is missing, the game is silent.
 */
export function createSound(): Sound {
  const mutedBy = new Set<string>();
  let context: AudioContext | undefined;
  // iOS suspends the context and lets it resume only inside a touch gesture (CrazyGames' advice).
  document.addEventListener('touchend', () => {
    if (context?.state === 'suspended' && mutedBy.size === 0)
      void context.resume().catch(() => undefined);
  });

  return {
    play(effect) {
      if (mutedBy.size > 0) return;
      try {
        context ??= new AudioContext();
        if (context.state === 'suspended') void context.resume();
        const start = context.currentTime;
        for (const tone of EFFECTS[effect]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = tone.type;
          oscillator.frequency.value = tone.frequency;
          const begin = start + tone.startSeconds;
          const end = begin + tone.durationSeconds;
          gain.gain.setValueAtTime(0.0001, begin);
          gain.gain.exponentialRampToValueAtTime(tone.volume, begin + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, end);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(begin);
          oscillator.stop(end + 0.02);
        }
      } catch {
        // No Web Audio: play silently.
      }
    },
    setMuted(reason, muted) {
      if (muted) mutedBy.add(reason);
      else mutedBy.delete(reason);
      if (context === undefined) return;
      if (mutedBy.size > 0) void context.suspend().catch(() => undefined);
      else void context.resume().catch(() => undefined);
    },
  };
}
