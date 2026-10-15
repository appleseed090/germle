import { describe, expect, it } from 'vitest';
import { replayMovesWithRules } from '../engine/rules';
import { prepareLevel } from './levels';
import {
  abandonRun,
  canUseSecondChance,
  compareRunScores,
  createRunSeed,
  currentOffer,
  endRun,
  finishLevel,
  isRunSeed,
  judgeLevel,
  pickUpgrade,
  rerollOffer,
  runScore,
  skipOffer,
  startRun,
  useSecondChance,
  type LevelResult,
  type RunState,
} from './run';
import { playLevelWithBot } from './simulation';
import { UPGRADE_IDS } from './upgrades';

const EVERYTHING = new Set(UPGRADE_IDS);
const NO_BONUSES = { startingPicks: [], freeRerolls: 0 };

function result(level: number, passed: boolean): LevelResult {
  return {
    level,
    counts: { vaccinated: 2, quarantined: 3, untouched: passed ? 7 : 1, infected: passed ? 2 : 8 },
    savedPercent: passed ? 86 : 43,
    passThresholdPercent: 50,
    passed,
    nearMiss: false,
    moves: 6,
  };
}

describe('a run', () => {
  it('starts at level 1 with its starting bonuses', () => {
    const run = startRun('abcd1234', { startingPicks: ['masks'], freeRerolls: 1 });
    expect(run).toMatchObject({
      level: 1,
      phase: 'playing',
      picks: ['masks'],
      freeRerollsLeft: 1,
      levelsCleared: 0,
      peopleSaved: 0,
      lastResult: null,
    });
  });

  it('scores a passed level, offers upgrades and moves on after a pick', () => {
    const passed = finishLevel(startRun('abcd1234', NO_BONUSES), result(1, true));
    expect(passed).toMatchObject({ phase: 'choosing', levelsCleared: 1, peopleSaved: 12 });
    const offer = currentOffer(passed, EVERYTHING);
    expect(offer).toHaveLength(3);
    expect(currentOffer(passed, EVERYTHING)).toEqual(offer);
    const next = pickUpgrade(passed, offer[0] as (typeof offer)[number], offer);
    expect(next).toMatchObject({ phase: 'playing', level: 2, picks: [offer[0]] });
    expect(() => pickUpgrade(passed, 'burnout', ['masks'])).toThrow();
  });

  it('draws a new offer on a reroll, spending free rerolls first', () => {
    const passed = finishLevel(
      startRun('abcd1234', { startingPicks: [], freeRerolls: 1 }),
      result(1, true),
    );
    const rerolled = rerollOffer(passed);
    expect(rerolled.freeRerollsLeft).toBe(0);
    expect(rerolled.rerollsThisOffer).toBe(1);
    expect(currentOffer(rerolled, EVERYTHING)).not.toEqual(currentOffer(passed, EVERYTHING));
    expect(rerollOffer(rerolled).freeRerollsLeft).toBe(0);
    expect(pickUpgrade(rerolled, 'masks', ['masks']).rerollsThisOffer).toBe(0);
  });

  it('can skip an empty offer', () => {
    const passed = finishLevel(startRun('abcd1234', NO_BONUSES), result(1, true));
    expect(skipOffer(passed)).toMatchObject({ phase: 'playing', level: 2, picks: [] });
  });

  it('gives one second chance per run on the same level, then ends', () => {
    const failed = finishLevel(startRun('abcd1234', NO_BONUSES), result(1, false));
    expect(failed).toMatchObject({ phase: 'failed', levelsCleared: 0, peopleSaved: 0 });
    expect(canUseSecondChance(failed)).toBe(true);
    const retry = useSecondChance(failed);
    expect(retry).toMatchObject({ phase: 'playing', level: 1, secondChanceUsed: true });
    const failedAgain = finishLevel(retry, result(1, false));
    expect(canUseSecondChance(failedAgain)).toBe(false);
    expect(() => useSecondChance(failedAgain)).toThrow();
    expect(endRun(failedAgain).phase).toBe('over');
  });

  it('can be abandoned from any phase, keeping its score', () => {
    const passed = finishLevel(startRun('abcd1234', NO_BONUSES), result(1, true));
    expect(abandonRun(passed)).toMatchObject({ phase: 'over', levelsCleared: 1 });
    expect(abandonRun(startRun('abcd1234', NO_BONUSES)).phase).toBe('over');
  });

  it('rejects transitions from the wrong phase', () => {
    const run = startRun('abcd1234', NO_BONUSES);
    expect(() => currentOffer(run, EVERYTHING)).toThrow();
    expect(() => endRun(run)).toThrow();
    expect(() => finishLevel(run, result(2, true))).toThrow();
  });

  it('survives a JSON round trip, as saves need', () => {
    const run: RunState = finishLevel(startRun('abcd1234', NO_BONUSES), result(1, true));
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});

describe('judgeLevel', () => {
  it('passes at or above the pass mark and flags near misses', () => {
    const prepared = prepareLevel('abcd1234', 1, []);
    const finalState = playLevelWithBot(prepared);
    const judged = judgeLevel(prepared, finalState);
    expect(judged.passed).toBe(judged.savedPercent >= prepared.passThresholdPercent);
    expect(judged.nearMiss).toBe(
      Math.abs(judged.savedPercent - prepared.passThresholdPercent) <= 3,
    );
    expect(judged.moves).toBe(finalState.moves.length);
    expect(replayMovesWithRules(prepared.puzzle, prepared.rules, finalState.moves)).toEqual(
      finalState,
    );
  });
});

describe('scores and seeds', () => {
  it('ranks by levels cleared, then people saved', () => {
    expect(
      compareRunScores(
        { levelsCleared: 5, peopleSaved: 10 },
        { levelsCleared: 4, peopleSaved: 99 },
      ),
    ).toBeGreaterThan(0);
    expect(
      compareRunScores(
        { levelsCleared: 5, peopleSaved: 10 },
        { levelsCleared: 5, peopleSaved: 11 },
      ),
    ).toBeLessThan(0);
    expect(runScore(startRun('abcd1234', NO_BONUSES))).toEqual({
      levelsCleared: 0,
      peopleSaved: 0,
    });
  });

  it('makes valid seeds and rejects malformed ones', () => {
    expect(isRunSeed(createRunSeed(Math.random))).toBe(true);
    expect(createRunSeed(() => 0)).toBe('aaaaaaaa');
    expect(isRunSeed('ABCD1234')).toBe(false);
    expect(isRunSeed('abc')).toBe(false);
    expect(isRunSeed(12345678)).toBe(false);
  });
});
