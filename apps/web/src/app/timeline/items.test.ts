import { describe, expect, it } from 'vitest';
import type { Message } from '../../matrix';
import { buildItems, dayLabel, linkify } from './items';

const base = new Date(2026, 10, 20, 9, 0).getTime();
const min = 60_000;
const person = (id: string) => ({ id, name: id });
const m = (id: string, who: string, ts: number): Message => ({ id, channelId: '!c', sender: person(who), body: id, ts, status: 'sent' });

describe('buildItems', () => {
  it('groups the same sender within five minutes and breaks on sender, gap and day', () => {
    const items = buildItems([
      m('a', 'jonas', base),
      m('b', 'jonas', base + 4 * min),
      m('c', 'jonas', base + 9 * min + 1),
      m('d', 'ingrid', base + 10 * min),
      m('e', 'ingrid', base + 24 * 60 * min),
    ]);
    expect(items.map((i) => (i.kind === 'day' ? 'day' : `${i.key}:${i.head ? 'head' : 'cont'}`))).toEqual([
      'day', 'a:head', 'b:cont', 'c:head', 'd:head', 'day', 'e:head',
    ]);
  });

  it('returns nothing for no messages', () => {
    expect(buildItems([])).toEqual([]);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 10, 20, 15, 0);
  const day = (d: number, y = 2026) => new Date(y, 10, d);

  it('uses Today, Yesterday, the weekday within a week, then the date', () => {
    expect(dayLabel(day(20), now)).toEqual({ key: 'today' });
    expect(dayLabel(day(19), now)).toEqual({ key: 'yesterday' });
    expect(dayLabel(day(16), now)).toEqual({ options: { weekday: 'long' } });
    expect(dayLabel(day(10), now)).toEqual({ options: { month: 'long', day: 'numeric' } });
    expect(dayLabel(day(10, 2025), now)).toEqual({ options: { year: 'numeric', month: 'long', day: 'numeric' } });
  });
});

describe('linkify', () => {
  it('links http(s) URLs and leaves the rest as text', () => {
    expect(linkify('See https://pasodrum.work/a?b=1, then http://x.no.')).toEqual([
      { text: 'See ' },
      { text: 'https://pasodrum.work/a?b=1', href: 'https://pasodrum.work/a?b=1' },
      { text: ', then ' },
      { text: 'http://x.no', href: 'http://x.no' },
      { text: '.' },
    ]);
  });

  it('keeps balanced parentheses, drops a closing one around the URL, and stops at Japanese text', () => {
    expect(linkify('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([
      { text: '(' },
      { text: 'https://en.wikipedia.org/wiki/Foo_(bar)', href: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
      { text: ')' },
    ]);
    expect(linkify('資料はhttps://pasodrum.work/docsにあります')).toEqual([
      { text: '資料は' },
      { text: 'https://pasodrum.work/docs', href: 'https://pasodrum.work/docs' },
      { text: 'にあります' },
    ]);
  });

  it('never links other schemes', () => {
    expect(linkify('javascript:alert(1) and https://')).toEqual([{ text: 'javascript:alert(1) and https://' }]);
  });
});
