import { findConnectedComponents, type Graph, type Incidence } from './graph';
import type { Puzzle } from './puzzle';
import { shuffledCopy, type RandomSource } from './random';

/** What has happened to a person so far. Refusal is a puzzle property, not a status. */
export type NodeStatus = 'susceptible' | 'infected' | 'vaccinated' | 'quarantined';

/**
 * `vaccinate`: the player spends vaccines. `quarantine`: the outbreak is running and every
 * quarantine advances it one turn. `ended`: no infected person can reach a susceptible one.
 */
export type GamePhase = 'vaccinate' | 'quarantine' | 'ended';

/** A complete, JSON-serialisable snapshot of a game. Never mutated; each move returns a new one. */
export interface GameState {
  readonly phase: GamePhase;
  /** `nodeStatuses[node]` for every node of the puzzle graph. */
  readonly nodeStatuses: readonly NodeStatus[];
  readonly vaccinesRemaining: number;
  readonly quarantineCount: number;
  /** Epidemic turns played so far; the next turn uses transmission rolls at this index. */
  readonly turnsElapsed: number;
  /** People infected when the outbreak started, empty until then. */
  readonly indexPatients: readonly number[];
  /** Every node the player tapped, in order. Replaying these reproduces this state exactly. */
  readonly moves: readonly number[];
}

/** One infection along one edge during a spread turn. */
export interface Transmission {
  readonly edgeIndex: number;
  readonly fromNode: number;
  readonly toNode: number;
}

/** What a move caused, in order, for the renderer to animate. */
export type GameEvent =
  | { readonly kind: 'vaccinated'; readonly node: number }
  | { readonly kind: 'outbreak-started'; readonly indexPatients: readonly number[] }
  | { readonly kind: 'quarantined'; readonly node: number }
  | {
      readonly kind: 'spread';
      readonly turn: number;
      readonly transmissions: readonly Transmission[];
      /** True when no roll succeeded and the lowest-roll edge was used so the turn infects someone. */
      readonly forced: boolean;
    }
  | { readonly kind: 'ended' };

/** The state after a move together with the events that led to it. */
export interface GameStep {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Final tally of the population. The four counts sum to the node count. */
export interface OutcomeCounts {
  readonly vaccinated: number;
  readonly quarantined: number;
  readonly untouched: number;
  readonly infected: number;
}

/**
 * The opening state of a puzzle. If the config has no vaccines the outbreak starts immediately,
 * which the returned events report.
 */
export function startGame(puzzle: Puzzle): GameStep {
  const nodeStatuses = new Array<NodeStatus>(puzzle.config.nodeCount).fill('susceptible');
  const draft: MutableGameState = {
    phase: 'vaccinate',
    nodeStatuses,
    vaccinesRemaining: puzzle.config.vaccineCount,
    quarantineCount: 0,
    turnsElapsed: 0,
    indexPatients: [],
    moves: [],
  };
  const events: GameEvent[] = [];
  if (draft.vaccinesRemaining === 0) startOutbreak(puzzle, draft, events);
  return { state: draft, events };
}

/**
 * Whether tapping the node is a legal move: a susceptible non-refuser while vaccinating, any
 * susceptible person while quarantining, nothing once the game has ended.
 */
export function isTappable(puzzle: Puzzle, state: GameState, node: number): boolean {
  if (state.nodeStatuses[node] !== 'susceptible') return false;
  switch (state.phase) {
    case 'vaccinate':
      return puzzle.isRefuser[node] !== true;
    case 'quarantine':
      return true;
    case 'ended':
      return false;
  }
}

/**
 * Plays one tap. While vaccinating, vaccinates the node; spending the last vaccine starts the
 * outbreak. While quarantining, quarantines the node and then advances the epidemic exactly one
 * turn. After each turn the game ends if the outbreak is contained.
 *
 * @throws Error if the tap is not legal; check {@link isTappable} first.
 */
export function applyTap(puzzle: Puzzle, state: GameState, node: number): GameStep {
  if (!isTappable(puzzle, state, node)) {
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
    advanceEpidemicOneTurn(puzzle, draft, events);
  }
  return { state: draft, events };
}

/**
 * Replays a move list from the start of the puzzle, for restoring a saved game.
 *
 * @param moves - Untrusted input (e.g. from storage); each move is checked before it is applied.
 * @returns The resulting state, or `undefined` if any move is illegal at its point in the game.
 */
export function replayMoves(puzzle: Puzzle, moves: readonly number[]): GameState | undefined {
  let state = startGame(puzzle).state;
  for (const node of moves) {
    if (!Number.isInteger(node) || node < 0 || node >= puzzle.config.nodeCount) return undefined;
    if (!isTappable(puzzle, state, node)) return undefined;
    state = applyTap(puzzle, state, node).state;
  }
  return state;
}

/** Counts the population by final fate. */
export function countOutcomes(state: GameState): OutcomeCounts {
  let vaccinated = 0;
  let quarantined = 0;
  let untouched = 0;
  let infected = 0;
  for (const status of state.nodeStatuses) {
    if (status === 'vaccinated') vaccinated++;
    else if (status === 'quarantined') quarantined++;
    else if (status === 'susceptible') untouched++;
    else infected++;
  }
  return { vaccinated, quarantined, untouched, infected };
}

/** The score: the percentage of people never infected, rounded half up to an integer. */
export function scorePercent(counts: OutcomeCounts): number {
  const saved = counts.vaccinated + counts.quarantined + counts.untouched;
  return Math.round((100 * saved) / (saved + counts.infected));
}

/**
 * True when no connected group of remaining people (susceptible or infected) contains both an
 * infected and a susceptible person, i.e. the outbreak has nowhere left to go.
 */
export function isOutbreakContained(graph: Graph, nodeStatuses: readonly NodeStatus[]): boolean {
  const isPresent = (node: number): boolean => {
    const status = nodeStatuses[node];
    return status === 'susceptible' || status === 'infected';
  };
  return findConnectedComponents(graph, isPresent).every((component) => {
    const hasInfected = component.some((node) => nodeStatuses[node] === 'infected');
    const hasSusceptible = component.some((node) => nodeStatuses[node] === 'susceptible');
    return !(hasInfected && hasSusceptible);
  });
}

/**
 * Picks index patients among currently susceptible people (refusers included), never adjacent to
 * each other when that is possible. The candidates are shuffled once; then, trying each candidate
 * in shuffled order as the first pick, the rest are filled greedily in shuffled order with people
 * not adjacent to any pick so far. The first fully non-adjacent set wins. For two index patients
 * this finds a non-adjacent pair whenever one exists. If none does, the first greedy attempt is
 * topped up in shuffled order.
 *
 * @param random - The puzzle's `outbreaks` stream.
 */
export function chooseIndexPatients(
  graph: Graph,
  nodeStatuses: readonly NodeStatus[],
  indexPatientCount: number,
  random: RandomSource,
): number[] {
  const candidates = nodeStatuses.flatMap((status, node) =>
    status === 'susceptible' ? [node] : [],
  );
  const shuffledCandidates = shuffledCopy(candidates, random);
  const targetCount = Math.min(indexPatientCount, shuffledCandidates.length);
  let firstAttempt: number[] | undefined;
  for (let firstPickIndex = 0; firstPickIndex < shuffledCandidates.length; firstPickIndex++) {
    const picks = [shuffledCandidates[firstPickIndex] as number];
    for (const candidate of shuffledCandidates) {
      if (picks.length === targetCount) break;
      if (picks.includes(candidate)) continue;
      const isAdjacentToPick = (graph.adjacency[candidate] as readonly Incidence[]).some(
        ({ neighbour }) => picks.includes(neighbour),
      );
      if (!isAdjacentToPick) picks.push(candidate);
    }
    if (picks.length === targetCount) return picks;
    firstAttempt ??= picks;
  }
  const toppedUp = firstAttempt ?? [];
  for (const candidate of shuffledCandidates) {
    if (toppedUp.length === targetCount) break;
    if (!toppedUp.includes(candidate)) toppedUp.push(candidate);
  }
  return toppedUp;
}

type MutableGameState = Omit<
  { -readonly [Key in keyof GameState]: GameState[Key] },
  'nodeStatuses'
> & {
  nodeStatuses: NodeStatus[];
};

function startOutbreak(puzzle: Puzzle, draft: MutableGameState, events: GameEvent[]): void {
  const indexPatients = chooseIndexPatients(
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

function advanceEpidemicOneTurn(
  puzzle: Puzzle,
  draft: MutableGameState,
  events: GameEvent[],
): void {
  const { graph, transmissionRolls } = puzzle;
  const { transmissionProbability } = puzzle.config;
  const turn = draft.turnsElapsed;
  const statuses = draft.nodeStatuses;
  const transmissions: Transmission[] = [];
  const newlyInfected: number[] = [];
  let lowestRollTransmission: Transmission | undefined;
  let lowestRoll = Infinity;

  for (let node = 0; node < graph.nodeCount; node++) {
    if (statuses[node] !== 'susceptible') continue;
    let isInfectedThisTurn = false;
    for (const { neighbour, edgeIndex } of graph.adjacency[node] as readonly Incidence[]) {
      if (statuses[neighbour] !== 'infected') continue;
      const roll = transmissionRolls.roll(edgeIndex, turn);
      const transmission = { edgeIndex, fromNode: neighbour, toNode: node };
      if (roll < transmissionProbability) {
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

  let forced = false;
  if (newlyInfected.length === 0 && lowestRollTransmission !== undefined) {
    transmissions.push(lowestRollTransmission);
    newlyInfected.push(lowestRollTransmission.toNode);
    forced = true;
  }
  for (const node of newlyInfected) statuses[node] = 'infected';
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
