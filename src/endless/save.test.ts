import { describe, expect, it } from 'vitest';
import { beginRun, buyUnlock, finishRun, recordRun } from './profile';
import { unlockCost } from './research';
import { finishLevel, recordLevelProgress, type LevelResult } from './run';
import { FRESH_SAVE, SAVE_VERSION, parseSave, serialiseSave, type EndlessSave } from './save';

const PASSED_LEVEL_ONE: LevelResult = {
  level: 1,
  counts: { vaccinated: 2, quarantined: 2, untouched: 6, infected: 2 },
  savedPercent: 83,
  passThresholdPercent: 50,
  passed: true,
  nearMiss: false,
  moves: 5,
};

function savedMidRun(): EndlessSave {
  const started = beginRun(FRESH_SAVE, 'abcd1234');
  const run = started.run;
  if (run === null) throw new Error('No run');
  return recordRun(started, finishLevel(run, PASSED_LEVEL_ONE));
}

describe('parseSave', () => {
  it('round-trips a save with a run in progress', () => {
    const save = savedMidRun();
    expect(parseSave(serialiseSave(save))).toEqual({ save, source: 'loaded' });
  });

  it('starts fresh when nothing is stored', () => {
    expect(parseSave(null)).toEqual({ save: FRESH_SAVE, source: 'fresh' });
  });

  it.each([
    ['not JSON', '{oops'],
    ['not an object', '[1,2]'],
    ['no version', '{"research":5}'],
    ['an older unknown version', '{"version":0}'],
  ])('resets when the save is %s', (_, text) => {
    expect(parseSave(text)).toEqual({ save: FRESH_SAVE, source: 'reset' });
  });

  it('refuses to read, so the game never overwrites, a save from a later version', () => {
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION + 1 })).source).toBe('newer');
  });

  it('repairs invalid fields and keeps the valid ones', () => {
    const stored = {
      ...savedMidRun(),
      research: -5,
      unlocks: ['contact-tracing', 'not-a-thing', 'contact-tracing'],
      settings: { sound: 'loud' },
    };
    const { save, source } = parseSave(JSON.stringify(stored));
    expect(source).toBe('repaired');
    expect(save.research).toBe(0);
    expect(save.unlocks).toEqual(['contact-tracing']);
    expect(save.settings).toEqual(FRESH_SAVE.settings);
    expect(save.run?.levelsCleared).toBe(1);
  });

  it('keeps the taps of the level being played, so a reload resumes it', () => {
    const started = beginRun(FRESH_SAVE, 'abcd1234');
    if (started.run === null) throw new Error('No run');
    const save = recordRun(started, recordLevelProgress(started.run, [3, 7, 1], 1));
    const { save: parsed, source } = parseSave(serialiseSave(save));
    expect(source).toBe('loaded');
    expect(parsed.run).toMatchObject({ levelMoves: [3, 7, 1], levelUndosUsed: 1 });
  });

  it('migrates a version 1 save: its run resumes at the start of its level', () => {
    const current = savedMidRun();
    const versionOne = JSON.parse(serialiseSave(current)) as {
      version: number;
      run: Record<string, unknown>;
    };
    versionOne.version = 1;
    delete versionOne.run['levelMoves'];
    delete versionOne.run['levelUndosUsed'];
    const { save, source } = parseSave(JSON.stringify(versionOne));
    expect(source).toBe('loaded');
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.run).toEqual(current.run);
  });

  it.each([
    ['not a list', 'tap'],
    ['negative taps', [2, -1]],
    ['taps beyond any network', [2, 999]],
    ['fractions', [2.5]],
  ])('restarts the level, keeping the run, when its taps are %s', (_, levelMoves) => {
    const started = beginRun(FRESH_SAVE, 'abcd1234');
    const stored = { ...started, run: { ...started.run, levelMoves, levelUndosUsed: 1 } };
    const { save } = parseSave(JSON.stringify(stored));
    expect(save.run).toMatchObject({ level: 1, levelMoves: [], levelUndosUsed: 0 });
  });

  it('ignores level taps on a run that is not playing a level', () => {
    const current = savedMidRun();
    const stored = { ...current, run: { ...current.run, levelMoves: [1, 2] } };
    expect(parseSave(JSON.stringify(stored)).save.run?.levelMoves).toEqual([]);
  });

  it('drops a run that is not internally consistent', () => {
    const valid = savedMidRun();
    const run = valid.run;
    if (run === null) throw new Error('No run');
    const tampered = [
      { ...run, seed: 'NOPE' },
      { ...run, levelsCleared: 50 },
      { ...run, picks: ['double-shift', 'double-shift'] },
      { ...run, phase: 'winning' },
      { ...run, lastResult: null },
      { ...run, level: 1.5 },
    ];
    for (const badRun of tampered) {
      const { save, source } = parseSave(JSON.stringify({ ...valid, run: badRun }));
      expect(source).toBe('repaired');
      expect(save.run).toBeNull();
      expect(save.unlocks).toEqual(valid.unlocks);
    }
  });
});

describe('profile transitions', () => {
  it('banks Research and the best run when a run ends', () => {
    const save = savedMidRun();
    const run = save.run;
    if (run === null) throw new Error('No run');
    const finished = finishRun(save, run);
    expect(finished.researchEarned).toBe(10);
    expect(finished.isNewBest).toBe(true);
    expect(finished.save).toMatchObject({
      research: 10,
      researchEarned: 10,
      bestRun: { levelsCleared: 1, peopleSaved: 10 },
      runsFinished: 1,
      tutorialDone: true,
      run: null,
    });
    expect(finishRun(finished.save, run).isNewBest).toBe(false);
  });

  it('never calls a run that cleared nothing a best', () => {
    const save = beginRun(FRESH_SAVE, 'abcd1234');
    const run = save.run;
    if (run === null) throw new Error('No run');
    expect(finishRun(save, run).isNewBest).toBe(false);
  });

  it('spends Research on unlocks once, only when affordable', () => {
    expect(buyUnlock(FRESH_SAVE, 'contact-tracing')).toBeUndefined();
    const rich = { ...FRESH_SAVE, research: 100 };
    const bought = buyUnlock(rich, 'contact-tracing');
    expect(bought).toMatchObject({
      research: 100 - unlockCost('contact-tracing'),
      unlocks: ['contact-tracing'],
    });
    expect(bought && buyUnlock(bought, 'contact-tracing')).toBeUndefined();
  });

  it('applies starting bonuses to a new run', () => {
    const save = { ...FRESH_SAVE, unlocks: ['spare-reroll', 'head-start'] as const };
    const run = beginRun({ ...save, unlocks: [...save.unlocks] }, 'abcd1234').run;
    expect(run?.freeRerollsLeft).toBe(1);
    expect(run?.picks).toHaveLength(1);
  });
});
