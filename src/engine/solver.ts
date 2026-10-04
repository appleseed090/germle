import {
  chooseIndexPatients,
  countOutcomes,
  replayMoves,
  scorePercent,
  type NodeStatus,
  type OutcomeCounts,
} from './game';
import type { Graph } from './graph';
import type { Puzzle } from './puzzle';

/**
 * How much work the solver may do. Larger numbers find slightly better solutions more slowly;
 * the defaults keep a solve under 300 ms on a mid-range phone.
 */
export interface SolverBudget {
  /** Most central non-refusers considered for vaccination. */
  readonly vaccinePoolSize: number;
  /** Upper bound on vaccine sets ranked by fragmentation (the pool shrinks to fit). */
  readonly maximumVaccineSetsRanked: number;
  /** Best-fragmenting vaccine sets played out in full. */
  readonly vaccineSetsPlayed: number;
  /** States kept per quarantine depth in the beam search. */
  readonly beamWidth: number;
}

export const DEFAULT_SOLVER_BUDGET: SolverBudget = Object.freeze({
  vaccinePoolSize: 14,
  maximumVaccineSetsRanked: 3000,
  vaccineSetsPlayed: 24,
  beamWidth: 6,
});

/**
 * The default budget for 40 people, cut back for larger practice networks so the solve time
 * stays roughly constant (each simulated game costs about the square of the network size).
 */
export function solverBudgetFor(nodeCount: number): SolverBudget {
  if (nodeCount <= 40) return DEFAULT_SOLVER_BUDGET;
  const shrink = (40 / nodeCount) ** 2;
  return {
    ...DEFAULT_SOLVER_BUDGET,
    vaccineSetsPlayed: Math.max(4, Math.round(DEFAULT_SOLVER_BUDGET.vaccineSetsPlayed * shrink)),
    beamWidth: Math.max(3, Math.round(DEFAULT_SOLVER_BUDGET.beamWidth * Math.sqrt(shrink))),
  };
}

/** A complete game the solver found, verified by replaying it through the engine. */
export interface Solution {
  /** Taps from the opening position: the vaccine set, then the quarantines. */
  readonly moves: readonly number[];
  readonly score: number;
  readonly counts: OutcomeCounts;
}

const SUSCEPTIBLE = 0;
const INFECTED = 1;
const VACCINATED = 2;
const QUARANTINED = 3;

/**
 * Finds a strong game for a puzzle with a fixed amount of search; the result is the puzzle's
 * par. Because transmission rolls are fixed, every candidate is evaluated exactly rather than by
 * sampling.
 *
 * 1. Rank vaccine sets drawn from the most central people (betweenness, then degree) by how
 *    evenly they fragment the network: the sum of squared component sizes after removal.
 * 2. For the best few sets, start the outbreak exactly as the engine would and run a beam search
 *    over quarantines. Candidate quarantines are healthy people within two steps of the
 *    infection; states are ranked by how many healthy people are already cut off from it, then
 *    by how many are still exposed, then by the size of the frontier.
 * 3. Replay the best game through the engine, so the reported score is exactly what a player
 *    making those taps would get.
 *
 * Deterministic: the same puzzle and budget always give the same solution.
 */
export function solvePuzzle(
  puzzle: Puzzle,
  budget: SolverBudget = DEFAULT_SOLVER_BUDGET,
): Solution {
  const simulator = createSimulator(puzzle);
  const vaccineSets = rankVaccineSets(puzzle, budget).slice(0, budget.vaccineSetsPlayed);
  let bestMoves: number[] | undefined;
  let bestSaved = -1;
  for (const vaccineSet of vaccineSets) {
    const statuses = new Uint8Array(puzzle.config.nodeCount);
    for (const node of vaccineSet) statuses[node] = VACCINATED;
    const indexPatients = chooseIndexPatients(
      puzzle.graph,
      Array.from(
        statuses,
        (code) => (code === VACCINATED ? 'vaccinated' : 'susceptible') satisfies NodeStatus,
      ),
      puzzle.config.indexPatientCount,
      puzzle.createOutbreakRandom(),
    );
    for (const node of indexPatients) statuses[node] = INFECTED;
    const outcome = searchQuarantines(simulator, statuses, budget.beamWidth, bestSaved);
    if (outcome !== undefined && outcome.saved > bestSaved) {
      bestSaved = outcome.saved;
      bestMoves = [...vaccineSet, ...outcome.quarantines];
    }
  }
  const moves = bestMoves ?? [];
  const finalState = replayMoves(puzzle, moves);
  if (finalState?.phase !== 'ended')
    throw new Error('Solver produced a game the engine does not finish');
  const counts = countOutcomes(finalState);
  if (puzzle.config.nodeCount - counts.infected !== bestSaved) {
    throw new Error('Solver simulation disagrees with the engine');
  }
  return { moves, score: scorePercent(counts), counts };
}

/** Flat adjacency and pre-fetched rolls for allocation-free simulation. */
interface Simulator {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly neighbourStart: Int32Array;
  readonly neighbourNode: Int32Array;
  readonly neighbourEdge: Int32Array;
  /** `rolls[turn * edgeCount + edge]` for every turn a game can reach. */
  readonly rolls: Float64Array;
  readonly transmissionProbability: number;
}

function createSimulator(puzzle: Puzzle): Simulator {
  const { graph, transmissionRolls } = puzzle;
  const nodeCount = graph.nodeCount;
  const edgeCount = graph.edges.length;
  const neighbourStart = new Int32Array(nodeCount + 1);
  const neighbourNode = new Int32Array(edgeCount * 2);
  const neighbourEdge = new Int32Array(edgeCount * 2);
  let cursor = 0;
  graph.adjacency.forEach((incidences, node) => {
    neighbourStart[node] = cursor;
    for (const { neighbour, edgeIndex } of incidences) {
      neighbourNode[cursor] = neighbour;
      neighbourEdge[cursor] = edgeIndex;
      cursor++;
    }
  });
  neighbourStart[nodeCount] = cursor;
  // Every turn either infects someone or ends the game, so no game outlasts nodeCount + 1 turns.
  const turnCount = nodeCount + 1;
  const rolls = new Float64Array(turnCount * edgeCount);
  for (let turn = 0; turn < turnCount; turn++) {
    for (let edge = 0; edge < edgeCount; edge++)
      rolls[turn * edgeCount + edge] = transmissionRolls.roll(edge, turn);
  }
  return {
    nodeCount,
    edgeCount,
    neighbourStart,
    neighbourNode,
    neighbourEdge,
    rolls,
    transmissionProbability: puzzle.config.transmissionProbability,
  };
}

/** The engine's spread rule on a status array, in place. Must match `advanceEpidemicOneTurn`. */
function spreadOneTurn(
  simulator: Simulator,
  statuses: Uint8Array,
  turn: number,
  scratch: Int32Array,
): void {
  const {
    nodeCount,
    edgeCount,
    neighbourStart,
    neighbourNode,
    neighbourEdge,
    rolls,
    transmissionProbability,
  } = simulator;
  const rollOffset = turn * edgeCount;
  let newlyInfectedCount = 0;
  let lowestRoll = Infinity;
  let lowestRollEdge = Infinity;
  let lowestRollTarget = -1;
  for (let node = 0; node < nodeCount; node++) {
    if (statuses[node] !== SUSCEPTIBLE) continue;
    let isInfectedThisTurn = false;
    const end = neighbourStart[node + 1] as number;
    for (let index = neighbourStart[node] as number; index < end; index++) {
      if (statuses[neighbourNode[index] as number] !== INFECTED) continue;
      const edge = neighbourEdge[index] as number;
      const roll = rolls[rollOffset + edge] as number;
      if (roll < transmissionProbability) isInfectedThisTurn = true;
      if (roll < lowestRoll || (roll === lowestRoll && edge < lowestRollEdge)) {
        lowestRoll = roll;
        lowestRollEdge = edge;
        lowestRollTarget = node;
      }
    }
    if (isInfectedThisTurn) scratch[newlyInfectedCount++] = node;
  }
  if (newlyInfectedCount === 0 && lowestRollTarget >= 0)
    scratch[newlyInfectedCount++] = lowestRollTarget;
  for (let index = 0; index < newlyInfectedCount; index++)
    statuses[scratch[index] as number] = INFECTED;
}

interface ThreatAnalysis {
  readonly isContained: boolean;
  /** Healthy people in groups the infection cannot reach. */
  readonly safeSusceptible: number;
  /** Healthy people sharing a group with the infection. */
  readonly exposedSusceptible: number;
  /** Healthy people next to an infected person. */
  readonly frontier: number;
  readonly infected: number;
}

function analyseThreat(
  simulator: Simulator,
  statuses: Uint8Array,
  componentScratch: Int32Array,
  stack: Int32Array,
): ThreatAnalysis {
  const { nodeCount, neighbourStart, neighbourNode } = simulator;
  componentScratch.fill(-1);
  let safeSusceptible = 0;
  let exposedSusceptible = 0;
  let frontier = 0;
  let infected = 0;
  let componentId = 0;
  for (let start = 0; start < nodeCount; start++) {
    const startStatus = statuses[start] as number;
    if (componentScratch[start] !== -1 || startStatus === VACCINATED || startStatus === QUARANTINED)
      continue;
    let stackSize = 0;
    stack[stackSize++] = start;
    componentScratch[start] = componentId;
    let susceptibleCount = 0;
    let hasInfected = false;
    while (stackSize > 0) {
      const node = stack[--stackSize] as number;
      const status = statuses[node] as number;
      let touchesInfected = false;
      if (status === INFECTED) {
        hasInfected = true;
        infected++;
      } else {
        susceptibleCount++;
      }
      const end = neighbourStart[node + 1] as number;
      for (let index = neighbourStart[node] as number; index < end; index++) {
        const neighbour = neighbourNode[index] as number;
        const neighbourStatus = statuses[neighbour] as number;
        if (neighbourStatus === VACCINATED || neighbourStatus === QUARANTINED) continue;
        if (neighbourStatus === INFECTED) touchesInfected = true;
        if (componentScratch[neighbour] === -1) {
          componentScratch[neighbour] = componentId;
          stack[stackSize++] = neighbour;
        }
      }
      if (status === SUSCEPTIBLE && touchesInfected) frontier++;
    }
    if (hasInfected) exposedSusceptible += susceptibleCount;
    else safeSusceptible += susceptibleCount;
    componentId++;
  }
  return {
    isContained: exposedSusceptible === 0,
    safeSusceptible,
    exposedSusceptible,
    frontier,
    infected,
  };
}

/** Healthy people reachable from the infection through at most two healthy steps. */
function quarantineCandidates(
  simulator: Simulator,
  statuses: Uint8Array,
  distance: Int32Array,
  queue: Int32Array,
): number[] {
  const { nodeCount, neighbourStart, neighbourNode } = simulator;
  distance.fill(-1);
  let head = 0;
  let tail = 0;
  for (let node = 0; node < nodeCount; node++) {
    if (statuses[node] === INFECTED) {
      distance[node] = 0;
      queue[tail++] = node;
    }
  }
  const candidates: number[] = [];
  while (head < tail) {
    const node = queue[head++] as number;
    const nodeDistance = distance[node] as number;
    if (nodeDistance >= 2) continue;
    const end = neighbourStart[node + 1] as number;
    for (let index = neighbourStart[node] as number; index < end; index++) {
      const neighbour = neighbourNode[index] as number;
      if (statuses[neighbour] !== SUSCEPTIBLE || distance[neighbour] !== -1) continue;
      distance[neighbour] = nodeDistance + 1;
      queue[tail++] = neighbour;
      candidates.push(neighbour);
    }
  }
  return candidates.sort((left, right) => left - right);
}

interface BeamState {
  readonly statuses: Uint8Array;
  readonly turn: number;
  readonly quarantines: readonly number[];
  readonly rank: readonly [number, number, number];
}

function searchQuarantines(
  simulator: Simulator,
  openingStatuses: Uint8Array,
  beamWidth: number,
  savedToBeat: number,
): { saved: number; quarantines: number[] } | undefined {
  const { nodeCount } = simulator;
  const componentScratch = new Int32Array(nodeCount);
  const stack = new Int32Array(nodeCount);
  const spreadScratch = new Int32Array(nodeCount);
  let bestSaved = savedToBeat;
  let bestQuarantines: number[] | undefined;
  const opening = analyseThreat(simulator, openingStatuses, componentScratch, stack);
  if (opening.isContained) {
    const saved = nodeCount - opening.infected;
    return saved > bestSaved ? { saved, quarantines: [] } : undefined;
  }
  let beam: BeamState[] = [
    { statuses: openingStatuses, turn: 0, quarantines: [], rank: [0, 0, 0] },
  ];
  while (beam.length > 0) {
    const children: BeamState[] = [];
    const seen = new Set<string>();
    for (const parent of beam) {
      for (const node of quarantineCandidates(
        simulator,
        parent.statuses,
        componentScratch,
        stack,
      )) {
        const statuses = parent.statuses.slice();
        statuses[node] = QUARANTINED;
        spreadOneTurn(simulator, statuses, parent.turn, spreadScratch);
        const threat = analyseThreat(simulator, statuses, componentScratch, stack);
        const quarantines = [...parent.quarantines, node];
        if (threat.isContained) {
          const saved = nodeCount - threat.infected;
          if (saved > bestSaved) {
            bestSaved = saved;
            bestQuarantines = quarantines;
          }
          continue;
        }
        // Even saving every exposed person could not beat the best finished game.
        if (nodeCount - threat.infected - 1 <= bestSaved) continue;
        const key = String.fromCharCode(...statuses);
        if (seen.has(key)) continue;
        seen.add(key);
        children.push({
          statuses,
          turn: parent.turn + 1,
          quarantines,
          rank: [threat.safeSusceptible, threat.exposedSusceptible, -threat.frontier],
        });
      }
    }
    children.sort(
      (left, right) =>
        right.rank[0] - left.rank[0] ||
        right.rank[1] - left.rank[1] ||
        right.rank[2] - left.rank[2],
    );
    beam = children.slice(0, beamWidth);
  }
  return bestQuarantines === undefined
    ? undefined
    : { saved: bestSaved, quarantines: bestQuarantines };
}

/**
 * Vaccine sets drawn from the most central non-refusers, most even fragmentation first. The pool
 * shrinks until the number of combinations fits the budget, so any vaccine count stays cheap.
 */
function rankVaccineSets(puzzle: Puzzle, budget: SolverBudget): number[][] {
  const { graph, isRefuser } = puzzle;
  const { vaccineCount } = puzzle.config;
  if (vaccineCount === 0) return [[]];
  const centrality = betweennessCentrality(graph);
  const eligible = Array.from({ length: graph.nodeCount }, (_, node) => node)
    .filter((node) => isRefuser[node] !== true)
    .sort(
      (left, right) =>
        (centrality[right] as number) - (centrality[left] as number) ||
        (graph.adjacency[right]?.length ?? 0) - (graph.adjacency[left]?.length ?? 0) ||
        left - right,
    );
  let poolSize = Math.min(eligible.length, Math.max(budget.vaccinePoolSize, vaccineCount));
  while (
    poolSize > vaccineCount &&
    binomial(poolSize, vaccineCount) > budget.maximumVaccineSetsRanked
  )
    poolSize--;
  const pool = eligible.slice(0, poolSize);
  const ranked: { set: number[]; fragmentation: number }[] = [];
  const removed = new Uint8Array(graph.nodeCount);
  const stack = new Int32Array(graph.nodeCount);
  const visited = new Uint8Array(graph.nodeCount);
  forEachCombination(pool.length, vaccineCount, (indices) => {
    const set = indices.map((index) => pool[index] as number);
    removed.fill(0);
    for (const node of set) removed[node] = 1;
    ranked.push({ set, fragmentation: sumOfSquaredComponentSizes(graph, removed, visited, stack) });
  });
  ranked.sort((left, right) => left.fragmentation - right.fragmentation);
  return ranked.map(({ set }) => set.slice().sort((left, right) => left - right));
}

function sumOfSquaredComponentSizes(
  graph: Graph,
  removed: Uint8Array,
  visited: Uint8Array,
  stack: Int32Array,
): number {
  visited.set(removed);
  let total = 0;
  for (let start = 0; start < graph.nodeCount; start++) {
    if (visited[start] === 1) continue;
    let size = 0;
    let stackSize = 0;
    stack[stackSize++] = start;
    visited[start] = 1;
    while (stackSize > 0) {
      const node = stack[--stackSize] as number;
      size++;
      for (const { neighbour } of graph.adjacency[node] ?? []) {
        if (visited[neighbour] === 1) continue;
        visited[neighbour] = 1;
        stack[stackSize++] = neighbour;
      }
    }
    total += size * size;
  }
  return total;
}

/** Brandes' algorithm for unweighted graphs. */
function betweennessCentrality(graph: Graph): Float64Array {
  const nodeCount = graph.nodeCount;
  const centrality = new Float64Array(nodeCount);
  const pathCounts = new Float64Array(nodeCount);
  const distances = new Int32Array(nodeCount);
  const dependencies = new Float64Array(nodeCount);
  const order = new Int32Array(nodeCount);
  for (let source = 0; source < nodeCount; source++) {
    pathCounts.fill(0);
    distances.fill(-1);
    dependencies.fill(0);
    pathCounts[source] = 1;
    distances[source] = 0;
    let head = 0;
    let tail = 0;
    order[tail++] = source;
    while (head < tail) {
      const node = order[head++] as number;
      for (const { neighbour } of graph.adjacency[node] ?? []) {
        if (distances[neighbour] === -1) {
          distances[neighbour] = (distances[node] as number) + 1;
          order[tail++] = neighbour;
        }
        if (distances[neighbour] === (distances[node] as number) + 1) {
          pathCounts[neighbour] = (pathCounts[neighbour] as number) + (pathCounts[node] as number);
        }
      }
    }
    for (let index = tail - 1; index > 0; index--) {
      const node = order[index] as number;
      for (const { neighbour } of graph.adjacency[node] ?? []) {
        if (distances[neighbour] === (distances[node] as number) - 1) {
          dependencies[neighbour] =
            (dependencies[neighbour] as number) +
            ((pathCounts[neighbour] as number) / (pathCounts[node] as number)) *
              (1 + (dependencies[node] as number));
        }
      }
      centrality[node] = (centrality[node] as number) + (dependencies[node] as number);
    }
  }
  return centrality;
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let index = 1; index <= k; index++) result = (result * (n - k + index)) / index;
  return Math.round(result);
}

function forEachCombination(n: number, k: number, visit: (indices: number[]) => void): void {
  const indices = Array.from({ length: k }, (_, index) => index);
  for (;;) {
    visit(indices);
    let position = k - 1;
    while (position >= 0 && indices[position] === n - k + position) position--;
    if (position < 0) return;
    indices[position] = (indices[position] as number) + 1;
    for (let next = position + 1; next < k; next++)
      indices[next] = (indices[next - 1] as number) + 1;
  }
}
