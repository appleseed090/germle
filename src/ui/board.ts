import {
  contactsStillInNetwork,
  isTappable,
  type GameEvent,
  type GamePhase,
  type GameState,
  type GameStep,
  type LayoutBounds,
  type NodeStatus,
  type Point,
  type Puzzle,
} from '../engine';
import { playPhases, type AnimationPhase, type RunningAnimation } from './animation';
import {
  fitLayoutToViewport,
  layoutToScreen,
  screenToLayout,
  type ViewTransform,
} from './view-transform';

/** What the board needs to draw and play one puzzle. */
export interface BoardOptions {
  /** Element the board fills; its CSS size decides the board's size. */
  readonly container: HTMLElement;
  readonly puzzle: Puzzle;
  readonly layout: readonly Point[];
  readonly layoutBounds: LayoutBounds;
  readonly reduceMotion: boolean;
  /** Called when the player taps, clicks or presses Enter/Space on a person (legal or not). */
  readonly onNodeActivate: (node: number) => void;
}

/** The interactive SVG network. Game rules stay in the engine; this only draws and animates. */
export interface Board {
  /** Draws a state immediately, cancelling any running animation. */
  render(state: GameState): void;
  /** Animates the events of one move, ending exactly at `step.state`. Resolves when done or skipped. */
  animateStep(step: GameStep): Promise<void>;
  /** Pulses a ring around the index patients for a moment. */
  highlightIndexPatients(nodes: readonly number[]): void;
  setReduceMotion(enabled: boolean): void;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const BOARD_MARGIN = 8;
const MINIMUM_HIT_RADIUS = 22;
const DRAG_THRESHOLD = 8;
const BASE_NODE_RADIUS = 14;
/** Font size of the contact count, in disc radii. */
const COUNT_FONT_SCALE = 1.05;
const REMOVAL_DURATION = 260;
const OUTBREAK_DURATION = 320;
const TRAVEL_DURATION = 420;
const INFECTION_POP_DURATION = 120;
const INDEX_HIGHLIGHT_DURATION = 2600;

interface NodeElements {
  readonly group: SVGGElement;
  readonly body: SVGGElement;
  readonly disc: SVGCircleElement;
  readonly count: SVGTextElement;
  /** Infected people's centre dot and refusers' cross, shown instead of counts when those are off. */
  readonly core: SVGCircleElement;
  readonly cross: SVGPathElement | undefined;
  readonly halo: SVGCircleElement;
  readonly ring: SVGCircleElement;
  readonly focus: SVGCircleElement;
}

interface DragGesture {
  readonly pointerId: number;
  readonly node: number;
  readonly startX: number;
  readonly startY: number;
  isDragging: boolean;
}

/** Creates the board inside `options.container` and draws the opening state. */
export function createBoard(options: BoardOptions, initialState: GameState): Board {
  const { container, puzzle, layoutBounds, onNodeActivate } = options;
  const { graph } = puzzle;
  const positions: Point[] = options.layout.slice();
  let reduceMotion = options.reduceMotion;
  let state = initialState;
  let transform: ViewTransform = { scale: 1, transposed: false, offsetX: 0, offsetY: 0 };
  let runningAnimation: RunningAnimation | undefined;
  let dragGesture: DragGesture | undefined;
  let hoveredNode: number | undefined;
  let highlightTimer: number | undefined;

  const svg = createSvgElement('svg', {
    class: 'board-svg',
    role: 'group',
    'aria-label': 'Social network',
  });
  const edgeLayer = createSvgElement('g', { class: 'edges' });
  const pathogenLayer = createSvgElement('g', { class: 'pathogens' });
  const nodeLayer = createSvgElement('g', { class: 'nodes' });
  svg.append(edgeLayer, pathogenLayer, nodeLayer);

  const edgeElements = graph.edges.map(() => {
    const line = createSvgElement('line', { class: 'edge' });
    edgeLayer.append(line);
    return line;
  });
  const nodeElements = positions.map((_, node) => createNodeElements(node));
  container.append(svg);

  function createNodeElements(node: number): NodeElements {
    const group = createSvgElement('g', {
      class: 'node',
      'data-node-id': String(node),
      role: 'button',
    });
    const halo = createSvgElement('circle', { class: 'node-halo' });
    const body = createSvgElement('g', { class: 'node-body' });
    const disc = createSvgElement('circle', { class: 'node-disc' });
    const count = createSvgElement('text', {
      class: 'node-count',
      'text-anchor': 'middle',
      dy: '0.35em',
      'aria-hidden': 'true',
    });
    const core = createSvgElement('circle', { class: 'node-core' });
    body.append(disc, count, core);
    let cross: SVGPathElement | undefined;
    if (puzzle.isRefuser[node] === true) {
      cross = createSvgElement('path', { class: 'node-cross' });
      body.append(cross);
    }
    const ring = createSvgElement('circle', { class: 'node-ring' });
    const focus = createSvgElement('circle', { class: 'node-focus' });
    group.append(halo, body, ring, focus);
    group.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (runningAnimation !== undefined) runningAnimation.skip();
      else onNodeActivate(node);
    });
    nodeLayer.append(group);
    return { group, body, disc, count, core, cross, halo, ring, focus };
  }

  function elementsOf(node: number): NodeElements {
    return nodeElements[node] as NodeElements;
  }

  function screenRadius(): number {
    return BASE_NODE_RADIUS * Math.min(Math.max(transform.scale, 0.75), 1.5);
  }

  function screenPosition(node: number): Point {
    return layoutToScreen(transform, positions[node] as Point);
  }

  function layoutGeometry(): void {
    transform = fitLayoutToViewport(
      layoutBounds,
      { width: container.clientWidth, height: container.clientHeight },
      BOARD_MARGIN,
    );
    svg.setAttribute('viewBox', `0 0 ${container.clientWidth} ${container.clientHeight}`);
    positions.forEach((_, node) => {
      sizeNode(node);
      positionNode(node);
    });
  }

  function sizeNode(node: number): void {
    const radius = screenRadius();
    const elements = elementsOf(node);
    elements.disc.setAttribute('r', String(radius));
    elements.count.setAttribute('font-size', String(radius * COUNT_FONT_SCALE));
    elements.core.setAttribute('r', String(radius * 0.32));
    const arm = radius * 0.42;
    elements.cross?.setAttribute(
      'd',
      `M${-arm} ${-arm}L${arm} ${arm}M${arm} ${-arm}L${-arm} ${arm}`,
    );
    elements.halo.setAttribute('r', String(radius + 7));
    elements.focus.setAttribute('r', String(radius + 4));
    elements.ring.setAttribute('r', String(radius + 8));
  }

  function positionNode(node: number): void {
    const { x, y } = screenPosition(node);
    elementsOf(node).group.setAttribute('transform', `translate(${x} ${y})`);
    for (const { edgeIndex } of graph.adjacency[node] ?? []) positionEdge(edgeIndex);
  }

  function positionEdge(edgeIndex: number): void {
    const edge = graph.edges[edgeIndex];
    const line = edgeElements[edgeIndex];
    if (edge === undefined || line === undefined) return;
    const from = screenPosition(edge.lowerNode);
    const to = screenPosition(edge.higherNode);
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
  }

  function applyStatuses(statuses: readonly NodeStatus[], displayedState: GameState): void {
    // Read focus before touching attributes: Chrome blurs a hidden element as soon as its
    // tabindex changes, so afterwards the focused person would already be lost.
    const focusedNode = nodeElements.findIndex(({ group }) => group === document.activeElement);
    const contacts = contactsStillInNetwork(graph, statuses);
    // Refusing only rules out a vaccine. Once the outbreak starts refusers are healthy people like
    // any other, and their cross would wrongly read as "can't tap", so they look healthy too.
    const refusalMatters = displayedState.phase === 'vaccinate';
    statuses.forEach((status, node) => {
      const { group, body, count } = elementsOf(node);
      const contactCount = contacts[node] as number;
      const isRemoved = status === 'vaccinated' || status === 'quarantined';
      const tappable = isTappable(puzzle, displayedState, node);
      group.dataset['status'] = status;
      group.dataset['tappable'] = String(tappable);
      group.classList.toggle('node--removed', isRemoved);
      group.classList.toggle('node--infected', status === 'infected');
      group.classList.toggle('node--refuser', refusalMatters && puzzle.isRefuser[node] === true);
      group.classList.toggle('node--tappable', tappable);
      count.textContent = String(contactCount);
      group.setAttribute('aria-label', describeNode(node, status, contactCount, refusalMatters));
      group.setAttribute('aria-disabled', String(!tappable));
      group.setAttribute('tabindex', isRemoved ? '-1' : '0');
      body.removeAttribute('transform');
    });
    if (focusedNode !== -1) keepFocusOnAPresentNode(focusedNode, statuses);
    graph.edges.forEach(({ lowerNode, higherNode }, edgeIndex) => {
      const line = edgeElements[edgeIndex] as SVGLineElement;
      const isRemoved =
        isRemovedStatus(statuses[lowerNode]) || isRemovedStatus(statuses[higherNode]);
      line.classList.toggle('edge--removed', isRemoved);
      line.style.removeProperty('opacity');
    });
    updateHover(hoveredNode);
  }

  /** A keyboard player whose focused person just left the network moves on to the next person. */
  function keepFocusOnAPresentNode(focusedNode: number, statuses: readonly NodeStatus[]): void {
    if (!isRemovedStatus(statuses[focusedNode])) return;
    for (let offset = 1; offset < statuses.length; offset++) {
      const candidate = (focusedNode + offset) % statuses.length;
      if (!isRemovedStatus(statuses[candidate])) {
        elementsOf(candidate).group.focus();
        return;
      }
    }
  }

  function describeNode(
    node: number,
    status: NodeStatus,
    contactCount: number,
    refusalMatters: boolean,
  ): string {
    const contacts = contactCount === 1 ? '1 contact' : `${contactCount} contacts`;
    const refusal = refusalMatters && puzzle.isRefuser[node] === true ? ', refuses vaccines' : '';
    const statusText = status === 'susceptible' ? 'healthy' : status;
    return `Person ${node + 1}: ${statusText}${refusal}, ${contacts}`;
  }

  function render(nextState: GameState): void {
    runningAnimation?.skip();
    state = nextState;
    applyStatuses(state.nodeStatuses, state);
  }

  function removalPhase(node: number, style: 'vaccinated' | 'quarantined'): AnimationPhase {
    const { body, ring } = elementsOf(node);
    const incidentLines = (graph.adjacency[node] ?? []).map(
      ({ edgeIndex }) => edgeElements[edgeIndex] as SVGLineElement,
    );
    if (style === 'quarantined') ring.classList.add('node-ring--active');
    const ringRadius = screenRadius() + 8;
    return {
      durationMilliseconds: REMOVAL_DURATION,
      update: (progress) => {
        const scale = style === 'vaccinated' ? 1 - progress : 1 - progress * progress;
        body.setAttribute('transform', `scale(${Math.max(scale, 0)})`);
        if (style === 'quarantined') ring.setAttribute('r', String(ringRadius * (1 - progress)));
        for (const line of incidentLines) line.style.opacity = String(1 - progress);
      },
      finish: () => {
        ring.classList.remove('node-ring--active');
        ring.setAttribute('r', String(ringRadius));
      },
    };
  }

  function infectionPopPhase(nodes: readonly number[], duration: number): AnimationPhase {
    return {
      durationMilliseconds: duration,
      update: (progress) => {
        const scale = 1 + 0.3 * Math.sin(Math.PI * progress);
        for (const node of nodes)
          elementsOf(node).body.setAttribute('transform', `scale(${scale})`);
      },
    };
  }

  /** What an animation has shown so far: the statuses and phase as of its latest event. */
  interface ShownSoFar {
    readonly statuses: NodeStatus[];
    phase: GamePhase;
  }

  function phasesForEvent(event: GameEvent, shown: ShownSoFar): AnimationPhase[] {
    const { statuses } = shown;
    const showStatuses = (): void => {
      applyStatuses(statuses, { ...state, nodeStatuses: statuses, phase: shown.phase });
    };
    switch (event.kind) {
      case 'vaccinated':
      case 'quarantined': {
        const removal = removalPhase(event.node, event.kind);
        return [
          {
            ...removal,
            finish: () => {
              removal.finish?.();
              statuses[event.node] = event.kind;
              showStatuses();
            },
          },
        ];
      }
      case 'outbreak-started':
        return [
          {
            durationMilliseconds: 0,
            finish: () => {
              for (const node of event.indexPatients) statuses[node] = 'infected';
              shown.phase = 'quarantine';
              showStatuses();
            },
          },
          infectionPopPhase(event.indexPatients, OUTBREAK_DURATION),
        ];
      case 'spread': {
        if (event.transmissions.length === 0) return [];
        const dots = event.transmissions.map(() =>
          createSvgElement('circle', { class: 'pathogen', r: '4.5' }),
        );
        const targets = event.transmissions.map(({ toNode }) => toNode);
        return [
          {
            durationMilliseconds: TRAVEL_DURATION,
            update: (progress) => {
              event.transmissions.forEach(({ fromNode, toNode }, index) => {
                const dot = dots[index] as SVGCircleElement;
                if (dot.parentNode === null) pathogenLayer.append(dot);
                const from = screenPosition(fromNode);
                const to = screenPosition(toNode);
                dot.setAttribute('cx', String(from.x + (to.x - from.x) * progress));
                dot.setAttribute('cy', String(from.y + (to.y - from.y) * progress));
              });
            },
            finish: () => {
              for (const dot of dots) dot.remove();
              for (const node of targets) statuses[node] = 'infected';
              showStatuses();
            },
          },
          infectionPopPhase(targets, INFECTION_POP_DURATION),
        ];
      }
      case 'ended':
        return [];
    }
  }

  function animateStep(step: GameStep): Promise<void> {
    runningAnimation?.skip();
    const shown: ShownSoFar = { statuses: state.nodeStatuses.slice(), phase: state.phase };
    const phases = step.events.flatMap((event) => phasesForEvent(event, shown));
    phases.push({
      durationMilliseconds: 0,
      finish: () => {
        state = step.state;
        applyStatuses(state.nodeStatuses, state);
      },
    });
    const animation = playPhases(phases, reduceMotion);
    runningAnimation = animation;
    container.dataset['animating'] = 'true';
    return animation.finished.then(() => {
      if (runningAnimation === animation) {
        runningAnimation = undefined;
        container.dataset['animating'] = 'false';
      }
    });
  }

  function highlightIndexPatients(nodes: readonly number[]): void {
    window.clearTimeout(highlightTimer);
    for (const elements of nodeElements) elements.group.classList.remove('node--highlighted');
    for (const node of nodes) elementsOf(node).group.classList.add('node--highlighted');
    highlightTimer = window.setTimeout(() => {
      for (const node of nodes) elementsOf(node).group.classList.remove('node--highlighted');
    }, INDEX_HIGHLIGHT_DURATION);
  }

  function pointerToBoard(event: PointerEvent): Point {
    const rectangle = svg.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  }

  function nodeAt(point: Point): number | undefined {
    let nearestNode: number | undefined;
    let nearestDistance = Infinity;
    state.nodeStatuses.forEach((status, node) => {
      if (isRemovedStatus(status)) return;
      const position = screenPosition(node);
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      const hitRadius = Math.max(MINIMUM_HIT_RADIUS, screenRadius() + 6);
      if (distance <= hitRadius && distance < nearestDistance) {
        nearestDistance = distance;
        nearestNode = node;
      }
    });
    return nearestNode;
  }

  function updateHover(node: number | undefined): void {
    if (hoveredNode !== undefined) elementsOf(hoveredNode).group.classList.remove('node--hover');
    hoveredNode = node;
    svg.classList.remove('board-svg--pointer', 'board-svg--blocked');
    if (node === undefined) return;
    elementsOf(node).group.classList.add('node--hover');
    svg.classList.add(
      isTappable(puzzle, state, node) ? 'board-svg--pointer' : 'board-svg--blocked',
    );
  }

  svg.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    if (runningAnimation !== undefined) {
      runningAnimation.skip();
      return;
    }
    const point = pointerToBoard(event);
    const node = nodeAt(point);
    if (node === undefined) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    dragGesture = {
      pointerId: event.pointerId,
      node,
      startX: point.x,
      startY: point.y,
      isDragging: false,
    };
  });

  svg.addEventListener('pointermove', (event) => {
    const point = pointerToBoard(event);
    if (dragGesture?.pointerId !== event.pointerId) {
      if (event.pointerType === 'mouse') updateHover(nodeAt(point));
      return;
    }
    if (!dragGesture.isDragging) {
      if (Math.hypot(point.x - dragGesture.startX, point.y - dragGesture.startY) < DRAG_THRESHOLD)
        return;
      dragGesture.isDragging = true;
      svg.classList.add('board-svg--dragging');
    }
    const logical = screenToLayout(transform, point);
    positions[dragGesture.node] = {
      x: Math.min(Math.max(logical.x, 0), layoutBounds.width),
      y: Math.min(Math.max(logical.y, 0), layoutBounds.height),
    };
    positionNode(dragGesture.node);
  });

  const endGesture = (event: PointerEvent, isCancelled: boolean): void => {
    if (dragGesture?.pointerId !== event.pointerId) return;
    const { node, isDragging } = dragGesture;
    dragGesture = undefined;
    svg.classList.remove('board-svg--dragging');
    if (!isDragging && !isCancelled) onNodeActivate(node);
  };
  svg.addEventListener('pointerup', (event) => {
    endGesture(event, false);
  });
  svg.addEventListener('pointercancel', (event) => {
    endGesture(event, true);
  });
  svg.addEventListener('pointerleave', () => {
    if (dragGesture === undefined) updateHover(undefined);
  });

  new ResizeObserver(() => {
    layoutGeometry();
  }).observe(container);

  layoutGeometry();
  render(initialState);
  container.dataset['animating'] = 'false';

  return {
    render,
    animateStep,
    highlightIndexPatients,
    setReduceMotion: (enabled) => {
      reduceMotion = enabled;
    },
  };
}

function isRemovedStatus(status: NodeStatus | undefined): boolean {
  return status === 'vaccinated' || status === 'quarantined';
}

interface SvgElementTags {
  svg: SVGSVGElement;
  g: SVGGElement;
  line: SVGLineElement;
  circle: SVGCircleElement;
  text: SVGTextElement;
  path: SVGPathElement;
}

function createSvgElement<Tag extends keyof SvgElementTags>(
  tag: Tag,
  attributes: Record<string, string>,
): SvgElementTags[Tag] {
  const element = document.createElementNS(SVG_NAMESPACE, tag) as SvgElementTags[Tag];
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}
