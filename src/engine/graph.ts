import type { PuzzleConfig } from './config';
import { randomIntegerBelow, type RandomSource } from './random';

/** An undirected edge, stored with `lowerNode < higherNode`. */
export interface GraphEdge {
  readonly lowerNode: number;
  readonly higherNode: number;
}

/** One entry of a node's adjacency list: the neighbour and the index of the shared edge. */
export interface Incidence {
  readonly neighbour: number;
  readonly edgeIndex: number;
}

/**
 * An immutable undirected simple graph on nodes `0 .. nodeCount - 1`. Edge indices are stable
 * identifiers: transmission rolls are keyed by them, so they never shift when people are removed
 * during play.
 */
export interface Graph {
  readonly nodeCount: number;
  readonly edges: readonly GraphEdge[];
  /** `adjacency[node]` lists the node's incidences in ascending edge-index order. */
  readonly adjacency: readonly (readonly Incidence[])[];
}

/**
 * Builds a graph from node pairs, dropping self-loops and repeated pairs. Surviving edges keep
 * the order of their first appearance, which fixes their edge indices.
 */
export function createGraph(
  nodeCount: number,
  nodePairs: readonly (readonly [number, number])[],
): Graph {
  const edges: GraphEdge[] = [];
  const seenPairKeys = new Set<number>();
  const adjacency: Incidence[][] = Array.from({ length: nodeCount }, () => []);
  for (const [firstNode, secondNode] of nodePairs) {
    if (firstNode === secondNode) continue;
    const lowerNode = Math.min(firstNode, secondNode);
    const higherNode = Math.max(firstNode, secondNode);
    const pairKey = lowerNode * nodeCount + higherNode;
    if (seenPairKeys.has(pairKey)) continue;
    seenPairKeys.add(pairKey);
    const edgeIndex = edges.length;
    edges.push({ lowerNode, higherNode });
    (adjacency[lowerNode] as Incidence[]).push({ neighbour: higherNode, edgeIndex });
    (adjacency[higherNode] as Incidence[]).push({ neighbour: lowerNode, edgeIndex });
  }
  return { nodeCount, edges, adjacency };
}

/** Number of edges incident to each node. */
export function nodeDegrees(graph: Graph): number[] {
  return graph.adjacency.map((incidences) => incidences.length);
}

/**
 * Connected components of the subgraph induced by the nodes for which `isNodePresent` is true.
 *
 * @returns Components in order of their lowest node; each lists its nodes in ascending order.
 */
export function findConnectedComponents(
  graph: Graph,
  isNodePresent: (node: number) => boolean,
): number[][] {
  const visited = new Uint8Array(graph.nodeCount);
  const components: number[][] = [];
  for (let startNode = 0; startNode < graph.nodeCount; startNode++) {
    if (visited[startNode] === 1 || !isNodePresent(startNode)) continue;
    const component: number[] = [];
    const stack = [startNode];
    visited[startNode] = 1;
    while (stack.length > 0) {
      const node = stack.pop() as number;
      component.push(node);
      for (const { neighbour } of graph.adjacency[node] as readonly Incidence[]) {
        if (visited[neighbour] === 1 || !isNodePresent(neighbour)) continue;
        visited[neighbour] = 1;
        stack.push(neighbour);
      }
    }
    component.sort((left, right) => left - right);
    components.push(component);
  }
  return components;
}

/** True when every node is reachable from every other node. */
export function isGraphConnected(graph: Graph): boolean {
  return findConnectedComponents(graph, () => true).length === 1;
}

const MAXIMUM_GRAPH_ATTEMPTS = 10_000;

/**
 * Watts–Strogatz small-world graph. Start from a ring where each node links to the
 * `ringNeighbourCount / 2` nearest nodes on each side; then, edge by edge in ring order, with
 * probability `rewireProbability` move the edge's far end to a uniformly random node other than
 * its near end. Repeated pairs are dropped (self-loops cannot arise). If the result is not
 * connected, the whole construction is repeated with the next values of the same stream.
 *
 * @param random - The puzzle's `graph` stream.
 * @throws Error if no connected graph appears within a large attempt budget, which only happens
 *   for configs far outside the validated range.
 */
export function generateSmallWorldGraph(config: PuzzleConfig, random: RandomSource): Graph {
  for (let attempt = 0; attempt < MAXIMUM_GRAPH_ATTEMPTS; attempt++) {
    const graph = createGraph(config.nodeCount, rewiredRingPairs(config, random));
    if (isGraphConnected(graph)) return graph;
  }
  throw new Error(`No connected graph after ${MAXIMUM_GRAPH_ATTEMPTS} attempts`);
}

function rewiredRingPairs(config: PuzzleConfig, random: RandomSource): [number, number][] {
  const { nodeCount, ringNeighbourCount, rewireProbability } = config;
  const pairs: [number, number][] = [];
  for (let nearNode = 0; nearNode < nodeCount; nearNode++) {
    for (let distance = 1; distance <= ringNeighbourCount / 2; distance++) {
      let farNode = (nearNode + distance) % nodeCount;
      if (random() < rewireProbability) {
        const offset = randomIntegerBelow(random, nodeCount - 1);
        farNode = offset >= nearNode ? offset + 1 : offset;
      }
      pairs.push([nearNode, farNode]);
    }
  }
  return pairs;
}
