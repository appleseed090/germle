import { describe, expect, it } from 'vitest';
import { fitLayoutToViewport, layoutToScreen, screenToLayout } from './view-transform';

const bounds = { width: 360, height: 480 };

describe('fitLayoutToViewport', () => {
  it('fits a portrait layout into a phone board without transposing', () => {
    const transform = fitLayoutToViewport(bounds, { width: 375, height: 520 }, 0);
    expect(transform.transposed).toBe(false);
    expect(transform.scale).toBeCloseTo(375 / 360);
    expect(layoutToScreen(transform, { x: 0, y: 0 }).x).toBeCloseTo(0);
    expect(layoutToScreen(transform, { x: 360, y: 480 }).y).toBeCloseTo(260 + 250);
  });

  it('transposes on a landscape board and centres the result', () => {
    const transform = fitLayoutToViewport(bounds, { width: 1280, height: 600 }, 10);
    expect(transform.transposed).toBe(true);
    expect(transform.scale).toBeCloseTo(580 / 360);
    const centre = layoutToScreen(transform, { x: 180, y: 240 });
    expect(centre.x).toBeCloseTo(640);
    expect(centre.y).toBeCloseTo(300);
  });

  it('round-trips points in both orientations', () => {
    for (const viewport of [
      { width: 375, height: 520 },
      { width: 1280, height: 600 },
    ]) {
      const transform = fitLayoutToViewport(bounds, viewport, 8);
      const point = { x: 123.5, y: 321.25 };
      const roundTripped = screenToLayout(transform, layoutToScreen(transform, point));
      expect(roundTripped.x).toBeCloseTo(point.x);
      expect(roundTripped.y).toBeCloseTo(point.y);
    }
  });

  it('stays invertible for a collapsed board', () => {
    expect(fitLayoutToViewport(bounds, { width: 0, height: 0 }, 8).scale).toBeGreaterThan(0);
  });
});
