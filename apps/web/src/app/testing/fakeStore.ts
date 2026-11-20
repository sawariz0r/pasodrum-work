// In-memory WorkspaceStore with the canvas workspace, for tests and /dev screens. No server.
import type { Channel, ConnectionState, Message, Person, Space, Timeline, WorkspaceSnapshot, WorkspaceStore } from '../../matrix';

const people: Record<string, Person> = {
  so: { id: '@sofia:pasodrum.localhost', name: 'Sofia Olsen' },
  ih: { id: '@ingrid:pasodrum.localhost', name: 'Ingrid Holm' },
  jb: { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' },
  ty: { id: '@tanaka:pasodrum.localhost', name: '田中 由紀' },
};

const spaces: Space[] = [
  { id: '!pasodrum', name: 'Pasodrum', kind: 'workspace' },
  { id: '!nordlys', name: 'Nordlys', kind: 'client' },
];

const ch = (id: string, spaceId: string, name: string, extra: Partial<Channel> = {}): Channel => ({
  id, spaceId, name, private: false, unread: 0, mentions: 0, memberCount: 4, ...extra,
});

const channels: Record<string, Channel[]> = {
  '!pasodrum': [
    ch('!design', '!pasodrum', 'design'),
    ch('!eng', '!pasodrum', 'eng', { unread: 3 }),
    ch('!general', '!pasodrum', 'general'),
    ch('!lead', '!pasodrum', 'lead', { private: true, unread: 2, mentions: 2, memberCount: 2 }),
  ],
  '!nordlys': [
    ch('!project-updates', '!nordlys', 'project-updates', { memberCount: 3 }),
    ch('!questions', '!nordlys', 'questions', { memberCount: 3 }),
  ],
};

const t0 = Date.UTC(2026, 10, 20, 8, 0);
const msg = (n: number, channelId: string, who: keyof typeof people, body: string, minutes: number): Message => ({
  id: `$${channelId}-${n}`, channelId, sender: people[who]!, body, ts: t0 + minutes * 60_000, status: 'sent',
});

const history: Record<string, Message[]> = {
  '!general': [
    msg(1, '!general', 'jb', 'Nordlys review moved to Thursday 14:00.', 74),
    msg(2, '!general', 'jb', 'Agenda in the doc.', 75),
    msg(3, '!general', 'ty', 'これはテストです。木曜日のレビューに参加します。', 80),
    msg(4, '!general', 'ih', 'Board and shared docs for them, nothing internal.', 86),
  ],
};

export interface FakeStoreOptions {
  connection?: ConnectionState;
  me?: Person;
  /** Delay before timelines finish loading; 0 = instant. */
  loadMs?: number;
}

export function createFakeStore(opts: FakeStoreOptions = {}): WorkspaceStore & { set(patch: Partial<WorkspaceSnapshot>): void } {
  let snapshot: WorkspaceSnapshot = {
    me: opts.me ?? people.so!,
    connection: opts.connection ?? 'online',
    spaces,
    channels,
    timelines: {},
    sessionExpired: false,
  };
  const listeners = new Set<() => void>();
  let localId = 0;

  const set = (patch: Partial<WorkspaceSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  };
  const setTimeline = (channelId: string, next: Partial<Timeline>) => {
    const prev = snapshot.timelines[channelId] ?? { messages: [], initialLoading: false, loadingOlder: false, hasOlder: false };
    set({ timelines: { ...snapshot.timelines, [channelId]: { ...prev, ...next } } });
  };
  const messagesOf = (channelId: string) => snapshot.timelines[channelId]?.messages ?? [];
  const finishLoad = (channelId: string) => setTimeline(channelId, { messages: history[channelId] ?? [], initialLoading: false });

  return {
    set,
    getSnapshot: () => snapshot,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    openTimeline(channelId) {
      if (snapshot.timelines[channelId]) return;
      setTimeline(channelId, { initialLoading: true });
      if (opts.loadMs) setTimeout(() => finishLoad(channelId), opts.loadMs);
      else finishLoad(channelId);
    },
    loadOlder(channelId) {
      setTimeline(channelId, { hasOlder: false });
    },
    sendText(channelId, body) {
      const m: Message = { id: `~local${localId++}`, channelId, sender: snapshot.me, body, ts: Date.now(), status: 'sending' };
      setTimeline(channelId, { messages: [...messagesOf(channelId), m] });
      setTimeout(() => {
        setTimeline(channelId, {
          messages: messagesOf(channelId).map((x) => (x.id === m.id ? { ...x, status: body.includes('fail') ? 'failed' : 'sent' } : x)),
        });
      }, 300);
    },
    retry(channelId, messageId) {
      setTimeline(channelId, { messages: messagesOf(channelId).map((x) => (x.id === messageId ? { ...x, status: 'sent' } : x)) });
    },
    discard(channelId, messageId) {
      setTimeline(channelId, { messages: messagesOf(channelId).filter((x) => x.id !== messageId) });
    },
    markRead(channelId) {
      const list = snapshot.channels;
      const next = Object.fromEntries(
        Object.entries(list).map(([space, chans]) => [space, chans.map((c) => (c.id === channelId ? { ...c, unread: 0, mentions: 0 } : c))]),
      );
      set({ channels: next });
    },
    reconnectNow() {
      set({ connection: 'online' });
    },
    async signOut() {},
  };
}
