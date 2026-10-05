import { describe, expect, it } from 'vitest';
import { DAILY_PUZZLE_CONFIG, type PuzzleConfig } from './config';
import {
  applyTap,
  chooseIndexPatients,
  contactsStillInNetwork,
  countOutcomes,
  isOutbreakContained,
  isTappable,
  replayMoves,
  scorePercent,
  startGame,
  type GameEvent,
  type GameState,
} from './game';
import { createGraph } from './graph';
import { createPuzzle, type Puzzle } from './puzzle';
import { createMulberry32, type RandomSource } from './random';
import { createTableTransmissionRolls } from './transmission';

/**
 * Six people, a hand-built network and hand-picked rolls:
 *
 *   e0: 0–1   e1: 0–2   e2: 1–3   e3: 2–3   e4: 3–4   e5: 4–5   e6: 1–2
 *
 * Person 4 refuses vaccines. One vaccine, one index patient, β = 0.35. The outbreak stream
 * always returns 0.99, so the candidate shuffle keeps ascending order and the index patient is
 * the lowest-numbered susceptible person.
 */
const FIXTURE_CONFIG: PuzzleConfig = {
  nodeCount: 6,
  ringNeighbourCount: 2,
  rewireProbability: 0,
  refuserCount: 1,
  vaccineCount: 1,
  indexPatientCount: 1,
  transmissionProbability: 0.35,
};

/** `FIXTURE_ROLLS[edge] = [turn 0, turn 1]`. */
const FIXTURE_ROLLS = [
  [0.2, 0.9], //  e0 0–1
  [0.35, 0.6], // e1 0–2: exactly β fails, the roll must be strictly below
  [0.01, 0.9], // e2 1–3
  [0.9, 0.9], //  e3 2–3
  [0.01, 0.9], // e4 3–4
  [0.9, 0.9], //  e5 4–5
  [0.01, 0.5], // e6 1–2
];

function createFixturePuzzle(): Puzzle {
  const graph = createGraph(6, [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
    [3, 4],
    [4, 5],
    [1, 2],
  ]);
  return {
    config: FIXTURE_CONFIG,
    seedKey: 'fixture',
    graph,
    isRefuser: [false, false, false, false, true, false],
    transmissionRolls: createTableTransmissionRolls(FIXTURE_ROLLS),
    createOutbreakRandom: () => () => 0.99,
  };
}

function playMoves(
  puzzle: Puzzle,
  moves: readonly number[],
): { state: GameState; events: GameEvent[][] } {
  let state = startGame(puzzle).state;
  const events: GameEvent[][] = [];
  for (const node of moves) {
    const step = applyTap(puzzle, state, node);
    state = step.state;
    events.push([...step.events]);
  }
  return { state, events };
}

describe('the 6-node fixture, as computed on paper', () => {
  it('sequence A: a normal turn, then a forced turn', () => {
    const puzzle = createFixturePuzzle();
    const opening = startGame(puzzle);
    expect(opening.events).toEqual([]);
    expect(isTappable(puzzle, opening.state, 4)).toBe(false); // refuser cannot be vaccinated

    // Tap 5: vaccinated, edge e5 leaves. Last vaccine, so the outbreak starts in the same move.
    // Candidates in ascending order 0,1,2,3,4 → index patient 0. Its group {0,1,2,3,4} still
    // holds susceptible people, so play goes on.
    const { state, events } = playMoves(puzzle, [5, 4, 3]);
    expect(events[0]).toEqual([
      { kind: 'vaccinated', node: 5 },
      { kind: 'outbreak-started', indexPatients: [0] },
    ]);

    // Tap 4 (a refuser may be quarantined): e4 leaves. Turn 0 starts with only 0 infected.
    //   person 1 via e0: 0.20 < 0.35 → infected.
    //   person 2 via e1: 0.35, not below β → safe.
    //   e2 (1–3) and e6 (1–2) roll 0.01, but 1 was not infected at the start of the turn.
    expect(events[1]).toEqual([
      { kind: 'quarantined', node: 4 },
      {
        kind: 'spread',
        turn: 0,
        transmissions: [{ edgeIndex: 0, fromNode: 0, toNode: 1 }],
        forced: false,
      },
    ]);

    // Tap 3: e2 and e3 leave. Turn 1: only person 2 is exposed, via e1 (0.60) and e6 (0.50).
    // Neither is below β, so the lowest roll, e6 from person 1, infects 2. Nobody susceptible
    // is left in contact with the infection, so the game ends.
    expect(events[2]).toEqual([
      { kind: 'quarantined', node: 3 },
      {
        kind: 'spread',
        turn: 1,
        transmissions: [{ edgeIndex: 6, fromNode: 1, toNode: 2 }],
        forced: true,
      },
      { kind: 'ended' },
    ]);
    expect(state).toEqual({
      phase: 'ended',
      nodeStatuses: [
        'infected',
        'infected',
        'infected',
        'quarantined',
        'quarantined',
        'vaccinated',
      ],
      vaccinesRemaining: 0,
      quarantineCount: 2,
      turnsElapsed: 2,
      indexPatients: [0],
      moves: [5, 4, 3],
    });
    const counts = countOutcomes(state);
    expect(counts).toEqual({ vaccinated: 1, quarantined: 2, untouched: 0, infected: 3 });
    expect(scorePercent(counts)).toBe(50);
  });

  it('sequence C: two people infected in the same turn, then an empty final turn', () => {
    const puzzle = createFixturePuzzle();
    // Tap 0: vaccinated (e0, e1 leave). Candidates 1,2,3,4,5 → index patient 1.
    // Tap 5: quarantined (e5 leaves). Turn 0 starts with only 1 infected:
    //   person 2 via e6: 0.01 → infected.   person 3 via e2: 0.01 → infected.
    //   person 4 via e4 (0.01) is next to 3, but 3 was not infected at the start of the turn.
    // Tap 4: quarantined (e4 leaves). Turn 1: nobody susceptible is exposed, so no one is
    // infected and the forced rule does not apply. The outbreak is contained.
    const { state, events } = playMoves(puzzle, [0, 5, 4]);
    expect(events[0]).toEqual([
      { kind: 'vaccinated', node: 0 },
      { kind: 'outbreak-started', indexPatients: [1] },
    ]);
    expect(events[1]).toEqual([
      { kind: 'quarantined', node: 5 },
      {
        kind: 'spread',
        turn: 0,
        transmissions: [
          { edgeIndex: 6, fromNode: 1, toNode: 2 },
          { edgeIndex: 2, fromNode: 1, toNode: 3 },
        ],
        forced: false,
      },
    ]);
    expect(events[2]).toEqual([
      { kind: 'quarantined', node: 4 },
      { kind: 'spread', turn: 1, transmissions: [], forced: false },
      { kind: 'ended' },
    ]);
    expect(state.nodeStatuses).toEqual([
      'vaccinated',
      'infected',
      'infected',
      'infected',
      'quarantined',
      'quarantined',
    ]);
    expect(scorePercent(countOutcomes(state))).toBe(50);
  });

  it('rejects taps on infected, removed and refusing people, and every tap after the end', () => {
    const puzzle = createFixturePuzzle();
    const afterVaccine = applyTap(puzzle, startGame(puzzle).state, 5).state;
    expect(isTappable(puzzle, afterVaccine, 0)).toBe(false); // infected
    expect(isTappable(puzzle, afterVaccine, 5)).toBe(false); // vaccinated
    expect(isTappable(puzzle, afterVaccine, 4)).toBe(true); // refusers may be quarantined
    expect(() => applyTap(puzzle, afterVaccine, 0)).toThrow();
    const ended = playMoves(puzzle, [5, 4, 3]).state;
    expect(ended.nodeStatuses.some((_, node) => isTappable(puzzle, ended, node))).toBe(false);
  });
});

describe('contactsStillInNetwork', () => {
  it('drops each neighbour by one per vaccination or quarantine and ignores infections', () => {
    const puzzle = createFixturePuzzle();
    const contacts = (state: GameState): number[] =>
      contactsStillInNetwork(puzzle.graph, state.nodeStatuses);
    const opening = startGame(puzzle).state;
    expect(contacts(opening)).toEqual([2, 3, 3, 3, 2, 1]);

    // The only vaccine goes to person 1 and starts the outbreak at person 0.
    const afterVaccine = applyTap(puzzle, opening, 1).state;
    expect(afterVaccine.nodeStatuses[0]).toBe('infected');
    expect(contacts(afterVaccine)).toEqual([1, 3, 2, 2, 2, 1]);

    // Quarantining person 3 passes a day in which person 2 falls ill.
    const afterQuarantine = applyTap(puzzle, afterVaccine, 3).state;
    expect(afterQuarantine.nodeStatuses[2]).toBe('infected');
    expect(contacts(afterQuarantine)).toEqual([1, 2, 1, 2, 1, 1]);
  });
});

describe('the never-fizzle rule', () => {
  it('infects exactly the susceptible end of the lowest-roll exposed edge when every roll fails', () => {
    const puzzle = createFixturePuzzle();
    const lowestRollPuzzle: Puzzle = {
      ...puzzle,
      // Turn 0 with person 0 infected exposes 1 (e0) and 2 (e1); make both fail, e1 lower.
      transmissionRolls: createTableTransmissionRolls(
        FIXTURE_ROLLS.map((rolls, edge) => (edge === 0 ? [0.8] : edge === 1 ? [0.7] : rolls)),
      ),
    };
    const { events, state } = playMoves(lowestRollPuzzle, [5, 4]);
    expect(events[1]?.[1]).toEqual({
      kind: 'spread',
      turn: 0,
      transmissions: [{ edgeIndex: 1, fromNode: 0, toNode: 2 }],
      forced: true,
    });
    expect(state.nodeStatuses[1]).toBe('susceptible');
  });

  it('never lets a turn with an exposed susceptible person pass without an infection', () => {
    let forcedTurnCount = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, String(seed));
      const policy = createMulberry32(seed);
      let state = startGame(puzzle).state;
      while (state.phase !== 'ended') {
        const node = pickRandomTappable(puzzle, state, policy);
        const statusesAfterQuarantine = state.nodeStatuses.map((status, index) =>
          index === node && state.phase === 'quarantine' ? 'quarantined' : status,
        );
        const step = applyTap(puzzle, state, node);
        const spread = step.events.find((event) => event.kind === 'spread');
        if (spread?.kind === 'spread') {
          const wasExposed = !isOutbreakContained(puzzle.graph, statusesAfterQuarantine);
          expect(spread.transmissions.length > 0).toBe(wasExposed);
          if (spread.forced) forcedTurnCount++;
          for (const transmission of spread.transmissions) {
            const roll = puzzle.transmissionRolls.roll(transmission.edgeIndex, spread.turn);
            if (spread.forced)
              expect(roll).toBeGreaterThanOrEqual(puzzle.config.transmissionProbability);
            else expect(roll).toBeLessThan(puzzle.config.transmissionProbability);
          }
        }
        state = step.state;
      }
    }
    expect(forcedTurnCount).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('produces byte-identical state JSON for the same seed and moves across 1,000 runs', () => {
    const referencePuzzle = createPuzzle(DAILY_PUZZLE_CONFIG, '42');
    const moves = playRandomGame(referencePuzzle, createMulberry32(99)).moves;
    const referenceJson = JSON.stringify(replayMoves(referencePuzzle, moves));
    for (let run = 0; run < 1000; run++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, '42');
      let state = startGame(puzzle).state;
      for (const node of moves) state = applyTap(puzzle, state, node).state;
      expect(JSON.stringify(state)).toBe(referenceJson);
    }
  });

  it('gives different puzzles different games', () => {
    const graphs = new Set(
      Array.from({ length: 50 }, (_, index) =>
        JSON.stringify(createPuzzle(DAILY_PUZZLE_CONFIG, String(index + 1)).graph.edges),
      ),
    );
    expect(graphs.size).toBe(50);
  });

  it('replays saved moves and rejects illegal or malformed ones', () => {
    const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, '7');
    const finished = playRandomGame(puzzle, createMulberry32(3));
    expect(replayMoves(puzzle, finished.moves)).toEqual(finished);
    expect(replayMoves(puzzle, finished.moves.slice(0, 2))?.phase).toBe('vaccinate');
    const firstMove = finished.moves[0] ?? 0;
    expect(replayMoves(puzzle, [firstMove, firstMove])).toBeUndefined();
    expect(replayMoves(puzzle, [40])).toBeUndefined();
    expect(replayMoves(puzzle, [1.5])).toBeUndefined();
    expect(replayMoves(puzzle, [...finished.moves, 0])).toBeUndefined();
  });
});

describe('random play with the daily config', () => {
  it('reaches the end within 200 turns, with consistent counts', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, String(seed));
      const state = playRandomGame(puzzle, createMulberry32(seed * 31));
      expect(state.phase).toBe('ended');
      expect(state.turnsElapsed).toBeLessThanOrEqual(200);
      expect(state.indexPatients).toHaveLength(2);
      const counts = countOutcomes(state);
      expect(counts.vaccinated).toBe(4);
      expect(counts.quarantined).toBe(state.quarantineCount);
      expect(counts.vaccinated + counts.quarantined + counts.untouched + counts.infected).toBe(40);
      expect(isOutbreakContained(puzzle.graph, state.nodeStatuses)).toBe(true);
    }
  });

  it('never vaccinates a refuser and marks exactly two refusers', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, String(seed));
      expect(puzzle.isRefuser.filter(Boolean)).toHaveLength(2);
      const state = playRandomGame(puzzle, createMulberry32(seed));
      state.nodeStatuses.forEach((status, node) => {
        if (puzzle.isRefuser[node] === true) expect(status).not.toBe('vaccinated');
      });
    }
  });
});

describe('chooseIndexPatients', () => {
  it('picks non-adjacent people whenever a non-adjacent pair exists', () => {
    // A star: 0 is adjacent to everyone, so the only non-adjacent pairs avoid 0.
    const star = createGraph(5, [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ]);
    const statuses = [
      'susceptible',
      'susceptible',
      'susceptible',
      'vaccinated',
      'vaccinated',
    ] as const;
    for (let seed = 0; seed < 50; seed++) {
      const picks = chooseIndexPatients(star, statuses, 2, createMulberry32(seed));
      expect(picks.slice().sort()).toEqual([1, 2]);
    }
  });

  it('falls back to adjacent people when no non-adjacent set exists', () => {
    const pair = createGraph(2, [[0, 1]]);
    expect(
      chooseIndexPatients(pair, ['susceptible', 'susceptible'], 2, createMulberry32(1)).sort(),
    ).toEqual([0, 1]);
  });

  it('keeps the two daily index patients apart', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const puzzle = createPuzzle(DAILY_PUZZLE_CONFIG, String(seed));
      const state = playRandomGame(puzzle, createMulberry32(seed));
      const [first, second] = state.indexPatients;
      const areAdjacent = puzzle.graph.adjacency[first ?? -1]?.some(
        ({ neighbour }) => neighbour === second,
      );
      expect(areAdjacent).toBe(false);
    }
  });
});

describe('a config without vaccines', () => {
  it('starts the outbreak immediately', () => {
    const puzzle = createPuzzle({ ...DAILY_PUZZLE_CONFIG, vaccineCount: 0 }, 'no-vaccines');
    const opening = startGame(puzzle);
    expect(opening.state.phase).toBe('quarantine');
    expect(opening.events[0]).toEqual({
      kind: 'outbreak-started',
      indexPatients: opening.state.indexPatients,
    });
  });
});

function pickRandomTappable(puzzle: Puzzle, state: GameState, random: RandomSource): number {
  const tappable = state.nodeStatuses.flatMap((_, node) =>
    isTappable(puzzle, state, node) ? [node] : [],
  );
  const node = tappable[Math.floor(random() * tappable.length)];
  if (node === undefined) throw new Error('No tappable node in an unfinished game');
  return node;
}

function playRandomGame(puzzle: Puzzle, random: RandomSource): GameState {
  let state = startGame(puzzle).state;
  while (state.phase !== 'ended')
    state = applyTap(puzzle, state, pickRandomTappable(puzzle, state, random)).state;
  return state;
}
