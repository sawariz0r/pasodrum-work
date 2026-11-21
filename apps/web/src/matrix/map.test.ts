import { describe, expect, it } from 'vitest';
import {
  connectionOf, emailFromId, knownSpacesOf, loginCandidates, looksExternal, mediaOf, membershipSummary, reactionsOf, replyFallback, sameMembers, share, stripReplyFallback, threadStats, workspaceOf,
  type RoomFacts,
} from './map';

const room = (id: string, extra: Partial<RoomFacts> = {}): RoomFacts => ({
  id, name: id, joined: true, isSpace: false, otherType: false, clientSpace: false, joinRule: 'restricted',
  children: [], parents: [], unread: 0, mentions: 0, memberCount: 3, ...extra,
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

  it('carries colour and archived; archived client spaces sort last (D-28)', () => {
    const { spaces: sorted } = workspaceOf([
      room('!pasodrum', { name: 'Pasodrum', isSpace: true }),
      room('!acme', { name: 'Acme', isSpace: true, clientSpace: true, archived: true, colour: '#123456' }),
      room('!nordlys', { name: 'Nordlys', isSpace: true, clientSpace: true, colour: '#2F4A6D' }),
      room('!zeta', { name: 'Zeta', isSpace: true, clientSpace: true }),
    ]);
    expect(sorted).toEqual([
      { id: '!pasodrum', name: 'Pasodrum', kind: 'workspace' },
      { id: '!nordlys', name: 'Nordlys', kind: 'client', colour: '#2F4A6D' },
      { id: '!zeta', name: 'Zeta', kind: 'client' },
      { id: '!acme', name: 'Acme', kind: 'client', colour: '#123456', archived: true },
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

describe('workspaceOf for a guest (channels only, D-06)', () => {
  const rooms = [
    room('!design', { name: 'design', parents: ['!pasodrum'] }),
    room('!launch', { name: 'launch-site', joinRule: 'invite', parents: ['!pasodrum'] }),
    room('!dm', { name: 'Jonas' }),
    room('!board', { name: 'Roadmap', otherType: true, parents: ['!pasodrum'] }),
    room('!gone', { name: 'gone', joined: false, parents: ['!pasodrum'] }),
  ];

  it('groups joined channels under the space they belong to, named from account data', () => {
    const { spaces, channels } = workspaceOf(rooms, { '!pasodrum': { name: 'Pasodrum', kind: 'workspace' } });
    expect(spaces).toEqual([{ id: '!pasodrum', name: 'Pasodrum', kind: 'workspace' }]);
    expect(channels['!pasodrum']!.map((c) => [c.name, c.spaceId, c.private])).toEqual([['design', '!pasodrum', false], ['launch-site', '!pasodrum', true]]);
  });

  it('falls back to a channel name, never an ID, when nothing is known', () => {
    expect(workspaceOf(rooms).spaces).toEqual([{ id: '!pasodrum', name: 'design', kind: 'workspace' }]);
  });

  it('uses an unjoined space that lists the channel when the channel names no parent', () => {
    const { spaces, channels } = workspaceOf(
      [room('!q', { name: 'questions' }), room('!nordlys', { name: '', isSpace: true, joined: false, clientSpace: true, children: ['!q'] })],
      { '!nordlys': { name: 'Nordlys', kind: 'client' } },
    );
    expect(spaces).toEqual([{ id: '!nordlys', name: 'Nordlys', kind: 'client' }]);
    expect(channels['!nordlys']!.map((c) => c.id)).toEqual(['!q']);
  });

  it('leaves channels of my own spaces where they are', () => {
    const { spaces, channels } = workspaceOf([
      room('!pasodrum', { name: 'Pasodrum', isSpace: true, children: ['!general'] }),
      room('!general', { name: 'general', parents: ['!pasodrum'] }),
      room('!orphan', { name: 'orphan', parents: ['!pasodrum'] }),
      room('!listed', { name: 'listed', parents: ['!elsewhere'] }),
    ].map((r) => (r.id === '!pasodrum' ? { ...r, children: ['!general', '!listed'] } : r)));
    expect(spaces.map((sp) => sp.id)).toEqual(['!pasodrum']);
    expect(channels['!pasodrum']!.map((c) => c.id)).toEqual(['!general', '!listed']);
  });

  it('reads only well-formed account data', () => {
    expect(knownSpacesOf({ '!a': { name: 'A', kind: 'client' }, '!b': { name: 'B' }, '!c': { name: ' ' }, '!d': 'x' })).toEqual({
      '!a': { name: 'A', kind: 'client' },
      '!b': { name: 'B', kind: 'workspace' },
    });
    expect(knownSpacesOf(undefined)).toEqual({});
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

describe('mediaOf', () => {
  it('maps content and info; body is a caption only when it differs from the file name', () => {
    expect(mediaOf({ msgtype: 'm.image', body: 'a.png', url: 'mxc://s/a', info: { mimetype: 'image/png', size: 10, w: 640, h: 400, thumbnail_url: 'mxc://s/t' } })).toEqual({
      media: { ref: 'mxc://s/a', name: 'a.png', mimetype: 'image/png', size: 10, width: 640, height: 400, thumbnailRef: 'mxc://s/t' },
      caption: '',
    });
    expect(mediaOf({ msgtype: 'm.audio', body: 'listen', filename: 'clip.ogg', url: 'mxc://s/c', info: { duration: 1200 } })).toEqual({
      media: { ref: 'mxc://s/c', name: 'clip.ogg', durationMs: 1200 },
      caption: 'listen',
    });
    expect(mediaOf({ body: 'sticker', url: 'mxc://s/st', info: {} }, true)).toEqual({ media: { ref: 'mxc://s/st', name: 'sticker' }, caption: '' });
    expect(mediaOf({ msgtype: 'm.file', body: 'x', file: { url: 'mxc://enc' } })).toBeNull();
    expect(mediaOf({ msgtype: 'm.text', body: 'x', url: 'mxc://s/a' })).toBeNull();
  });
});

describe('reply fallbacks', () => {
  it('strips an Element-style fallback and keeps the quote', () => {
    expect(stripReplyFallback('> <@a:s> first\n> second\n\nreply\nmore')).toEqual({ body: 'reply\nmore', quote: { senderId: '@a:s', body: 'first\nsecond' } });
    expect(stripReplyFallback('> <@a:s> sent an image.\n\nnice')).toEqual({ body: 'nice', quote: { senderId: '@a:s', body: 'sent an image.' } });
    expect(stripReplyFallback('plain > text')).toEqual({ body: 'plain > text' });
  });

  it('builds a fallback that round-trips', () => {
    const fb = replyFallback({ roomId: '!r:s', eventId: '$e', senderId: '@a:s', body: 'one\ntwo <3' });
    expect(fb.body).toBe('> <@a:s> one\n> two <3\n\n');
    expect(fb.html).toBe(
      '<mx-reply><blockquote><a href="https://matrix.to/#/!r:s/$e">In reply to</a> <a href="https://matrix.to/#/@a:s">@a:s</a><br>one<br>two &lt;3</blockquote></mx-reply>',
    );
    expect(stripReplyFallback(fb.body + 'reply')).toEqual({ body: 'reply', quote: { senderId: '@a:s', body: 'one\ntwo <3' } });
  });
});

describe('reactionsOf', () => {
  const a = { id: '@a:s', name: 'A' };
  const b = { id: '@b:s', name: 'B' };
  it('groups by key in first-reacted order, one per sender', () => {
    expect(
      reactionsOf(
        [
          { key: '👍', sender: b, ts: 3 },
          { key: '🎉', sender: a, ts: 1 },
          { key: '👍', sender: a, ts: 2 },
          { key: '👍', sender: a, ts: 4 },
        ],
        '@a:s',
      ),
    ).toEqual([
      { key: '🎉', count: 1, mine: true, senders: [a] },
      { key: '👍', count: 2, mine: true, senders: [a, b] },
    ]);
    expect(reactionsOf([{ key: 'ok', sender: b, ts: 1 }], '@a:s')).toEqual([{ key: 'ok', count: 1, mine: false, senders: [b] }]);
  });
});

describe('membershipSummary', () => {
  const p = (id: string) => ({ id, name: id.toUpperCase() });
  it('nets joins and leaves per person; profile changes and invites drop out', () => {
    expect(
      membershipSummary([
        { person: p('a'), prev: 'invite', next: 'join' },
        { person: p('b'), next: 'join' },
        { person: p('c'), prev: 'join', next: 'leave' },
        { person: p('d'), prev: 'join', next: 'join' },
        { person: p('e'), next: 'invite' },
        { person: p('f'), next: 'join' },
        { person: p('f'), prev: 'join', next: 'leave' },
        { person: p('g'), prev: 'join', next: 'ban' },
      ]),
    ).toEqual({ joined: [p('a'), p('b')], left: [p('c'), p('g')] });
    expect(membershipSummary([{ person: p('d'), prev: 'join', next: 'join' }])).toBeNull();
  });
});

describe('emailFromId and looksExternal (D-07)', () => {
  it('turns deterministic IDs back into emails; plain local parts use the server', () => {
    expect(emailFromId('@henrik_nordlys.no:pasodrum.work')).toBe('henrik@nordlys.no');
    expect(emailFromId('@anne_marie_acme.co.uk:pasodrum.work')).toBe('anne_marie@acme.co.uk');
    expect(emailFromId('@jonas:pasodrum.work')).toBe('jonas@pasodrum.work');
    expect(emailFromId('@first_last:pasodrum.work')).toBe('first_last@pasodrum.work');
    expect(looksExternal('@lea_freelance.dev:pasodrum.work')).toBe(true);
    expect(looksExternal('@first_last:pasodrum.work')).toBe(false);
  });
});

describe('threadStats', () => {
  const r = (id: string, ts: number, sender = '@a:s') => ({ id, ts, sender });
  it('adds replies seen after the bundled summary to its count', () => {
    expect(threadStats({ count: 5, latest: r('$5', 50, '@b:s') }, [r('$5', 50, '@b:s'), r('$6', 60)], false)).toEqual({
      count: 6, lastTs: 60, latest: r('$6', 60), participants: ['@a:s', '@b:s'],
    });
  });
  it('counts exactly when the thread is fully loaded, and is null without replies', () => {
    expect(threadStats({ count: 9, latest: r('$2', 20) }, [r('$1', 10), r('$2', 20)], true)?.count).toBe(2);
    expect(threadStats(undefined, [r('$1', 10, '@b:s')], false)).toMatchObject({ count: 1, participants: ['@b:s'] });
    expect(threadStats(undefined, [], false)).toBeNull();
  });
});

describe('sameMembers', () => {
  it('ignores order and duplicates', () => {
    expect(sameMembers(['@a:s', '@b:s'], ['@b:s', '@a:s', '@a:s'])).toBe(true);
    expect(sameMembers(['@a:s'], ['@a:s', '@b:s'])).toBe(false);
  });
});
