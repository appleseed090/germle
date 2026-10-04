import type { Graph } from './graph';
import type { RandomSource } from './random';

/** A position in the layout's logical coordinate space (roughly CSS pixels on a phone). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The logical rectangle a layout fills; the renderer scales it to the viewport. */
export interface LayoutBounds {
  readonly width: number;
  readonly height: number;
}

const REFERENCE_NODE_COUNT = 40;
const REFERENCE_WIDTH = 360;
const REFERENCE_HEIGHT = 480;
const EDGE_PADDING = 24;
const MINIMUM_NODE_SEPARATION = 40;
const FORCE_ITERATIONS = 500;
const GRAVITY = 0.02;
const COLLISION_PASSES = 60;

/**
 * Portrait 3:4 bounds sized so that node density matches the 40-node daily puzzle; larger
 * practice networks get a proportionally larger space and are scaled down on screen.
 */
export function layoutBoundsFor(nodeCount: number): LayoutBounds {
  const scale = Math.sqrt(Math.max(nodeCount, REFERENCE_NODE_COUNT) / REFERENCE_NODE_COUNT);
  return { width: REFERENCE_WIDTH * scale, height: REFERENCE_HEIGHT * scale };
}

/**
 * Deterministic Fruchterman–Reingold layout. Starting positions come from `random`; then a fixed
 * number of cooling iterations of repulsion between all pairs, attraction along edges and a weak
 * pull to the centre. The result is stretched to fill the bounds and nodes closer than a minimum
 * separation are pushed apart. Only `+ - * /` and `Math.sqrt` are used, all exactly specified by
 * IEEE 754, so every browser computes the same positions.
 *
 * @param random - The puzzle's `layout` stream.
 * @returns One point per node, inside the bounds with a margin for node radii.
 */
export function computeForceLayout(
  graph: Graph,
  random: RandomSource,
  bounds: LayoutBounds,
): Point[] {
  const nodeCount = graph.nodeCount;
  const xs = new Float64Array(nodeCount);
  const ys = new Float64Array(nodeCount);
  for (let node = 0; node < nodeCount; node++) {
    xs[node] = random() * bounds.width;
    ys[node] = random() * bounds.height;
  }
  runForceIterations(graph, xs, ys, bounds);
  stretchToFill(xs, ys, bounds);
  separateCloseNodes(xs, ys, bounds);
  return Array.from(xs, (x, node) => ({ x, y: ys[node] as number }));
}

function runForceIterations(
  graph: Graph,
  xs: Float64Array,
  ys: Float64Array,
  bounds: LayoutBounds,
): void {
  const nodeCount = graph.nodeCount;
  const idealEdgeLength = Math.sqrt((bounds.width * bounds.height) / nodeCount);
  const idealEdgeLengthSquared = idealEdgeLength * idealEdgeLength;
  const centreX = bounds.width / 2;
  const centreY = bounds.height / 2;
  const initialTemperature = bounds.width / 10;
  const displacementXs = new Float64Array(nodeCount);
  const displacementYs = new Float64Array(nodeCount);

  for (let iteration = 0; iteration < FORCE_ITERATIONS; iteration++) {
    const temperature = initialTemperature * (1 - iteration / FORCE_ITERATIONS);
    displacementXs.fill(0);
    displacementYs.fill(0);
    for (let first = 0; first < nodeCount; first++) {
      for (let second = first + 1; second < nodeCount; second++) {
        const deltaX = (xs[first] as number) - (xs[second] as number);
        const deltaY = (ys[first] as number) - (ys[second] as number);
        const distanceSquared = Math.max(deltaX * deltaX + deltaY * deltaY, 0.0001);
        const repulsion = idealEdgeLengthSquared / distanceSquared;
        displacementXs[first] = (displacementXs[first] as number) + deltaX * repulsion;
        displacementYs[first] = (displacementYs[first] as number) + deltaY * repulsion;
        displacementXs[second] = (displacementXs[second] as number) - deltaX * repulsion;
        displacementYs[second] = (displacementYs[second] as number) - deltaY * repulsion;
      }
    }
    for (const { lowerNode, higherNode } of graph.edges) {
      const deltaX = (xs[lowerNode] as number) - (xs[higherNode] as number);
      const deltaY = (ys[lowerNode] as number) - (ys[higherNode] as number);
      const attraction = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / idealEdgeLength;
      displacementXs[lowerNode] = (displacementXs[lowerNode] as number) - deltaX * attraction;
      displacementYs[lowerNode] = (displacementYs[lowerNode] as number) - deltaY * attraction;
      displacementXs[higherNode] = (displacementXs[higherNode] as number) + deltaX * attraction;
      displacementYs[higherNode] = (displacementYs[higherNode] as number) + deltaY * attraction;
    }
    for (let node = 0; node < nodeCount; node++) {
      const displacementX =
        (displacementXs[node] as number) + (centreX - (xs[node] as number)) * GRAVITY;
      const displacementY =
        (displacementYs[node] as number) + (centreY - (ys[node] as number)) * GRAVITY;
      const length = Math.sqrt(displacementX * displacementX + displacementY * displacementY);
      if (length === 0) continue;
      const step = Math.min(length, temperature) / length;
      xs[node] = (xs[node] as number) + displacementX * step;
      ys[node] = (ys[node] as number) + displacementY * step;
    }
  }
}

function stretchToFill(xs: Float64Array, ys: Float64Array, bounds: LayoutBounds): void {
  stretchAxis(xs, EDGE_PADDING, bounds.width - EDGE_PADDING);
  stretchAxis(ys, EDGE_PADDING, bounds.height - EDGE_PADDING);
}

function stretchAxis(values: Float64Array, low: number, high: number): void {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const span = maximum - minimum;
  for (let index = 0; index < values.length; index++) {
    values[index] =
      span === 0
        ? (low + high) / 2
        : low + (((values[index] as number) - minimum) / span) * (high - low);
  }
}

function separateCloseNodes(xs: Float64Array, ys: Float64Array, bounds: LayoutBounds): void {
  const nodeCount = xs.length;
  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    let moved = false;
    for (let first = 0; first < nodeCount; first++) {
      for (let second = first + 1; second < nodeCount; second++) {
        const deltaX = (xs[second] as number) - (xs[first] as number);
        const deltaY = (ys[second] as number) - (ys[first] as number);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance >= MINIMUM_NODE_SEPARATION) continue;
        moved = true;
        const unitX = distance === 0 ? 1 : deltaX / distance;
        const unitY = distance === 0 ? 0 : deltaY / distance;
        const push = (MINIMUM_NODE_SEPARATION - distance) / 2;
        xs[first] = clamp(
          (xs[first] as number) - unitX * push,
          EDGE_PADDING,
          bounds.width - EDGE_PADDING,
        );
        ys[first] = clamp(
          (ys[first] as number) - unitY * push,
          EDGE_PADDING,
          bounds.height - EDGE_PADDING,
        );
        xs[second] = clamp(
          (xs[second] as number) + unitX * push,
          EDGE_PADDING,
          bounds.width - EDGE_PADDING,
        );
        ys[second] = clamp(
          (ys[second] as number) + unitY * push,
          EDGE_PADDING,
          bounds.height - EDGE_PADDING,
        );
      }
    }
    if (!moved) return;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
