import type { OutcomeCounts } from './engine';

/** The slice of the Web Storage API persistence needs, so tests can pass an in-memory fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Player preferences. */
export interface Settings {
  /** Draw better-connected people slightly larger. */
  readonly sizeNodesByDegree: boolean;
  /** `true`/`false` overrides the system setting; `null` follows `prefers-reduced-motion`. */
  readonly reduceMotion: boolean | null;
}

/** The moves of today's unfinished or finished daily game, replayed on reload. */
export interface DailyProgress {
  readonly puzzleNumber: number;
  readonly moves: readonly number[];
}

/** The outcome of one finished daily game, as shown in stats. */
export interface DailyResult {
  readonly score: number;
  readonly counts: OutcomeCounts;
  /** Par for that puzzle; absent in results saved before par existed. */
  readonly par?: number;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  sizeNodesByDegree: true,
  reduceMotion: null,
});

/**
 * Storage keys. Each value is versioned by its key, so a future schema change can move to a new
 * key and migrate. Changing a key or a value's shape is a breaking change for returning players.
 */
const STORAGE_KEYS = Object.freeze({
  settings: 'germle.v1.settings',
  dailyProgress: 'germle.v1.daily-progress',
  results: 'germle.v1.results',
  seenHowToPlay: 'germle.v1.seen-how-to-play',
});

/** Typed, validated access to everything Germle keeps in the browser. */
export interface GameStorage {
  loadSettings(): Settings;
  saveSettings(settings: Settings): void;
  loadDailyProgress(): DailyProgress | undefined;
  saveDailyProgress(progress: DailyProgress): void;
  /** Finished daily games keyed by puzzle number. */
  loadResults(): Map<number, DailyResult>;
  /** Records a finished game; an existing result for that puzzle is kept, never overwritten. */
  saveResult(puzzleNumber: number, result: DailyResult): void;
  hasSeenHowToPlay(): boolean;
  markHowToPlaySeen(): void;
}

/**
 * The browser's `localStorage`, or `undefined` where reading it throws (blocked site data,
 * some private modes). The game then runs without persistence.
 */
export function browserLocalStorage(): KeyValueStore | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Wraps a key-value store with schema validation. Every read treats stored text as untrusted:
 * malformed values are ignored and defaults returned. Writes that fail (quota, blocked storage)
 * are dropped silently, since losing a save must never break the game.
 */
export function createGameStorage(store: KeyValueStore | undefined): GameStorage {
  const readJson = (key: string): unknown => {
    try {
      const text = store?.getItem(key) ?? null;
      return text === null ? undefined : (JSON.parse(text) as unknown);
    } catch {
      return undefined;
    }
  };
  const writeJson = (key: string, value: unknown): void => {
    try {
      store?.setItem(key, JSON.stringify(value));
    } catch {
      // Persistence is best effort; see the function comment.
    }
  };

  return {
    loadSettings: () => parseSettings(readJson(STORAGE_KEYS.settings)),
    saveSettings: (settings) => {
      writeJson(STORAGE_KEYS.settings, settings);
    },
    loadDailyProgress: () => parseDailyProgress(readJson(STORAGE_KEYS.dailyProgress)),
    saveDailyProgress: (progress) => {
      writeJson(STORAGE_KEYS.dailyProgress, progress);
    },
    loadResults: () => parseResults(readJson(STORAGE_KEYS.results)),
    saveResult: (puzzleNumber, result) => {
      const results = parseResults(readJson(STORAGE_KEYS.results));
      if (results.has(puzzleNumber)) return;
      results.set(puzzleNumber, result);
      writeJson(STORAGE_KEYS.results, Object.fromEntries(results));
    },
    hasSeenHowToPlay: () => readJson(STORAGE_KEYS.seenHowToPlay) === true,
    markHowToPlaySeen: () => {
      writeJson(STORAGE_KEYS.seenHowToPlay, true);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseSettings(value: unknown): Settings {
  if (!isRecord(value)) return DEFAULT_SETTINGS;
  const sizeNodesByDegree = value['sizeNodesByDegree'];
  const reduceMotion = value['reduceMotion'];
  return {
    sizeNodesByDegree:
      typeof sizeNodesByDegree === 'boolean'
        ? sizeNodesByDegree
        : DEFAULT_SETTINGS.sizeNodesByDegree,
    reduceMotion: typeof reduceMotion === 'boolean' ? reduceMotion : null,
  };
}

function parseDailyProgress(value: unknown): DailyProgress | undefined {
  if (!isRecord(value)) return undefined;
  const puzzleNumber = value['puzzleNumber'];
  const moves = value['moves'];
  if (
    !isNonNegativeInteger(puzzleNumber) ||
    !Array.isArray(moves) ||
    !moves.every(isNonNegativeInteger)
  ) {
    return undefined;
  }
  return { puzzleNumber, moves };
}

function parseResults(value: unknown): Map<number, DailyResult> {
  const results = new Map<number, DailyResult>();
  if (!isRecord(value)) return results;
  for (const [key, entry] of Object.entries(value)) {
    const puzzleNumber = Number(key);
    const result = parseResult(entry);
    if (Number.isInteger(puzzleNumber) && puzzleNumber >= 1 && result !== undefined)
      results.set(puzzleNumber, result);
  }
  return results;
}

function parseResult(value: unknown): DailyResult | undefined {
  if (!isRecord(value) || !isRecord(value['counts'])) return undefined;
  const score = value['score'];
  const par = value['par'];
  const { vaccinated, quarantined, untouched, infected } = value['counts'];
  if (!isNonNegativeInteger(score) || score > 100) return undefined;
  if (
    !isNonNegativeInteger(vaccinated) ||
    !isNonNegativeInteger(quarantined) ||
    !isNonNegativeInteger(untouched) ||
    !isNonNegativeInteger(infected)
  ) {
    return undefined;
  }
  const counts = { vaccinated, quarantined, untouched, infected };
  return isNonNegativeInteger(par) && par <= 100 ? { score, counts, par } : { score, counts };
}
