import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG } from './config';
import {
  createGraph,
  findConnectedComponents,
  generateSmallWorldGraph,
  isGraphConnected,
  nodeDegrees,
} from './graph';
import { createStreamRandom } from './random';

describe('createGraph', () => {
  it('drops self-loops and repeated pairs, keeping first-appearance order', () => {
    const graph = createGraph(4, [
      [2, 1],
      [1, 1],
      [0, 3],
      [1, 2],
      [3, 0],
      [2, 3],
    ]);
    expect(graph.edges).toEqual([
      { lowerNode: 1, higherNode: 2 },
      { lowerNode: 0, higherNode: 3 },
      { lowerNode: 2, higherNode: 3 },
    ]);
    expect(graph.adjacency[2]).toEqual([
      { neighbour: 1, edgeIndex: 0 },
      { neighbour: 3, edgeIndex: 2 },
    ]);
  });
});

describe('findConnectedComponents', () => {
  it('only walks through present nodes', () => {
    const path = createGraph(5, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(findConnectedComponents(path, () => true)).toEqual([[0, 1, 2, 3, 4]]);
    expect(findConnectedComponents(path, (node) => node !== 2)).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });
});

describe('generateSmallWorldGraph with the daily config', () => {
  const graphs = Array.from({ length: 2000 }, (_, index) =>
    generateSmallWorldGraph(DAILY_PUZZLE_CONFIG, createStreamRandom(String(index + 1), 'graph')),
  );

  it('always has 40 nodes and one connected component', () => {
    for (const graph of graphs) {
      expect(graph.nodeCount).toBe(40);
      expect(graph.adjacency).toHaveLength(40);
      expect(isGraphConnected(graph)).toBe(true);
    }
  });

  it('is a simple graph with at most the 80 ring edges', () => {
    for (const graph of graphs) {
      expect(graph.edges.length).toBeLessThanOrEqual(80);
      const pairKeys = new Set(
        graph.edges.map(({ lowerNode, higherNode }) => `${lowerNode}-${higherNode}`),
      );
      expect(pairKeys.size).toBe(graph.edges.length);
      for (const { lowerNode, higherNode } of graph.edges)
        expect(lowerNode).toBeLessThan(higherNode);
    }
  });

  it('has degree statistics close to the ring lattice of degree 4', () => {
    let totalDegree = 0;
    let rewiredEdgeCount = 0;
    for (const graph of graphs) {
      const degrees = nodeDegrees(graph);
      const meanDegree = degrees.reduce((sum, degree) => sum + degree, 0) / degrees.length;
      expect(meanDegree).toBeGreaterThanOrEqual(3.7);
      expect(meanDegree).toBeLessThanOrEqual(4);
      expect(Math.min(...degrees)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...degrees)).toBeLessThanOrEqual(10);
      totalDegree += meanDegree;
      rewiredEdgeCount += graph.edges.filter(({ lowerNode, higherNode }) => {
        const ringDistance = Math.min(higherNode - lowerNode, 40 - (higherNode - lowerNode));
        return ringDistance > 2;
      }).length;
    }
    expect(totalDegree / graphs.length).toBeGreaterThan(3.9);
    const rewiredShare = rewiredEdgeCount / (graphs.length * 80);
    expect(rewiredShare).toBeGreaterThan(0.07);
    expect(rewiredShare).toBeLessThan(0.11);
  });
});
