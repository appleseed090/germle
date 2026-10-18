import { LARGEST_LEVEL_NODE_COUNT } from './levels';
import { isRunSeed, type LevelResult, type RunPhase, type RunScore, type RunState } from './run';
import { isUnlockId, type UnlockId } from './research';
import { countUpgrades, isUpgradeId, UPGRADES, type UpgradeId } from './upgrades';

/** Player preferences in Germle Endless. */
export interface EndlessSettings {
  readonly sound: boolean;
  /** `true`/`false` overrides the device; `null` follows `prefers-reduced-motion`. */
  readonly skipAnimations: boolean | null;
  readonly showContactCounts: boolean;
}

/**
 * Everything Germle Endless keeps between sessions, written as one JSON value. The schema is
 * versioned: a change of shape bumps {@link SAVE_VERSION} and adds a migration from the previous
 * version to {@link parseSave}.
 */
export interface EndlessSave {
  readonly version: typeof SAVE_VERSION;
  /** Research not yet spent. */
  readonly research: number;
  /** Research earned over every run, spent or not. */
  readonly researchEarned: number;
  readonly unlocks: readonly UnlockId[];
  readonly bestRun: RunScore | null;
  readonly runsFinished: number;
  /** Set once level 1 has been cleared; the first-run hints stop then. */
  readonly tutorialDone: boolean;
  readonly settings: EndlessSettings;
  /** The run in progress, saved after every tap and decision; `null` between runs. */
  readonly run: RunState | null;
}

/** 2: the run keeps the current level's taps (`levelMoves`, `levelUndosUsed`). */
export const SAVE_VERSION = 2;

/** The key the save is stored under, in whatever store the platform provides. */
export const SAVE_KEY = 'germle-endless-save';

export const DEFAULT_SETTINGS: EndlessSettings = Object.freeze({
  sound: true,
  skipAnimations: null,
  showContactCounts: false,
});

export const FRESH_SAVE: EndlessSave = Object.freeze({
  version: SAVE_VERSION,
  research: 0,
  researchEarned: 0,
  unlocks: [],
  bestRun: null,
  runsFinished: 0,
  tutorialDone: false,
  settings: DEFAULT_SETTINGS,
  run: null,
});

/**
 * How a stored save was read. `loaded`: valid as stored. `repaired`: valid JSON of this version
 * with some invalid fields replaced by defaults. `fresh`: nothing stored. `reset`: unreadable,
 * replaced by a fresh save. `newer`: written by a later version of the game, which this one
 * cannot read; the caller must not overwrite it.
 */
export type SaveSource = 'loaded' | 'repaired' | 'fresh' | 'reset' | 'newer';

export interface ParsedSave {
  readonly save: EndlessSave;
  readonly source: SaveSource;
}

/** Upper bound on levels a stored run may claim, to reject absurd values. */
const MAXIMUM_STORED_LEVEL = 10_000;

/**
 * Reads a stored save. The text is untrusted (it comes from the platform's storage, which the
 * player can edit): every field is validated, a bad field falls back to its default, a bad
 * in-progress run is dropped, and anything unreadable gives a fresh save. Never throws.
 */
export function parseSave(text: string | null): ParsedSave {
  if (text === null) return { save: FRESH_SAVE, source: 'fresh' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { save: FRESH_SAVE, source: 'reset' };
  }
  if (!isRecord(value) || !isWholeNumber(value['version']))
    return { save: FRESH_SAVE, source: 'reset' };
  if (value['version'] > SAVE_VERSION) return { save: FRESH_SAVE, source: 'newer' };
  // Version 1 had no level progress; its runs resume at the start of their level.
  if (value['version'] === 1) return parseCurrentVersion({ ...value, version: SAVE_VERSION }, 1);
  if (value['version'] !== SAVE_VERSION) return { save: FRESH_SAVE, source: 'reset' };
  return parseCurrentVersion(value, SAVE_VERSION);
}

/** The text to store for a save. */
export function serialiseSave(save: EndlessSave): string {
  return JSON.stringify(save);
}

function parseCurrentVersion(value: Record<string, unknown>, storedVersion: number): ParsedSave {
  let repaired = false;
  const field = <Field>(parsed: Field | undefined, fallback: Field): Field => {
    if (parsed === undefined) {
      repaired = true;
      return fallback;
    }
    return parsed;
  };
  const unlocks = Array.isArray(value['unlocks'])
    ? [...new Set(value['unlocks'].filter(isUnlockId))]
    : undefined;
  if (unlocks !== undefined && unlocks.length !== (value['unlocks'] as unknown[]).length)
    repaired = true;
  const run = value['run'] === null ? null : parseRun(value['run'], storedVersion);
  const save: EndlessSave = {
    version: SAVE_VERSION,
    research: field(wholeNumberOrUndefined(value['research']), 0),
    researchEarned: field(wholeNumberOrUndefined(value['researchEarned']), 0),
    unlocks: field(unlocks, []),
    bestRun: field(value['bestRun'] === null ? null : parseScore(value['bestRun']), null),
    runsFinished: field(wholeNumberOrUndefined(value['runsFinished']), 0),
    tutorialDone: field(booleanOrUndefined(value['tutorialDone']), false),
    settings: field(parseSettings(value['settings']), DEFAULT_SETTINGS),
    run: field(run, null),
  };
  return { save, source: repaired ? 'repaired' : 'loaded' };
}

function parseSettings(value: unknown): EndlessSettings | undefined {
  if (!isRecord(value)) return undefined;
  const sound = booleanOrUndefined(value['sound']);
  const skipAnimations = value['skipAnimations'];
  const showContactCounts = booleanOrUndefined(value['showContactCounts']);
  if (sound === undefined || showContactCounts === undefined) return undefined;
  if (skipAnimations !== null && typeof skipAnimations !== 'boolean') return undefined;
  return { sound, skipAnimations, showContactCounts };
}

function parseScore(value: unknown): RunScore | undefined {
  if (!isRecord(value)) return undefined;
  const levelsCleared = wholeNumberOrUndefined(value['levelsCleared']);
  const peopleSaved = wholeNumberOrUndefined(value['peopleSaved']);
  if (levelsCleared === undefined || peopleSaved === undefined) return undefined;
  return { levelsCleared, peopleSaved };
}

const RUN_PHASES: readonly RunPhase[] = ['playing', 'choosing', 'failed', 'over'];

/** The most taps a stored level may claim: twice the largest network, far above any real level. */
const MAXIMUM_STORED_LEVEL_MOVES = 2 * LARGEST_LEVEL_NODE_COUNT;

/**
 * The current level's taps, structurally checked. Whether they are legal for the level is only
 * known with its puzzle, so the level checks that when it replays them (`level-view.ts`).
 */
function parseLevelMoves(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length > MAXIMUM_STORED_LEVEL_MOVES) return undefined;
  const moves: unknown[] = value;
  return moves.every((node) => isWholeNumber(node) && node < LARGEST_LEVEL_NODE_COUNT)
    ? (moves as number[])
    : undefined;
}

function parseRun(value: unknown, storedVersion: number): RunState | undefined {
  if (!isRecord(value)) return undefined;
  const { seed, level, picks, phase } = value;
  if (!isRunSeed(seed)) return undefined;
  if (!isWholeNumber(level) || level < 1 || level > MAXIMUM_STORED_LEVEL) return undefined;
  if (!Array.isArray(picks) || !picks.every(isUpgradeId)) return undefined;
  const upgradePicks: UpgradeId[] = picks;
  for (const [id, stacks] of countUpgrades(upgradePicks))
    if (stacks > UPGRADES[id].maximumStacks) return undefined;
  if (typeof phase !== 'string' || !(RUN_PHASES as readonly string[]).includes(phase))
    return undefined;
  const levelsCleared = wholeNumberOrUndefined(value['levelsCleared']);
  const peopleSaved = wholeNumberOrUndefined(value['peopleSaved']);
  const movesPlayed = wholeNumberOrUndefined(value['movesPlayed']);
  const rerollsThisOffer = wholeNumberOrUndefined(value['rerollsThisOffer']);
  const freeRerollsLeft = wholeNumberOrUndefined(value['freeRerollsLeft']);
  const secondChanceUsed = booleanOrUndefined(value['secondChanceUsed']);
  const lastResult = value['lastResult'] === null ? null : parseLevelResult(value['lastResult']);
  if (
    levelsCleared === undefined ||
    levelsCleared > (phase === 'choosing' || phase === 'over' ? level : level - 1) ||
    peopleSaved === undefined ||
    movesPlayed === undefined ||
    rerollsThisOffer === undefined ||
    freeRerollsLeft === undefined ||
    secondChanceUsed === undefined ||
    lastResult === undefined
  )
    return undefined;
  const runPhase = phase as RunPhase;
  if ((runPhase === 'choosing' || runPhase === 'failed') && lastResult?.level !== level)
    return undefined;
  // A version 1 run has no level progress; a bad one restarts the level rather than the run.
  const storedMoves = storedVersion === 1 ? [] : parseLevelMoves(value['levelMoves']);
  const storedUndos = storedVersion === 1 ? 0 : wholeNumberOrUndefined(value['levelUndosUsed']);
  const progressIsValid =
    runPhase === 'playing' && storedMoves !== undefined && storedUndos !== undefined;
  return {
    seed,
    level,
    picks: upgradePicks,
    levelsCleared,
    peopleSaved,
    movesPlayed,
    secondChanceUsed,
    rerollsThisOffer,
    freeRerollsLeft,
    phase: runPhase,
    lastResult,
    levelMoves: progressIsValid ? storedMoves : [],
    levelUndosUsed: progressIsValid ? storedUndos : 0,
  };
}

function parseLevelResult(value: unknown): LevelResult | undefined {
  if (!isRecord(value) || !isRecord(value['counts'])) return undefined;
  const level = wholeNumberOrUndefined(value['level']);
  const savedPercent = wholeNumberOrUndefined(value['savedPercent']);
  const passThresholdPercent = wholeNumberOrUndefined(value['passThresholdPercent']);
  const moves = wholeNumberOrUndefined(value['moves']);
  const passed = booleanOrUndefined(value['passed']);
  const nearMiss = booleanOrUndefined(value['nearMiss']);
  const counts = value['counts'];
  const vaccinated = wholeNumberOrUndefined(counts['vaccinated']);
  const quarantined = wholeNumberOrUndefined(counts['quarantined']);
  const untouched = wholeNumberOrUndefined(counts['untouched']);
  const infected = wholeNumberOrUndefined(counts['infected']);
  if (
    level === undefined ||
    savedPercent === undefined ||
    savedPercent > 100 ||
    passThresholdPercent === undefined ||
    moves === undefined ||
    passed === undefined ||
    nearMiss === undefined ||
    vaccinated === undefined ||
    quarantined === undefined ||
    untouched === undefined ||
    infected === undefined
  )
    return undefined;
  return {
    level,
    counts: { vaccinated, quarantined, untouched, infected },
    savedPercent,
    passThresholdPercent,
    passed,
    nearMiss,
    moves,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function wholeNumberOrUndefined(value: unknown): number | undefined {
  return isWholeNumber(value) ? value : undefined;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
