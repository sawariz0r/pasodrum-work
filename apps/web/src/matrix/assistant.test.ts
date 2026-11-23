// SIDE-14 §5.2: what the browser hands the server for a find is refs only, never message text, and never from an encrypted conversation.
import { describe, expect, it, vi } from 'vitest';
import { createFakeStore } from '../app/testing/fakeStore';
import { findRefs, refsOfHits } from './assistant';
import type { Message, SearchHit } from './types';

const hit = (id: string, channelId: string, ts: number, body = `secret text ${id}`): SearchHit => ({
  message: { id, channelId, sender: { id: '@a:x', name: 'A' }, body, html: `<b>${body}</b>`, ts, status: 'sent' } as Message,
});

describe('assistant find', () => {
  it('turns hits into message refs, newest first, each once, at most 20, no text', () => {
    const hits = [hit('$1', '!a', 1), hit('$3', '!b', 3), hit('$2', '!a', 2), hit('$3', '!b', 3)];
    const refs = refsOfHits(hits, () => false);
    expect(refs).toEqual([
      { k: 'message', room: '!b', event: '$3' },
      { k: 'message', room: '!a', event: '$2' },
      { k: 'message', room: '!a', event: '$1' },
    ]);
    expect(JSON.stringify(refs)).not.toContain('secret');
    const many = Array.from({ length: 30 }, (_, i) => hit(`$${i}`, '!a', i));
    expect(refsOfHits(many, () => false)).toHaveLength(20);
  });

  it('never returns hits from encrypted conversations', () => {
    const refs = refsOfHits([hit('$1', '!sealed', 5), hit('$2', '!plain', 1)], (room) => room === '!sealed');
    expect(refs).toEqual([{ k: 'message', room: '!plain', event: '$2' }]);
  });

  it('runs the local search, skips encrypted conversations and limits to the given places', async () => {
    const store = createFakeStore();
    const snap = store.getSnapshot();
    const sealed = new Set([...Object.values(snap.channels).flat().filter((c) => c.encrypted).map((c) => c.id), ...snap.dms.filter((d) => d.encrypted).map((d) => d.id)]);
    expect(sealed.size).toBeGreaterThan(0);
    const everywhere = await findRefs(store.search, snap, 'e', null);
    expect(everywhere.length).toBeGreaterThan(0);
    expect(everywhere.length).toBeLessThanOrEqual(20);
    expect(everywhere.every((r) => r.k === 'message' && !sealed.has(r.room))).toBe(true);
    const inGeneral = await findRefs(store.search, snap, 'e', [{ k: 'place', room: '!general' }]);
    expect(inGeneral.length).toBeGreaterThan(0);
    expect(inGeneral.every((r) => r.k === 'message' && r.room === '!general')).toBe(true);
    const search = vi.fn(store.search);
    expect(await findRefs(search, snap, 'e', [{ k: 'page', page: '!p' }])).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });
});
