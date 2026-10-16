import { countOutcomes, scorePercent, type GameState, type OutcomeCounts } from '../engine/game';
import { LEVEL_BALANCE, UPGRADE_BALANCE } from './balance';
import { baseLevelConfig, type PreparedLevel } from './levels';
import { drawUpgradeOffer, offerRandom, type UpgradeId } from './upgrades';

/**
 * Where a run stands. `playing`: a level is under way. `choosing`: a level was just passed and an
 * upgrade must be picked before the next one. `failed`: a level missed its pass mark; the player
 * may take a second chance or end the run. `over`: the run has ended.
 */
export type RunPhase = 'playing' | 'choosing' | 'failed' | 'over';

/** How one finished level went. */
export interface LevelResult {
  readonly level: number;
  readonly counts: OutcomeCounts;
  readonly savedPercent: number;
  readonly passThresholdPercent: number;
  readonly passed: boolean;
  /** Within {@link LEVEL_BALANCE.nearMissPoints} of the pass mark, on either side. */
  readonly nearMiss: boolean;
  readonly moves: number;
}

/**
 * A whole run, JSON-serialisable: saved after every level so closing the tab loses at most the
 * level being played. Never mutated; every transition returns a new one.
 */
export interface RunState {
  /** Seeds every level and offer, so a run is reproducible. */
  readonly seed: string;
  /** The level being played, or the one just finished while choosing or failed. */
  readonly level: number;
  /** Upgrades taken, in order; a repeated ID is a stack. */
  readonly picks: readonly UpgradeId[];
  readonly levelsCleared: number;
  /** People saved over the cleared levels: the score's tiebreaker. */
  readonly peopleSaved: number;
  /** Taps over every finished level, for run length statistics. */
  readonly movesPlayed: number;
  readonly secondChanceUsed: boolean;
  /** Rerolls taken on the current offer; part of the offer's seed. */
  readonly rerollsThisOffer: number;
  /** Rerolls the run may still take without watching an ad. */
  readonly freeRerollsLeft: number;
  readonly phase: RunPhase;
  readonly lastResult: LevelResult | null;
}

/** A run's score: levels cleared, then people saved. */
export interface RunScore {
  readonly levelsCleared: number;
  readonly peopleSaved: number;
}

/** What a run starts with, from Research (see `research.ts`). */
export interface RunStartOptions {
  readonly startingPicks: readonly UpgradeId[];
  readonly freeRerolls: number;
}

const RUN_SEED_LENGTH = 8;

/**
 * A new random run seed of lowercase letters and digits.
 *
 * @param random - Any `[0, 1)` source; the game passes `Math.random`.
 */
export function createRunSeed(random: () => number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(
    { length: RUN_SEED_LENGTH },
    () => alphabet[Math.floor(random() * alphabet.length)],
  ).join('');
}

/** Whether a seed has the shape {@link createRunSeed} makes; for untrusted saves. */
export function isRunSeed(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{8}$/.test(value);
}

/** A fresh run at level 1. */
export function startRun(seed: string, options: RunStartOptions): RunState {
  return {
    seed,
    level: 1,
    picks: [...options.startingPicks],
    levelsCleared: 0,
    peopleSaved: 0,
    movesPlayed: 0,
    secondChanceUsed: false,
    rerollsThisOffer: 0,
    freeRerollsLeft: options.freeRerolls,
    phase: 'playing',
    lastResult: null,
  };
}

/** Judges a finished level against its pass mark. */
export function judgeLevel(prepared: PreparedLevel, finalState: GameState): LevelResult {
  const counts = countOutcomes(finalState);
  const savedPercent = scorePercent(counts);
  const passThresholdPercent = prepared.passThresholdPercent;
  return {
    level: prepared.level,
    counts,
    savedPercent,
    passThresholdPercent,
    passed: savedPercent >= passThresholdPercent,
    nearMiss: Math.abs(savedPercent - passThresholdPercent) <= LEVEL_BALANCE.nearMissPoints,
    moves: finalState.moves.length,
  };
}

/**
 * Records a finished level: a pass adds it to the score and moves on to choosing an upgrade; a
 * miss leaves the run `failed`.
 *
 * @throws Error unless the run is `playing` that level.
 */
export function finishLevel(run: RunState, result: LevelResult): RunState {
  requirePhase(run, 'playing');
  if (result.level !== run.level)
    throw new Error(`Finished level ${result.level} while playing ${run.level}`);
  const saved = result.counts.vaccinated + result.counts.quarantined + result.counts.untouched;
  return {
    ...run,
    movesPlayed: run.movesPlayed + result.moves,
    levelsCleared: result.passed ? run.levelsCleared + 1 : run.levelsCleared,
    peopleSaved: result.passed ? run.peopleSaved + saved : run.peopleSaved,
    rerollsThisOffer: 0,
    phase: result.passed ? 'choosing' : 'failed',
    lastResult: result,
  };
}

/**
 * The upgrades offered while choosing. Derived from the seed, level and reroll count, so it is
 * the same after a reload and a reload never rerolls for free. Outreach is held back until the
 * next level has refusers, so it is never a pick that does nothing.
 */
export function currentOffer(
  run: RunState,
  unlocked: ReadonlySet<UpgradeId>,
  offerCount: number = UPGRADE_BALANCE.offerCount,
): UpgradeId[] {
  requirePhase(run, 'choosing');
  const nextLevelHasRefusers = baseLevelConfig(run.level + 1).refuserCount > 0;
  return drawUpgradeOffer(
    run.picks,
    nextLevelHasRefusers ? unlocked : new Set([...unlocked].filter((id) => id !== 'outreach')),
    offerCount,
    offerRandom(run.seed, run.level, run.rerollsThisOffer),
  );
}

/**
 * Takes an upgrade from the offer and starts the next level. An empty offer (everything maxed)
 * is passed over with {@link skipOffer}.
 *
 * @throws Error unless the run is `choosing` and the upgrade is in `offer`.
 */
export function pickUpgrade(
  run: RunState,
  upgrade: UpgradeId,
  offer: readonly UpgradeId[],
): RunState {
  requirePhase(run, 'choosing');
  if (!offer.includes(upgrade)) throw new Error(`${upgrade} was not offered`);
  return { ...run, picks: [...run.picks, upgrade], ...nextLevel(run) };
}

/** Starts the next level without an upgrade, for when nothing is left to offer. */
export function skipOffer(run: RunState): RunState {
  requirePhase(run, 'choosing');
  return { ...run, ...nextLevel(run) };
}

/**
 * Draws a new offer. Uses a free reroll if any is left; otherwise the caller must have earned
 * it (a rewarded ad).
 */
export function rerollOffer(run: RunState): RunState {
  requirePhase(run, 'choosing');
  return {
    ...run,
    rerollsThisOffer: run.rerollsThisOffer + 1,
    freeRerollsLeft: Math.max(0, run.freeRerollsLeft - 1),
  };
}

/** Whether a failed run can replay the level it missed. Once per run. */
export function canUseSecondChance(run: RunState): boolean {
  return run.phase === 'failed' && !run.secondChanceUsed;
}

/**
 * Replays the missed level (same network and outbreak) once per run.
 *
 * @throws Error unless {@link canUseSecondChance}.
 */
export function useSecondChance(run: RunState): RunState {
  if (!canUseSecondChance(run)) throw new Error('No second chance available');
  return { ...run, secondChanceUsed: true, phase: 'playing' };
}

/** Ends a failed run. */
export function endRun(run: RunState): RunState {
  requirePhase(run, 'failed');
  return { ...run, phase: 'over' };
}

/** Ends a run the player chose to stop, from any phase; cleared levels still count. */
export function abandonRun(run: RunState): RunState {
  return { ...run, phase: 'over' };
}

/** The score of a run so far. */
export function runScore(run: RunState): RunScore {
  return { levelsCleared: run.levelsCleared, peopleSaved: run.peopleSaved };
}

/** Positive when `a` beats `b`: more levels cleared, then more people saved. */
export function compareRunScores(a: RunScore, b: RunScore): number {
  return a.levelsCleared - b.levelsCleared || a.peopleSaved - b.peopleSaved;
}

function nextLevel(run: RunState): Pick<RunState, 'level' | 'phase' | 'rerollsThisOffer'> {
  return { level: run.level + 1, phase: 'playing', rerollsThisOffer: 0 };
}

function requirePhase(run: RunState, phase: RunPhase): void {
  if (run.phase !== phase) throw new Error(`Run is ${run.phase}, expected ${phase}`);
}
