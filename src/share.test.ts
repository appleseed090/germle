import { describe, expect, it } from 'vitest';
import { buildShareBar, buildShareText, shareOrCopy } from './share';

describe('buildShareText', () => {
  it('produces the three-line card', () => {
    const text = buildShareText({
      puzzleNumber: 12,
      score: 78,
      counts: { vaccinated: 4, quarantined: 7, untouched: 20, infected: 9 },
    });
    expect(text).toBe('Germle #12 · 78% saved\n▣▨▨□□□□□■■\ngermle.com');
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
        expect(bar).toMatch(/^▣*▨*□*■*$/u);
      }
    }
  });

  it('splits saved and infected squares the way the score rounds', () => {
    // 30 of 40 saved is 75%: 7.5 squares rounds up to 8 saved.
    const bar = buildShareBar({ vaccinated: 4, quarantined: 6, untouched: 20, infected: 10 });
    expect(Array.from(bar).filter((square) => square === '■')).toHaveLength(2);
  });

  it('handles an outbreak that infected everyone left', () => {
    expect(buildShareBar({ vaccinated: 4, quarantined: 0, untouched: 0, infected: 36 })).toBe(
      '▣■■■■■■■■■',
    );
  });

  it('breaks equal remainders toward the earlier outcome', () => {
    // Quarantined 2/40 and untouched 34/40 both leave half a square over; quarantined wins.
    expect(buildShareBar({ vaccinated: 4, quarantined: 2, untouched: 34, infected: 0 })).toBe(
      '▣▨□□□□□□□□',
    );
  });
});

describe('shareOrCopy', () => {
  it('uses the share sheet when available', async () => {
    const shared: string[] = [];
    const outcome = await shareOrCopy('hello', {
      share: (data) => {
        shared.push(data.text ?? '');
        return Promise.resolve();
      },
    });
    expect(outcome).toBe('shared');
    expect(shared).toEqual(['hello']);
  });

  it('reports a dismissed share sheet without copying', async () => {
    let copied = false;
    const outcome = await shareOrCopy('hello', {
      share: () => Promise.reject(new DOMException('dismissed', 'AbortError')),
      clipboard: {
        writeText: () => {
          copied = true;
          return Promise.resolve();
        },
      },
    });
    expect(outcome).toBe('cancelled');
    expect(copied).toBe(false);
  });

  it('falls back to the clipboard when sharing fails, and to manual copy when that fails', async () => {
    const failingShare = (): Promise<void> =>
      Promise.reject(new DOMException('nope', 'NotAllowedError'));
    expect(
      await shareOrCopy('x', {
        share: failingShare,
        clipboard: { writeText: () => Promise.resolve() },
      }),
    ).toBe('copied');
    expect(
      await shareOrCopy('x', {
        clipboard: { writeText: () => Promise.reject(new Error('denied')) },
      }),
    ).toBe('manual');
    expect(await shareOrCopy('x', {})).toBe('manual');
  });
});
