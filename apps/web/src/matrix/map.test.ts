import { describe, expect, it } from 'vitest';
import { connectionOf, loginCandidates, share, workspaceOf, type RoomFacts } from './map';

const room = (id: string, extra: Partial<RoomFacts> = {}): RoomFacts => ({
  id, name: id, joined: true, isSpace: false, otherType: false, clientSpace: false, joinRule: 'restricted',
  children: [], unread: 0, mentions: 0, memberCount: 3, ...extra,
});

describe('loginCandidates (D-19)', () => {
  it('passes a username through', () => {
    expect(loginCandidates(' Jonas ')).toEqual([{ type: 'm.id.user', user: 'jonas' }]);
    expect(loginCandidates('@jonas:pasodrum.work')).toEqual([{ type: 'm.id.user', user: '@jonas:pasodrum.work' }]);
  });

  it('tries bound email, own-server local part, then the deterministic ID', () => {
    expect(loginCandidates('Henrik@Nordlys.no')).toEqual([
      { type: 'm.id.thirdparty', medium: 'email', address: 'henrik@nordlys.no' },
      { type: 'm.id.user', user: '@henrik:nordlys.no' },
      { type: 'm.id.user', user: 'henrik_nordlys.no' },
    ]);
  });
});

describe('workspaceOf', () => {
  const rooms = [
    room('!nordlys', { name: 'Nordlys', isSpace: true, clientSpace: true, children: ['!questions', '!updates'] }),
    room('!acme', { name: 'Acme', isSpace: true, clientSpace: true, children: [] }),
    room('!pasodrum', { name: 'Pasodrum', isSpace: true, children: ['!general', '!lead', '!design', '!board', '!left', '!missing'] }),
    room('!general', { name: 'general', topic: 'All hands', unread: 2, mentions: 1 }),
    room('!design', { name: 'design' }),
    room('!lead', { name: 'lead', joinRule: 'invite' }),
    room('!board', { name: 'Roadmap', otherType: true }),
    room('!left', { name: 'old', joined: false }),
    room('!questions', { name: 'questions' }),
    room('!updates', { name: 'project-updates', joinRule: 'public' }),
    room('!unjoined-space', { name: 'Other', isSpace: true, joined: false }),
  ];
  const { spaces, channels } = workspaceOf(rooms);

  it('puts the workspace first, then client spaces by name', () => {
    expect(spaces).toEqual([
      { id: '!pasodrum', name: 'Pasodrum', kind: 'workspace' },
      { id: '!acme', name: 'Acme', kind: 'client' },
      { id: '!nordlys', name: 'Nordlys', kind: 'client' },
    ]);
  });

  it('lists joined plain children by name; private unless restricted or public', () => {
    expect(channels['!pasodrum']!.map((c) => [c.name, c.private])).toEqual([['design', false], ['general', false], ['lead', true]]);
    expect(channels['!nordlys']!.map((c) => [c.name, c.private])).toEqual([['project-updates', false], ['questions', false]]);
    expect(channels['!acme']).toEqual([]);
    expect(channels['!pasodrum']![1]).toMatchObject({ spaceId: '!pasodrum', topic: 'All hands', unread: 2, mentions: 1, memberCount: 3 });
    expect(channels['!pasodrum']![0]).not.toHaveProperty('topic');
  });
});

describe('share', () => {
  it('keeps identity of unchanged parts', () => {
    const prev = { a: [{ x: 1 }, { x: 2 }], b: { y: 'k' }, c: 1 };
    const next = { a: [{ x: 1 }, { x: 3 }], b: { y: 'k' }, c: 1 };
    const out = share(prev, next);
    expect(out).toEqual(next);
    expect(out).not.toBe(prev);
    expect(out.b).toBe(prev.b);
    expect(out.a[0]).toBe(prev.a[0]);
    expect(out.a[1]).not.toBe(prev.a[1]);
    expect(share(prev, structuredClone(prev))).toBe(prev);
  });

  it('notices removed keys and shorter arrays', () => {
    const prev = { a: 1, b: 2, list: [1, 2] };
    expect(share(prev, { a: 1, list: [1, 2] } as typeof prev)).not.toBe(prev);
    expect(share(prev, { ...prev, list: [1] })).not.toBe(prev);
  });
});

describe('connectionOf', () => {
  it('maps sync states', () => {
    expect(connectionOf(null, false)).toBe('starting');
    expect(connectionOf('RECONNECTING', false)).toBe('starting');
    expect(connectionOf('PREPARED', true)).toBe('online');
    expect(connectionOf('SYNCING', true)).toBe('online');
    expect(connectionOf('RECONNECTING', true)).toBe('reconnecting');
    expect(connectionOf('CATCHUP', true)).toBe('reconnecting');
    expect(connectionOf('ERROR', true)).toBe('offline');
    expect(connectionOf('ERROR', false)).toBe('offline');
  });
});
