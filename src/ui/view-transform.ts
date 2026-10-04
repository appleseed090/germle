import type { LayoutBounds, Point } from '../engine';

/** Maps the layout's logical space onto the board's CSS-pixel box. */
export interface ViewTransform {
  readonly scale: number;
  /** Swap x and y, so the portrait layout fills a landscape board. Purely visual. */
  readonly transposed: boolean;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** A box in CSS pixels. */
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The largest uniform scale that fits the layout inside the viewport minus `margin` on every
 * side, centred. Landscape viewports get the layout transposed. Never returns a scale of zero or
 * less, so a collapsed board still has an invertible transform.
 */
export function fitLayoutToViewport(
  bounds: LayoutBounds,
  viewport: ViewportSize,
  margin: number,
): ViewTransform {
  const availableWidth = Math.max(viewport.width - 2 * margin, 1);
  const availableHeight = Math.max(viewport.height - 2 * margin, 1);
  const transposed = availableWidth > availableHeight;
  const layoutWidth = transposed ? bounds.height : bounds.width;
  const layoutHeight = transposed ? bounds.width : bounds.height;
  const scale = Math.min(availableWidth / layoutWidth, availableHeight / layoutHeight);
  return {
    scale,
    transposed,
    offsetX: (viewport.width - layoutWidth * scale) / 2,
    offsetY: (viewport.height - layoutHeight * scale) / 2,
  };
}

/** Logical layout point → CSS-pixel point inside the board. */
export function layoutToScreen(transform: ViewTransform, point: Point): Point {
  const along = transform.transposed ? point.y : point.x;
  const across = transform.transposed ? point.x : point.y;
  return {
    x: transform.offsetX + along * transform.scale,
    y: transform.offsetY + across * transform.scale,
  };
}

/** CSS-pixel point inside the board → logical layout point. Inverse of {@link layoutToScreen}. */
export function screenToLayout(transform: ViewTransform, point: Point): Point {
  const along = (point.x - transform.offsetX) / transform.scale;
  const across = (point.y - transform.offsetY) / transform.scale;
  return transform.transposed ? { x: across, y: along } : { x: along, y: across };
}
