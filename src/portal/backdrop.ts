import { countOutcomes, type GameState } from '../engine/game';
import { computeForceLayout, layoutBoundsFor } from '../engine/layout';
import { createStreamRandom } from '../engine/random';
import { applyTapWithRules, startGameWithRules } from '../engine/rules';
import { prepareLevel, type PreparedLevel } from '../endless/levels';
import { chooseBotMove } from '../endless/simulation';
import { createBoard } from '../ui/board';
import { element } from './dom';

/** A network mid-outbreak: the title screen's backdrop and the covers' artwork. */
export interface OutbreakScene {
  readonly prepared: PreparedLevel;
  readonly state: GameState;
}

/**
 * A fixed level played by the bot until at least `infectedShare` of its people are infected (or
 * the game ends), so the outbreak is visibly under way but most of the network is still in play.
 * Deterministic, so the backdrop and the covers always look the same.
 */
export function outbreakScene(level: number, infectedShare: number): OutbreakScene {
  const prepared = prepareLevel('backdrop', level, []);
  const { puzzle, rules } = prepared;
  let state = startGameWithRules(puzzle, rules).state;
  const infectedTarget = Math.ceil(infectedShare * puzzle.config.nodeCount);
  while (state.phase !== 'ended' && countOutcomes(state).infected < infectedTarget)
    state = applyTapWithRules(puzzle, rules, state, chooseBotMove(prepared, state)).state;
  return { prepared, state };
}

/**
 * Draws a scene with the real board renderer, ignoring input, into `stage`.
 *
 * @returns A function that removes it.
 */
export function mountScene(
  stage: HTMLElement,
  scene: OutbreakScene,
  className: string,
): () => void {
  const { puzzle } = scene.prepared;
  const container = element('div', {
    className: `board portal-board ${className}`,
    attributes: { 'aria-hidden': 'true' },
  });
  stage.append(container);
  const layoutBounds = layoutBoundsFor(puzzle.config.nodeCount);
  createBoard(
    {
      container,
      puzzle,
      layout: computeForceLayout(
        puzzle.graph,
        createStreamRandom(puzzle.seedKey, 'layout'),
        layoutBounds,
      ),
      layoutBounds,
      reduceMotion: true,
      onNodeActivate: () => undefined,
    },
    scene.state,
  );
  return () => {
    container.remove();
  };
}
