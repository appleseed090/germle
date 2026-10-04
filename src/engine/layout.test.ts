import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG } from './config';
import { computeForceLayout, layoutBoundsFor } from './layout';
import { createPuzzle } from './puzzle';
import { createStreamRandom } from './random';

describe('computeForceLayout', () => {
  const bounds = layoutBoundsFor(40);

  it('is deterministic for a seed', () => {
    const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, '3');
    const first = computeForceLayout(puzzle.graph, createStreamRandom('3', 'layout'), bounds);
    const second = computeForceLayout(puzzle.graph, createStreamRandom('3', 'layout'), bounds);
    expect(second).toEqual(first);
  });

  it('keeps every node inside the bounds and nodes apart', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, String(seed));
      const points = computeForceLayout(
        puzzle.graph,
        createStreamRandom(String(seed), 'layout'),
        bounds,
      );
      expect(points).toHaveLength(40);
      let closestDistance = Infinity;
      points.forEach((point, index) => {
        expect(point.x).toBeGreaterThanOrEqual(24);
        expect(point.x).toBeLessThanOrEqual(bounds.width - 24);
        expect(point.y).toBeGreaterThanOrEqual(24);
        expect(point.y).toBeLessThanOrEqual(bounds.height - 24);
        for (const other of points.slice(index + 1)) {
          closestDistance = Math.min(
            closestDistance,
            Math.hypot(point.x - other.x, point.y - other.y),
          );
        }
      });
      expect(closestDistance).toBeGreaterThan(32);
    }
  });

  it('gives bigger networks a proportionally bigger space', () => {
    expect(layoutBoundsFor(40)).toEqual({ width: 360, height: 480 });
    expect(layoutBoundsFor(20)).toEqual({ width: 360, height: 480 });
    expect(layoutBoundsFor(160).width).toBeCloseTo(720);
  });
});
