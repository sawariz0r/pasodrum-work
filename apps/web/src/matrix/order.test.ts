import { describe, expect, it } from 'vitest';
import { keyBetween, orderAmong, sortIssues, wouldCycle } from './order';

describe('order keys', () => {
  it('a key sorts between its neighbours and at either end', () => {
    const a = keyBetween();
    const b = keyBetween(a);
    const mid = keyBetween(a, b);
    const first = keyBetween(undefined, a);
    expect([first, a, mid, b].slice().sort()).toEqual([first, a, mid, b]);
  });

  it('two neighbours with the same key (concurrent moves): just after them, before the next distinct key', () => {
    const a = keyBetween();
    const c = keyBetween(a);
    const k = keyBetween(a, a, c);
    expect(k > a && k < c).toBe(true);
    expect(keyBetween(c, c) > c).toBe(true);
    const list = [
      { id: 'x', order: a },
      { id: 'y', order: a },
      { id: 'z', order: c },
    ];
    const between = orderAmong(list, { before: 'x', after: 'y' });
    expect(between > a && between < c).toBe(true);
  });

  it('orderAmong places after a neighbour, before one, or last', () => {
    const a = keyBetween();
    const b = keyBetween(a);
    const list = [
      { id: 'b', order: b },
      { id: 'a', order: a },
    ];
    const placed = (to: { before?: string; after?: string }) => sortIssues([...list, { id: 'new', order: orderAmong(list, to) }]).map((x) => x.id);
    expect(placed({ before: 'a' })).toEqual(['a', 'new', 'b']);
    expect(placed({ after: 'a' })).toEqual(['new', 'a', 'b']);
    expect(placed({})).toEqual(['a', 'b', 'new']);
    expect(sortIssues([{ id: 'n', order: orderAmong([], {}) }])).toHaveLength(1);
  });

  it('sorts by (order, id)', () => {
    expect(sortIssues([{ id: '$b', order: 'a1' }, { id: '$a', order: 'a1' }, { id: '$c', order: 'a0' }]).map((x) => x.id)).toEqual(['$c', '$a', '$b']);
  });

  it('wouldCycle rejects a drop into the page’s own subtree', () => {
    const parents = { child: 'root', grand: 'child', other: undefined };
    expect(wouldCycle(parents, 'root', 'grand')).toBe(true);
    expect(wouldCycle(parents, 'root', 'root')).toBe(true);
    expect(wouldCycle(parents, 'grand', 'other')).toBe(false);
    expect(wouldCycle(parents, 'child', undefined)).toBe(false);
  });
});
