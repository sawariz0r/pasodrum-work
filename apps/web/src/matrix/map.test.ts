import { describe, expect, it } from 'vitest';
import { connectionOf, loginCandidates, mediaOf, membershipSummary, reactionsOf, replyFallback, share, stripReplyFallback, workspaceOf, type RoomFacts } from './map';

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
