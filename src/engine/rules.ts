import {
  chooseIndexPatients,
  isOutbreakContained,
  type GameEvent,
  type GameState,
  type GameStep,
  type NodeStatus,
  type Transmission,
} from './game';
import type { Incidence } from './graph';
import type { Puzzle } from './puzzle';
import { createStreamRandom, shuffledCopy } from './random';

/**
 * Optional rules on top of the classic game in `game.ts`, used by Germle Endless's upgrades.
 * Every option defaults to off ({@link CLASSIC_RULES}); with the defaults, every function here
 * returns exactly what its classic counterpart returns (`rules.test.ts` proves it on every locked
 * puzzle). The daily, archive and practice games never use this module.
 *
 * Import it directly (`engine/rules`), not through `engine/index.ts`: re-exporting it from the
 * barrel changes how germle.com's build splits its chunks, so `dist/` would no longer be
 * byte-for-byte what `main` builds.
 */
export interface GameRules {
  /**
   * Quarantines per day: the outbreak advances one turn after every this-many quarantines,
   * instead of after each one. Classic: 1.
   */
  readonly quarantinesPerDay: number;
  /** Quarantines at the start of the outbreak phase that pass no day at all. Classic: 0. */
  readonly quarantinesBeforeFirstSpread: number;
  /**
   * Shields healthy people next to vaccinated ones: the transmission probability into a person
   * is multiplied by this factor once per vaccinated neighbour. Classic: 1 (no shield).
   */
  readonly vaccinatedNeighbourTransmissionFactor: number;
  /**
   * When true, a day on which no roll succeeds infects nobody. Classic: false, the never-fizzle
   * rule that infects the person behind the lowest roll.
   */
  readonly spreadCanFizzle: boolean;
  /**
   * People who start immune: drawn from the `immunity` stream before the game starts, shown and
   * counted as vaccinated, without spending a vaccine. Classic: 0.
   */
  readonly naturallyImmuneCount: number;
  /**
   * Choose the index patients when the game starts instead of when the vaccines run out, so the
   * player sees them while vaccinating. They cannot be vaccinated. Classic: false.
   */
  readonly indexPatientsKnownInAdvance: boolean;
}

/** All options off: the classic rules of `docs/ENGINE.md`. */
export const CLASSIC_RULES: GameRules = Object.freeze({
  quarantinesPerDay: 1,
  quarantinesBeforeFirstSpread: 0,
  vaccinatedNeighbourTransmissionFactor: 1,
  spreadCanFizzle: false,
  naturallyImmuneCount: 0,
  indexPatientsKnownInAdvance: false,
});

/**
 * Checks that rules are usable: whole, non-negative counts, at least one quarantine per day and a
 * shield factor in `[0, 1]`.
 *
 * @returns The same rules, for chaining.
 * @throws RangeError naming the first option that is out of range.
 */
export function validateGameRules(rules: GameRules): GameRules {
  const requireInteger = (name: string, value: number, minimum: number): void => {
    if (!Number.isInteger(value) || value < minimum)
      throw new RangeError(`${name} must be an integer of at least ${minimum}, got ${value}`);
  };
  requireInteger('quarantinesPerDay', rules.quarantinesPerDay, 1);
  requireInteger('quarantinesBeforeFirstSpread', rules.quarantinesBeforeFirstSpread, 0);
  requireInteger('naturallyImmuneCount', rules.naturallyImmuneCount, 0);
  const factor = rules.vaccinatedNeighbourTransmissionFactor;
  if (!Number.isFinite(factor) || factor < 0 || factor > 1)
    throw new RangeError(`vaccinatedNeighbourTransmissionFactor must be in [0, 1], got ${factor}`);
  return rules;
}

/** The opening state under `rules`; the counterpart of `startGame`. */
export function startGameWithRules(puzzle: Puzzle, rules: GameRules): GameStep {
  const nodeStatuses = new Array<NodeStatus>(puzzle.config.nodeCount).fill('susceptible');
  for (const node of chooseNaturallyImmune(puzzle, rules.naturallyImmuneCount))
    nodeStatuses[node] = 'vaccinated';
  const indexPatients = rules.indexPatientsKnownInAdvance
    ? chooseIndexPatients(
        puzzle.graph,
        nodeStatuses,
        puzzle.config.indexPatientCount,
        puzzle.createOutbreakRandom(),
      )
    : [];
  const vaccinatable = nodeStatuses.filter(
    (status, node) =>
      status === 'susceptible' && puzzle.isRefuser[node] !== true && !indexPatients.includes(node),
  ).length;
  const draft: MutableGameState = {
    phase: 'vaccinate',
    nodeStatuses,
    vaccinesRemaining: Math.min(puzzle.config.vaccineCount, vaccinatable),
    quarantineCount: 0,
    turnsElapsed: 0,
    indexPatients,
    moves: [],
  };
  const events: GameEvent[] = [];
  if (draft.vaccinesRemaining === 0) startOutbreak(puzzle, draft, events);
  return { state: draft, events };
}

/**
 * Whether tapping the node is legal; the counterpart of `isTappable`. Index patients known in
 * advance cannot be vaccinated.
 */
export function isTappableWithRules(puzzle: Puzzle, state: GameState, node: number): boolean {
  if (state.nodeStatuses[node] !== 'susceptible') return false;
  switch (state.phase) {
    case 'vaccinate':
      return puzzle.isRefuser[node] !== true && !state.indexPatients.includes(node);
    case 'quarantine':
      return true;
    case 'ended':
      return false;
  }
}

/**
 * Plays one tap under `rules`; the counterpart of `applyTap`. A quarantine passes a day only
 * once the free quarantines are used up, and then after every `quarantinesPerDay` of them; a
 * quarantine that passes no day still ends the game if it contains the outbreak.
 *
 * @throws Error if the tap is not legal; check {@link isTappableWithRules} first.
 */
export function applyTapWithRules(
  puzzle: Puzzle,
  rules: GameRules,
  state: GameState,
  node: number,
): GameStep {
  if (!isTappableWithRules(puzzle, state, node)) {
    throw new Error(`Node ${node} is not tappable in phase ${state.phase}`);
  }
  const draft: MutableGameState = {
    ...state,
    nodeStatuses: state.nodeStatuses.slice(),
    moves: [...state.moves, node],
  };
  const events: GameEvent[] = [];
  if (draft.phase === 'vaccinate') {
    draft.nodeStatuses[node] = 'vaccinated';
    draft.vaccinesRemaining -= 1;
    events.push({ kind: 'vaccinated', node });
    if (draft.vaccinesRemaining === 0) startOutbreak(puzzle, draft, events);
  } else {
    draft.nodeStatuses[node] = 'quarantined';
    draft.quarantineCount += 1;
    events.push({ kind: 'quarantined', node });
    const countedQuarantines = draft.quarantineCount - rules.quarantinesBeforeFirstSpread;
    if (countedQuarantines > 0 && countedQuarantines % rules.quarantinesPerDay === 0)
      advanceEpidemicOneTurn(puzzle, rules, draft, events);
    else endGameIfContained(puzzle, draft, events);
  }
  return { state: draft, events };
}

/**
 * Replays a move list under `rules` from the start; the counterpart of `replayMoves`. Used to
 * undo a move.
 *
 * @param moves - Untrusted input; each move is checked before it is applied.
 * @returns The resulting state, or `undefined` if any move is illegal at its point in the game.
 */
export function replayMovesWithRules(
  puzzle: Puzzle,
  rules: GameRules,
  moves: readonly number[],
): GameState | undefined {
  let state = startGameWithRules(puzzle, rules).state;
  for (const node of moves) {
    if (!Number.isInteger(node) || node < 0 || node >= puzzle.config.nodeCount) return undefined;
    if (!isTappableWithRules(puzzle, state, node)) return undefined;
    state = applyTapWithRules(puzzle, rules, state, node).state;
  }
  return state;
}

/**
 * Contact tracing: the people the next day of spread would infect if no one else left the
 * network first. The rolls are fixed in advance, so this is exact, not a guess; quarantining one
 * of them changes the answer (under the never-fizzle rule someone else may then be infected).
 *
 * @returns Node indices in ascending order; empty outside the outbreak phase.
 */
export function predictNextDayInfections(
  puzzle: Puzzle,
  rules: GameRules,
  state: GameState,
): number[] {
  if (state.phase !== 'quarantine') return [];
  return spreadForTurn(puzzle, rules, state.nodeStatuses, state.turnsElapsed).newlyInfected.sort(
    (left, right) => left - right,
  );
}

/**
 * How many more quarantines it takes, counting the next one, until a day passes: 1 under the
 * classic rules, more while free quarantines last or with several quarantines per day.
 */
export function quarantinesUntilNextDay(rules: GameRules, state: GameState): number {
  const counted = state.quarantineCount - rules.quarantinesBeforeFirstSpread;
  return counted < 0
    ? -counted + rules.quarantinesPerDay
    : rules.quarantinesPerDay - (counted % rules.quarantinesPerDay);
}

type MutableGameState = Omit<
  { -readonly [Key in keyof GameState]: GameState[Key] },
  'nodeStatuses'
> & {
  nodeStatuses: NodeStatus[];
};

function chooseNaturallyImmune(puzzle: Puzzle, count: number): number[] {
  if (count === 0) return [];
  const everyone = Array.from({ length: puzzle.config.nodeCount }, (_, node) => node);
  return shuffledCopy(everyone, createStreamRandom(puzzle.seedKey, 'immunity')).slice(0, count);
}

function startOutbreak(puzzle: Puzzle, draft: MutableGameState, events: GameEvent[]): void {
  const indexPatients =
    draft.indexPatients.length > 0
      ? draft.indexPatients
      : chooseIndexPatients(
          puzzle.graph,
          draft.nodeStatuses,
          puzzle.config.indexPatientCount,
          puzzle.createOutbreakRandom(),
        );
  for (const node of indexPatients) draft.nodeStatuses[node] = 'infected';
  draft.indexPatients = indexPatients;
  draft.phase = 'quarantine';
  events.push({ kind: 'outbreak-started', indexPatients });
  endGameIfContained(puzzle, draft, events);
}

interface Spread {
  readonly transmissions: Transmission[];
  readonly newlyInfected: number[];
  readonly forced: boolean;
}

/** The infections one turn's rolls cause from `statuses`, without changing anything. */
function spreadForTurn(
  puzzle: Puzzle,
  rules: GameRules,
  statuses: readonly NodeStatus[],
  turn: number,
): Spread {
  const { graph, transmissionRolls } = puzzle;
  const { transmissionProbability } = puzzle.config;
  const shieldFactor = rules.vaccinatedNeighbourTransmissionFactor;
  const transmissions: Transmission[] = [];
  const newlyInfected: number[] = [];
  let lowestRollTransmission: Transmission | undefined;
  let lowestRoll = Infinity;

  for (let node = 0; node < graph.nodeCount; node++) {
    if (statuses[node] !== 'susceptible') continue;
    const incidences = graph.adjacency[node] as readonly Incidence[];
    let threshold = transmissionProbability;
    if (shieldFactor !== 1) {
      for (const { neighbour } of incidences)
        if (statuses[neighbour] === 'vaccinated') threshold *= shieldFactor;
    }
    let isInfectedThisTurn = false;
    for (const { neighbour, edgeIndex } of incidences) {
      if (statuses[neighbour] !== 'infected') continue;
      const roll = transmissionRolls.roll(edgeIndex, turn);
      const transmission = { edgeIndex, fromNode: neighbour, toNode: node };
      if (roll < threshold) {
        transmissions.push(transmission);
        isInfectedThisTurn = true;
      }
      const isLowerRoll =
        roll < lowestRoll ||
        (roll === lowestRoll && edgeIndex < (lowestRollTransmission?.edgeIndex ?? Infinity));
      if (isLowerRoll) {
        lowestRoll = roll;
        lowestRollTransmission = transmission;
      }
    }
    if (isInfectedThisTurn) newlyInfected.push(node);
  }

  if (
    newlyInfected.length === 0 &&
    lowestRollTransmission !== undefined &&
    !rules.spreadCanFizzle
  ) {
    return {
      transmissions: [lowestRollTransmission],
      newlyInfected: [lowestRollTransmission.toNode],
      forced: true,
    };
  }
  return { transmissions, newlyInfected, forced: false };
}

function advanceEpidemicOneTurn(
  puzzle: Puzzle,
  rules: GameRules,
  draft: MutableGameState,
  events: GameEvent[],
): void {
  const turn = draft.turnsElapsed;
  const { transmissions, newlyInfected, forced } = spreadForTurn(
    puzzle,
    rules,
    draft.nodeStatuses,
    turn,
  );
  for (const node of newlyInfected) draft.nodeStatuses[node] = 'infected';
  draft.turnsElapsed = turn + 1;
  events.push({ kind: 'spread', turn, transmissions, forced });
  endGameIfContained(puzzle, draft, events);
}

function endGameIfContained(puzzle: Puzzle, draft: MutableGameState, events: GameEvent[]): void {
  if (isOutbreakContained(puzzle.graph, draft.nodeStatuses)) {
    draft.phase = 'ended';
    events.push({ kind: 'ended' });
  }
}
