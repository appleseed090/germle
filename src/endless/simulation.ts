import { contactsStillInNetwork, type GameState } from '../engine/game';
import type { Incidence } from '../engine/graph';
import { createMulberry32, hashStringFnv1a32, type RandomSource } from '../engine/random';
import {
  applyTapWithRules,
  isTappableWithRules,
  predictNextDayInfections,
  startGameWithRules,
} from '../engine/rules';
import { prepareLevel, type PreparedLevel } from './levels';
import {
  canUseSecondChance,
  currentOffer,
  endRun,
  finishLevel,
  judgeLevel,
  pickUpgrade,
  skipOffer,
  startRun,
  useSecondChance,
  type RunStartOptions,
  type RunState,
} from './run';
import { UPGRADE_IDS, type UpgradeId } from './upgrades';

/**
 * A simple greedy player's next move, for balancing, the title screen's backdrop and the covers.
 * Vaccinates whoever has the most contacts still in the network (with Early Warning, neighbours
 * of the known index patients first); quarantines the healthy person touching the most infected
 * people, then the most contacts (with Contact Tracing, someone about to be infected). It never
 * undoes.
 *
 * @returns A tappable node; the game must not have ended.
 */
export function chooseBotMove(prepared: PreparedLevel, state: GameState): number {
  const { puzzle, rules, contactTracing } = prepared;
  const contacts = contactsStillInNetwork(puzzle.graph, state.nodeStatuses);
  const atRisk =
    contactTracing && state.phase === 'quarantine'
      ? new Set(predictNextDayInfections(puzzle, rules, state))
      : new Set<number>();
  let chosenNode = -1;
  let chosenPriority = -Infinity;
  for (let node = 0; node < puzzle.config.nodeCount; node++) {
    if (!isTappableWithRules(puzzle, state, node)) continue;
    const neighbours = puzzle.graph.adjacency[node] as readonly Incidence[];
    const contactCount = contacts[node] ?? 0;
    let priority: number;
    if (state.phase === 'vaccinate') {
      const besideIndexPatient = neighbours.some(({ neighbour }) =>
        state.indexPatients.includes(neighbour),
      );
      priority = (besideIndexPatient ? 1000 : 0) + contactCount;
    } else {
      const infectedNeighbours = neighbours.filter(
        ({ neighbour }) => state.nodeStatuses[neighbour] === 'infected',
      ).length;
      priority = (atRisk.has(node) ? 100_000 : 0) + infectedNeighbours * 1000 + contactCount;
    }
    if (priority > chosenPriority) {
      chosenNode = node;
      chosenPriority = priority;
    }
  }
  return chosenNode;
}

/**
 * Plays a level with {@link chooseBotMove} until it ends, or until `maximumMoves` moves.
 *
 * @returns The last state reached.
 */
export function playLevelWithBot(prepared: PreparedLevel, maximumMoves = Infinity): GameState {
  const { puzzle, rules } = prepared;
  let state = startGameWithRules(puzzle, rules).state;
  for (let moves = 0; state.phase !== 'ended' && moves < maximumMoves; moves++)
    state = applyTapWithRules(puzzle, rules, state, chooseBotMove(prepared, state)).state;
  return state;
}

/**
 * The order in which the bot values upgrades: it takes the first one offered. A rough guess at
 * what a player would pick, not a claim about which is best.
 */
export const BOT_UPGRADE_PREFERENCE: readonly UpgradeId[] = [
  'double-shift',
  'extra-vaccine',
  'contact-tracing',
  'safety-margin',
  'smaller-outbreak',
  'early-warning',
  'rapid-response',
  'ring-vaccination',
  'burnout',
  'masks',
  'natural-immunity',
  'outreach',
  'second-opinion',
];

/** What the simulator records about one run. */
export interface SimulatedRun {
  readonly levelsCleared: number;
  readonly peopleSaved: number;
  /** Taps over the whole run, including a replayed level. */
  readonly moves: number;
  /** Levels played, including a replayed level. */
  readonly levelsPlayed: number;
  readonly offered: ReadonlyMap<UpgradeId, number>;
  readonly picked: ReadonlyMap<UpgradeId, number>;
  readonly usedSecondChance: boolean;
  readonly firstLevelMoves: number;
}

export interface SimulationOptions {
  readonly unlocked: ReadonlySet<UpgradeId>;
  readonly start: RunStartOptions;
  /** Whether the bot watches the rewarded ad for a second chance when it fails. */
  readonly takesSecondChance: boolean;
  /** Chance of picking a random offered upgrade instead of the preferred one. */
  readonly randomPickChance: number;
  /** Stops a run that somehow never fails. */
  readonly maximumLevels: number;
}

/** Plays one whole run with the bot. Deterministic for a given seed and options. */
export function simulateRun(seed: string, options: SimulationOptions): SimulatedRun {
  const random: RandomSource = createMulberry32(hashStringFnv1a32(`simulation:${seed}`));
  const offered = new Map<UpgradeId, number>();
  const picked = new Map<UpgradeId, number>();
  let run: RunState = startRun(seed, options.start);
  let moves = 0;
  let levelsPlayed = 0;
  let firstLevelMoves = 0;
  while (run.phase !== 'over' && run.level <= options.maximumLevels) {
    if (run.phase === 'playing') {
      const prepared = prepareLevel(run.seed, run.level, run.picks);
      const finalState = playLevelWithBot(prepared);
      levelsPlayed++;
      moves += finalState.moves.length;
      if (run.level === 1 && firstLevelMoves === 0) firstLevelMoves = finalState.moves.length;
      run = finishLevel(run, judgeLevel(prepared, finalState));
    } else if (run.phase === 'choosing') {
      const offer = currentOffer(run, options.unlocked);
      for (const id of offer) offered.set(id, (offered.get(id) ?? 0) + 1);
      if (offer.length === 0) {
        run = skipOffer(run);
        continue;
      }
      const choice =
        random() < options.randomPickChance
          ? (offer[Math.floor(random() * offer.length)] as UpgradeId)
          : (BOT_UPGRADE_PREFERENCE.find((id) => offer.includes(id)) as UpgradeId);
      picked.set(choice, (picked.get(choice) ?? 0) + 1);
      run = pickUpgrade(run, choice, offer);
    } else {
      run =
        options.takesSecondChance && canUseSecondChance(run) ? useSecondChance(run) : endRun(run);
    }
  }
  return {
    levelsCleared: run.levelsCleared,
    peopleSaved: run.peopleSaved,
    moves,
    levelsPlayed,
    offered,
    picked,
    usedSecondChance: run.secondChanceUsed,
    firstLevelMoves,
  };
}

/** Rough wall-clock model for a human: seconds per tap (with its animation) and per level. */
export const PLAY_TIME_MODEL = Object.freeze({
  secondsPerMove: 2.2,
  secondsPerLevelTransition: 10,
});

/** Estimated minutes a human would take for a simulated run. */
export function estimatedRunMinutes(run: SimulatedRun): number {
  return (
    (run.moves * PLAY_TIME_MODEL.secondsPerMove +
      run.levelsPlayed * PLAY_TIME_MODEL.secondsPerLevelTransition) /
    60
  );
}

/** Aggregate numbers over many simulated runs. */
export interface SimulationReport {
  readonly runs: number;
  readonly levelsCleared: Percentiles;
  readonly estimatedMinutes: Percentiles;
  readonly moves: Percentiles;
  /** Share of runs that cleared level 1. */
  readonly clearedFirstLevelShare: number;
  readonly reachedLevel20Share: number;
  readonly firstLevelMoves: Percentiles;
  readonly upgrades: readonly {
    readonly id: UpgradeId;
    readonly offered: number;
    readonly picked: number;
    /** Picked when offered. */
    readonly pickRate: number;
    /** Share of all picks. */
    readonly pickShare: number;
  }[];
}

export interface Percentiles {
  readonly mean: number;
  readonly p10: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly p90: number;
  readonly maximum: number;
}

/** Summarises simulated runs. */
export function summariseRuns(runs: readonly SimulatedRun[]): SimulationReport {
  const totalPicks = runs.reduce(
    (sum, run) => sum + [...run.picked.values()].reduce((a, b) => a + b, 0),
    0,
  );
  return {
    runs: runs.length,
    levelsCleared: percentiles(runs.map((run) => run.levelsCleared)),
    estimatedMinutes: percentiles(runs.map(estimatedRunMinutes)),
    moves: percentiles(runs.map((run) => run.moves)),
    clearedFirstLevelShare: share(runs, (run) => run.levelsCleared >= 1),
    reachedLevel20Share: share(runs, (run) => run.levelsCleared >= 19),
    firstLevelMoves: percentiles(runs.map((run) => run.firstLevelMoves)),
    upgrades: UPGRADE_IDS.map((id) => {
      const offered = runs.reduce((sum, run) => sum + (run.offered.get(id) ?? 0), 0);
      const picked = runs.reduce((sum, run) => sum + (run.picked.get(id) ?? 0), 0);
      return {
        id,
        offered,
        picked,
        pickRate: offered === 0 ? 0 : picked / offered,
        pickShare: totalPicks === 0 ? 0 : picked / totalPicks,
      };
    }),
  };
}

function share(runs: readonly SimulatedRun[], test: (run: SimulatedRun) => boolean): number {
  return runs.length === 0 ? 0 : runs.filter(test).length / runs.length;
}

function percentiles(values: readonly number[]): Percentiles {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;
  return {
    mean: sorted.reduce((sum, value) => sum + value, 0) / Math.max(sorted.length, 1),
    p10: at(0.1),
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    maximum: sorted[sorted.length - 1] ?? 0,
  };
}

/** How the bot fares on one level across many seeds, with a fixed set of upgrades. */
export interface LevelCalibration {
  readonly level: number;
  readonly nodeCount: number;
  readonly passThresholdPercent: number;
  readonly savedPercent: Percentiles;
  /** Share of seeds on which the bot passed. */
  readonly passRate: number;
  readonly moves: Percentiles;
}

/** Plays one level on `seedCount` seeds with the given upgrades, for tuning the curves. */
export function calibrateLevel(
  level: number,
  upgrades: readonly UpgradeId[],
  seedCount: number,
): LevelCalibration {
  const results = Array.from({ length: seedCount }, (_, index) => {
    const prepared = prepareLevel(`cal${String(index).padStart(5, '0')}`, level, upgrades);
    return judgeLevel(prepared, playLevelWithBot(prepared));
  });
  const first = prepareLevel('cal00000', level, upgrades);
  return {
    level,
    nodeCount: first.puzzle.config.nodeCount,
    passThresholdPercent: first.passThresholdPercent,
    savedPercent: percentiles(results.map((result) => result.savedPercent)),
    passRate: results.filter((result) => result.passed).length / seedCount,
    moves: percentiles(results.map((result) => result.moves)),
  };
}
