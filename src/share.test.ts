import { describe, expect, it } from 'vitest';
import { buildShareBar, buildShareText, copyShareText } from './share';

describe('buildShareText', () => {
  it('produces the three-line card', () => {
    const text = buildShareText({
      puzzleNumber: 12,
      score: 78,
      counts: { vaccinated: 4, quarantined: 7, untouched: 20, infected: 9 },
    });
    expect(text).toBe('Germle #12 · 78% saved\n🟦🟨🟨⬜⬜⬜⬜⬜🟥🟥\ngermle.com');
    expect(text.split('\n')[0]).toMatch(/^Germle #\d+ · \d+% saved$/);
  });
});

describe('buildShareBar', () => {
  it('always has ten squares in outcome order', () => {
    for (let infected = 0; infected <= 36; infected++) {
      for (let quarantined = 0; quarantined <= 36 - infected; quarantined += 3) {
        const counts = {
          vaccinated: 4,
          quarantined,
          untouched: 36 - infected - quarantined,
          infected,
        };
        const bar = buildShareBar(counts);
        expect(Array.from(bar)).toHaveLength(10);
        expect(bar).toMatch(/^🟦*🟨*⬜*🟥*$/u);
      }
    }
  });

  it('splits saved and infected squares the way the score rounds', () => {
    // 30 of 40 saved is 75%: 7.5 squares rounds up to 8 saved.
    const bar = buildShareBar({ vaccinated: 4, quarantined: 6, untouched: 20, infected: 10 });
    expect(Array.from(bar).filter((square) => square === '🟥')).toHaveLength(2);
  });

  it('handles an outbreak that infected everyone left', () => {
    expect(buildShareBar({ vaccinated: 4, quarantined: 0, untouched: 0, infected: 36 })).toBe(
      '🟦🟥🟥🟥🟥🟥🟥🟥🟥🟥',
    );
  });

  it('breaks equal remainders toward the earlier outcome', () => {
    // Quarantined 2/40 and untouched 34/40 both leave half a square over; quarantined wins.
    expect(buildShareBar({ vaccinated: 4, quarantined: 2, untouched: 34, infected: 0 })).toBe(
      '🟦🟨⬜⬜⬜⬜⬜⬜⬜⬜',
    );
  });
});

describe('copyShareText', () => {
  it('copies the text to the clipboard', async () => {
    const copied: string[] = [];
    const outcome = await copyShareText('hello', {
      writeText: (text) => {
        copied.push(text);
        return Promise.resolve();
      },
    });
    expect(outcome).toBe('copied');
    expect(copied).toEqual(['hello']);
  });

  it('asks for manual copying when the clipboard is missing or refuses', async () => {
    expect(await copyShareText('x', undefined)).toBe('manual');
    expect(await copyShareText('x', { writeText: () => Promise.reject(new Error('denied')) })).toBe(
      'manual',
    );
  });
});
