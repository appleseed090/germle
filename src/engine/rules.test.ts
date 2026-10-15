import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG, type PuzzleConfig } from './config';
import { dailySeedKey } from './daily';
import {
  applyTap,
  contactsStillInNetwork,
  isTappable,
  replayMoves,
  startGame,
  type GameState,
} from './game';
import { createGraph } from './graph';
import { createPuzzle, type Puzzle } from './puzzle';
import { createMulberry32 } from './random';
import {
  CLASSIC_RULES,
  applyTapWithRules,
  isTappableWithRules,
  predictNextDayInfections,
  replayMovesWithRules,
  startGameWithRules,
  validateGameRules,
  type GameRules,
} from './rules';
import { createTableTransmissionRolls } from './transmission';

/**
 * The six-person network of `game.test.ts`, with its rolls:
 *
 *   e0: 0–1   e1: 0–2   e2: 1–3   e3: 2–3   e4: 3–4   e5: 4–5   e6: 1–2
 *
 * Person 4 refuses vaccines; one vaccine, one index patient, β = 0.35. The outbreak stream always
 * returns 0.99, so the index patient is the lowest-numbered susceptible person.
 */
function createFixturePuzzle(): Puzzle {
  const config: PuzzleConfig = {
    nodeCount: 6,
    ringNeighbourCount: 2,
    rewireProbability: 0,
    refuserCount: 1,
    vaccineCount: 1,
    indexPatientCount: 1,
    transmissionProbability: 0.35,
  };
  return {
    config,
    seedKey: 'fixture',
    graph: createGraph(6, [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [3, 4],
      [4, 5],
      [1, 2],
    ]),
    isRefuser: [false, false, false, false, true, false],
    transmissionRolls: createTableTransmissionRolls([
      [0.2, 0.9],
      [0.35, 0.6],
      [0.01, 0.9],
      [0.9, 0.9],
      [0.01, 0.9],
      [0.9, 0.9],
      [0.01, 0.5],
    ]),
    createOutbreakRandom: () => () => 0.99,
  };
}

function withRules(overrides: Partial<GameRules>): GameRules {
  return validateGameRules({ ...CLASSIC_RULES, ...overrides });
}

function playWithRules(puzzle: Puzzle, rules: GameRules, moves: readonly number[]) {
  let state = startGameWithRules(puzzle, rules).state;
  const events = [];
  for (const node of moves) {
    const step = applyTapWithRules(puzzle, rules, state, node);
    state = step.state;
    events.push(step.events);
  }
  return { state, events };
}

/**
 * Plays one game through the classic engine and the rules engine with every option off, move by
 * move, failing on the first difference in state, events or legal moves.
 */
function expectClassicEquivalence(puzzle: Puzzle, chooseMove: (state: GameState) => number): void {
  const classicStart = startGame(puzzle);
  const rulesStart = startGameWithRules(puzzle, CLASSIC_RULES);
  expect(rulesStart).toEqual(classicStart);
  let state = classicStart.state;
  while (state.phase !== 'ended') {
    for (let node = 0; node < puzzle.config.nodeCount; node++)
      expect(isTappableWithRules(puzzle, state, node)).toBe(isTappable(puzzle, state, node));
    const node = chooseMove(state);
    const classicStep = applyTap(puzzle, state, node);
    expect(applyTapWithRules(puzzle, CLASSIC_RULES, state, node)).toEqual(classicStep);
    state = classicStep.state;
  }
  expect(replayMovesWithRules(puzzle, CLASSIC_RULES, state.moves)).toEqual(
    replayMoves(puzzle, state.moves),
  );
}

/** The scripted player of `frozen-puzzles.test.ts`: most infected neighbours, then most contacts. */
function scriptedMove(puzzle: Puzzle, state: GameState): number {
  const contacts = contactsStillInNetwork(puzzle.graph, state.nodeStatuses);
  let chosenNode = -1;
  let chosenPriority = -1;
  for (let node = 0; node < puzzle.config.nodeCount; node++) {
    if (!isTappable(puzzle, state, node)) continue;
    const infectedNeighbours = (puzzle.graph.adjacency[node] ?? []).filter(
      ({ neighbour }) => state.nodeStatuses[neighbour] === 'infected',
    ).length;
    const priority = infectedNeighbours * 1000 + (contacts[node] ?? 0);
    if (priority > chosenPriority) {
      chosenNode = node;
      chosenPriority = priority;
    }
  }
  return chosenNode;
}

describe('the rules engine with every option off', () => {
  it('plays every locked daily puzzle exactly like the classic engine', () => {
    for (let puzzleNumber = 1; puzzleNumber <= 365; puzzleNumber++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, dailySeedKey(puzzleNumber));
      expectClassicEquivalence(puzzle, (state) => scriptedMove(puzzle, state));
    }
  });

  it('plays random legal moves on varied practice configs exactly like the classic engine', () => {
    const configs: PuzzleConfig[] = [
      DAILY_PUZZLE_CONFIG,
      { ...DAILY_PUZZLE_CONFIG, nodeCount: 80, ringNeighbourCount: 6, vaccineCount: 12 },
      { ...DAILY_PUZZLE_CONFIG, vaccineCount: 0, indexPatientCount: 5, refuserCount: 10 },
      { ...DAILY_PUZZLE_CONFIG, transmissionProbability: 0.05 },
    ];
    const random = createMulberry32(20261015);
    for (const [configIndex, config] of configs.entries()) {
      for (let game = 0; game < 25; game++) {
        const puzzle = createPuzzle(config, `practice-equivalence-${configIndex}-${game}`);
        expectClassicEquivalence(puzzle, (state) => {
          const legal = state.nodeStatuses.flatMap((_, node) =>
            isTappable(puzzle, state, node) ? [node] : [],
          );
          return legal[Math.floor(random() * legal.length)] as number;
        });
      }
    }
  });
});

describe('quarantinesPerDay and quarantinesBeforeFirstSpread', () => {
  it('passes a day only after every second quarantine with two per day', () => {
    const { events } = playWithRules(
      createFixturePuzzle(),
      withRules({ quarantinesPerDay: 2 }),
      [5, 4, 3],
    );
    expect(events[1]).toEqual([{ kind: 'quarantined', node: 4 }]);
    expect(events[2]).toEqual([
      { kind: 'quarantined', node: 3 },
      {
        kind: 'spread',
        turn: 0,
        transmissions: [{ edgeIndex: 0, fromNode: 0, toNode: 1 }],
        forced: false,
      },
    ]);
  });

  it('lets the first quarantines pass no day, then spreads after each one', () => {
    const rules = withRules({ quarantinesBeforeFirstSpread: 1 });
    const { state, events } = playWithRules(createFixturePuzzle(), rules, [5, 4, 3]);
    expect(events[1]).toEqual([{ kind: 'quarantined', node: 4 }]);
    expect(events[2]?.[1]).toMatchObject({ kind: 'spread', turn: 0 });
    expect(state.turnsElapsed).toBe(1);
  });

  it('ends the game when a quarantine that passes no day contains the outbreak', () => {
    const rules = withRules({ quarantinesBeforeFirstSpread: 5 });
    const { state, events } = playWithRules(createFixturePuzzle(), rules, [5, 1, 2]);
    expect(events[2]).toEqual([{ kind: 'quarantined', node: 2 }, { kind: 'ended' }]);
    expect(state.phase).toBe('ended');
    expect(state.turnsElapsed).toBe(0);
  });
});

describe('vaccinatedNeighbourTransmissionFactor', () => {
  it('shields people next to vaccinated ones; the never-fizzle rule still infects one', () => {
    // Vaccinating 3 shields person 1 (a neighbour of 3): 0.35 × 0 = 0, so e0's 0.20 no longer
    // infects. Nobody's roll succeeds, so the lowest exposed roll (e0) is forced.
    const rules = withRules({ vaccinatedNeighbourTransmissionFactor: 0 });
    const { events } = playWithRules(createFixturePuzzle(), rules, [3, 4]);
    expect(events[1]?.[1]).toEqual({
      kind: 'spread',
      turn: 0,
      transmissions: [{ edgeIndex: 0, fromNode: 0, toNode: 1 }],
      forced: true,
    });
  });

  it('multiplies once per vaccinated neighbour', () => {
    // Factor 0.5 with one vaccinated neighbour: threshold 0.175 still lets e0's 0.20 fail.
    const halved = withRules({ vaccinatedNeighbourTransmissionFactor: 0.5 });
    expect(playWithRules(createFixturePuzzle(), halved, [3, 4]).events[1]?.[1]).toMatchObject({
      forced: true,
    });
    // Factor 0.6: threshold 0.21, so e0's 0.20 infects normally.
    const mild = withRules({ vaccinatedNeighbourTransmissionFactor: 0.6 });
    expect(playWithRules(createFixturePuzzle(), mild, [3, 4]).events[1]?.[1]).toMatchObject({
      forced: false,
    });
  });
});

describe('spreadCanFizzle', () => {
  it('lets a day with no successful roll infect nobody', () => {
    const rules = withRules({ spreadCanFizzle: true });
    const { state, events } = playWithRules(createFixturePuzzle(), rules, [5, 4, 3]);
    expect(events[2]).toEqual([
      { kind: 'quarantined', node: 3 },
      { kind: 'spread', turn: 1, transmissions: [], forced: false },
    ]);
    expect(state.nodeStatuses[2]).toBe('susceptible');
    expect(state.phase).toBe('quarantine');
  });
});

describe('naturallyImmuneCount', () => {
  it('starts people immune, counted as vaccinated, without spending vaccines', () => {
    const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, 'endless-test-1');
    const { state } = startGameWithRules(puzzle, withRules({ naturallyImmuneCount: 3 }));
    expect(state.nodeStatuses.filter((status) => status === 'vaccinated')).toHaveLength(3);
    expect(state.vaccinesRemaining).toBe(DAILY_PUZZLE_CONFIG.vaccineCount);
    expect(state.moves).toEqual([]);
    expect(startGameWithRules(puzzle, withRules({ naturallyImmuneCount: 3 })).state).toEqual(state);
  });

  it('never leaves vaccines that cannot be spent', () => {
    const puzzle = createFixturePuzzle();
    const { state } = startGameWithRules(puzzle, withRules({ naturallyImmuneCount: 5 }));
    const vaccinatable = state.nodeStatuses.filter((_, node) =>
      isTappableWithRules(puzzle, state, node),
    ).length;
    expect(state.phase === 'vaccinate' ? state.vaccinesRemaining : 0).toBeLessThanOrEqual(
      vaccinatable,
    );
  });
});

describe('indexPatientsKnownInAdvance', () => {
  it('shows the index patients before vaccinating, who cannot be vaccinated', () => {
    const puzzle = createFixturePuzzle();
    const rules = withRules({ indexPatientsKnownInAdvance: true });
    const { state } = startGameWithRules(puzzle, rules);
    expect(state.indexPatients).toEqual([0]);
    expect(state.nodeStatuses[0]).toBe('susceptible');
    expect(isTappableWithRules(puzzle, state, 0)).toBe(false);
    const afterVaccine = applyTapWithRules(puzzle, rules, state, 5);
    expect(afterVaccine.events).toEqual([
      { kind: 'vaccinated', node: 5 },
      { kind: 'outbreak-started', indexPatients: [0] },
    ]);
  });
});

describe('predictNextDayInfections', () => {
  it('names exactly who the next day infects when someone else is quarantined', () => {
    for (let game = 0; game < 40; game++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, `endless-prediction-${game}`);
      let state = startGame(puzzle).state;
      while (state.phase !== 'ended') {
        const atRisk = predictNextDayInfections(puzzle, CLASSIC_RULES, state);
        const node = scriptedMove(puzzle, state);
        const step = applyTapWithRules(puzzle, CLASSIC_RULES, state, node);
        if (state.phase === 'quarantine' && !atRisk.includes(node)) {
          const infected = step.events.flatMap((event) =>
            event.kind === 'spread' ? event.transmissions.map(({ toNode }) => toNode) : [],
          );
          expect([...new Set(infected)].sort((a, b) => a - b)).toEqual(atRisk);
        }
        state = step.state;
      }
      expect(predictNextDayInfections(puzzle, CLASSIC_RULES, state)).toEqual([]);
    }
  });
});

describe('replayMovesWithRules', () => {
  it('reproduces a game under any rules and rejects illegal moves', () => {
    const puzzle = createFixturePuzzle();
    const rules = withRules({ quarantinesPerDay: 2, spreadCanFizzle: true });
    const played = playWithRules(puzzle, rules, [5, 4, 3]).state;
    expect(replayMovesWithRules(puzzle, rules, [5, 4, 3])).toEqual(played);
    expect(replayMovesWithRules(puzzle, rules, [5, 0])).toBeUndefined();
    expect(replayMovesWithRules(puzzle, rules, [1.5])).toBeUndefined();
  });
});

describe('validateGameRules', () => {
  it.each<[string, Partial<GameRules>]>([
    ['no quarantines per day', { quarantinesPerDay: 0 }],
    ['fractional free quarantines', { quarantinesBeforeFirstSpread: 0.5 }],
    ['negative immunity', { naturallyImmuneCount: -1 }],
    ['a shield factor above 1', { vaccinatedNeighbourTransmissionFactor: 1.5 }],
  ])('rejects %s', (_, overrides) => {
    expect(() => validateGameRules({ ...CLASSIC_RULES, ...overrides })).toThrow(RangeError);
  });
});
