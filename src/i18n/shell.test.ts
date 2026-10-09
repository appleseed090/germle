import { describe, expect, it } from 'vitest';
import aboutHtml from '../../about.html?raw';
import archiveHtml from '../../archive.html?raw';
import dailyHtml from '../../index.html?raw';
import practiceHtml from '../../practice.html?raw';
import { parseShellTranslation } from './shell';
import { zhHans } from './zh-hans';
import { zhHant } from './zh-hant';

const SHELLS = { dailyHtml, practiceHtml, archiveHtml, aboutHtml };
const TRANSLATIONS = { zhHans: zhHans.shell ?? {}, zhHant: zhHant.shell ?? {} };

function shellKeys(): Set<string> {
  const keys = new Set<string>();
  for (const html of Object.values(SHELLS)) {
    for (const [, key] of html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)) keys.add(key ?? '');
  }
  return keys;
}

describe('parseShellTranslation', () => {
  it('splits text from the child elements it places', () => {
    expect(parseShellTranslation('可以在<a>往期谜题</a>里补玩。')).toEqual([
      { kind: 'text', text: '可以在' },
      { kind: 'element', tagName: 'a', text: '往期谜题' },
      { kind: 'text', text: '里补玩。' },
    ]);
    expect(parseShellTranslation('<span></span>已接种 <strong></strong>')).toEqual([
      { kind: 'element', tagName: 'span', text: '' },
      { kind: 'text', text: '已接种 ' },
      { kind: 'element', tagName: 'strong', text: '' },
    ]);
    expect(parseShellTranslation('设置')).toEqual([{ kind: 'text', text: '设置' }]);
  });

  it('rejects any other markup', () => {
    for (const malformed of [
      '<a>open',
      '<a><b>x</b></a>',
      '<a>x</b>',
      'a < b',
      '<a href="/">x</a>',
    ])
      expect(() => parseShellTranslation(malformed), malformed).toThrow(/Malformed/);
  });
});

describe('the shell translations', () => {
  it('translate exactly the keys the page shells use, in every language', () => {
    const keys = [...shellKeys()].sort();
    for (const [language, translations] of Object.entries(TRANSLATIONS))
      expect(Object.keys(translations).sort(), language).toEqual(keys);
  });

  it('all parse', () => {
    for (const translations of Object.values(TRANSLATIONS)) {
      for (const translation of Object.values(translations))
        expect(() => parseShellTranslation(translation)).not.toThrow();
    }
  });
});
