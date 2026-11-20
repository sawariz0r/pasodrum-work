import { describe, expect, it } from 'vitest';
import type { Message } from '../../matrix';
import { buildItems, dayLabel, linkify } from './items';

const base = new Date(2026, 10, 20, 9, 0).getTime();
const min = 60_000;
const person = (id: string) => ({ id, name: id });
const m = (id: string, who: string, ts: number): Message => ({ id, channelId: '!c', sender: person(who), body: id, ts, status: 'sent' });

const show = (i: ReturnType<typeof buildItems>[number]) =>
  i.kind === 'message' ? `${i.key}:${i.head ? 'head' : 'cont'}${i.group ? `[${i.group.map((g) => g.id).join(',')}]` : ''}` : i.kind;
const media = (id: string, who: string, ts: number, kind: 'image' | 'file', body = ''): Message => ({
  ...m(id, who, ts), body, kind, media: { ref: `mxc://x/${id}`, name: `${id}.png` },
});

describe('buildItems', () => {
  it('joins consecutive images (and files) from one sender without a caption into one row', () => {
    const items = buildItems([
      m('t', 'ingrid', base),
      media('i1', 'ingrid', base + min, 'image'),
      media('i2', 'ingrid', base + min, 'image'),
      media('i3', 'ingrid', base + min, 'image', 'look at this'),
      media('f1', 'ingrid', base + 2 * min, 'file'),
      media('f2', 'ingrid', base + 2 * min, 'file'),
      media('i4', 'jonas', base + 3 * min, 'image'),
    ]);
    expect(items.map(show)).toEqual(['day', 't:head', 'i1:cont[i1,i2]', 'i3:cont', 'f1:cont[f1,f2]', 'i4:head']);
  });

  it('puts the New line above the first unread and starts a new group there; deleted and system rows stand alone', () => {
    const items = buildItems(
      [
        m('a', 'jonas', base),
        { ...m('b', 'jonas', base + min), kind: 'deleted', body: '' },
        m('c', 'jonas', base + 2 * min),
        m('d', 'jonas', base + 3 * min),
      ],
      'd',
    );
    expect(items.map(show)).toEqual(['day', 'a:head', 'b:head', 'c:head', 'new', 'd:head']);
  });

  it('groups the same sender within five minutes and breaks on sender, gap and day', () => {
    const items = buildItems([
      m('a', 'jonas', base),
      m('b', 'jonas', base + 4 * min),
      m('c', 'jonas', base + 9 * min + 1),
      m('d', 'ingrid', base + 10 * min),
      m('e', 'ingrid', base + 24 * 60 * min),
    ]);
    expect(items.map(show)).toEqual([
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
