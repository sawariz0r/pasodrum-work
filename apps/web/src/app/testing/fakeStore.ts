// In-memory WorkspaceStore with the canvas workspace, for tests and /dev screens. No server.
import type { Channel, ConnectionState, Media, Message, Person, Reaction, Space, Timeline, Upload, WorkspaceSnapshot, WorkspaceStore } from '../../matrix';

const people: Record<string, Person> = {
  so: { id: '@sofia:pasodrum.localhost', name: 'Sofia Olsen' },
  ih: { id: '@ingrid:pasodrum.localhost', name: 'Ingrid Holm' },
  jb: { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' },
  ty: { id: '@tanaka:pasodrum.localhost', name: '田中 由紀' },
  ml: { id: '@maja:pasodrum.localhost', name: 'Maja Lind' },
  ek: { id: '@erik:pasodrum.localhost', name: 'Erik Kvam' },
  la: { id: '@lea:pasodrum.localhost', name: 'Lea Aune' },
  tr: { id: '@tove:pasodrum.localhost', name: 'Tove Rask' },
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

const at = (daysAgo: number, h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
let seq = 0;
const rich = (channelId: string, who: keyof typeof people, ts: number, extra: Partial<Message>): Message => ({
  id: `$${channelId}-r${seq++}`, channelId, sender: people[who]!, body: '', ts, status: 'sent', ...extra,
});
const media = (ref: string, name: string, extra: Partial<Media> = {}): Media => ({ ref: `mxc://fake/${ref}`, name, ...extra });
const reacted = (key: string, who: (keyof typeof people)[], more = 0): Reaction => ({
  key, count: who.length + more, mine: who.includes('so'), senders: who.map((k) => people[k]!),
});
const pill = (k: keyof typeof people) => `<a href="https://matrix.to/#/${people[k]!.id}" data-mention="${people[k]!.id}">${people[k]!.name}</a>`;

const code = "export function isImeEnter(e: KeyboardEvent) {\n  if (e.key !== 'Enter') return false;\n  return !e.isComposing && e.keyCode !== 229;\n}";
const releaseItems = [
  'Sign in with a work email or a username', 'Workspace and client spaces on the rail', 'Channels with unread and mention counts',
  'Timeline, day dividers and the plain-text composer', 'English and Japanese, light and dark', 'Offline, reconnecting and back-online banners',
  'Sending and not-sent states with retry',
];
const release = [
  '<p><strong>M1 release notes</strong></p>',
  '<p>The walking skeleton is live at <a href="https://pasodrum.work">pasodrum.work</a>. Here is everything that changed since the last build, so nobody has to dig through the board.</p>',
  `<ul>${releaseItems.map((x) => `<li>${x}</li>`).join('')}</ul>`,
  '<p>Not in yet: attachments, reactions, threads. Those land in M2 and M3.</p>',
  '<p>Tested on Chrome and Safari on macOS, plus Japanese IME. The Element X smoke test on production passed on Tuesday.</p>',
  '<p>Next up is M2, the full timeline. Designs are in review this week.</p>',
  '<p>Known issues: the drawer under 1000 px keeps its scroll position, and the language switch needs a reload in Safari.</p>',
  '<p>Thanks everyone for testing on short notice.</p>',
  '<p>Questions in this channel, bugs on the board.</p>',
].join('');

const q1 = 'Open question: should guests see messages from before they joined?';
const a1 = 'Only when the channel is shared with them from day one. Otherwise they start fresh.';

function generalHistory(): Message[] {
  const g = '!general';
  const list: Message[] = [];
  const add = (who: keyof typeof people, ts: number, extra: Partial<Message>) => {
    const m = rich(g, who, ts, extra);
    list.push(m);
    return m;
  };
  add('ih', at(1, 16, 42), { body: 'Pushed onboarding v3 to Figma. Biggest change: we never ask people for a server address anymore. Their work email decides where they land.' });
  add('ih', at(1, 16, 50), { kind: 'system', system: { joined: [people.ml!, people.la!, people.ek!], left: [] } });
  list.push({ ...msg(1, g, 'jb', 'Nordlys review moved to Thursday 14:00.', 0), ts: at(0, 9, 14), reactions: [reacted('👍', ['so', 'ih', 'ml']), reacted('🙌', ['ek'])] });
  list.push({ ...msg(2, g, 'jb', 'Agenda in the doc.', 0), ts: at(0, 9, 14) });
  const q = add('jb', at(0, 9, 15), { body: q1 });
  const a = add('ih', at(0, 9, 20), { body: a1, replyTo: { id: q.id, sender: q.sender, body: q1, found: true } });
  add('tr', at(0, 9, 34), { body: 'Same on my phone: 1.3 s.', replyTo: { id: '$elsewhere', sender: people.ek, body: 'Staging is green. Cold start for the desktop app is down to 1.2 s after the sync rewrite.', found: false } });
  add('so', at(0, 9, 40), { body: 'Agreed. I’ll put it in the spec.', replyTo: { id: a.id, sender: a.sender, body: a1, found: true } });
  list.push({ ...msg(3, g, 'ty', 'これはテストです。木曜日のレビューに参加します。', 0), ts: at(0, 9, 44), edited: true });
  add('ty', at(0, 9, 45), { kind: 'deleted' });
  add('tr', at(0, 9, 46), { kind: 'unsupported', body: 'Where should the offsite be? Oslo, Bergen, Tromsø' });
  add('ek', at(0, 9, 47), { kind: 'unsupported' });
  list.push({ ...msg(4, g, 'ih', 'Board and shared docs for them, nothing internal.', 0), ts: at(0, 9, 50) });
  add('ih', at(0, 9, 52), {
    body: 'Sofia Olsen can you take a pass on the empty states for the channel list? The current ones feel loud.',
    html: `${pill('so')} can you take a pass on the empty states for the channel list? The current ones feel loud.`,
    mentionsMe: true,
  });
  add('ih', at(0, 9, 52), { kind: 'image', media: media('screen', 'empty-states.png', { width: 640, height: 400 }) });
  add('ml', at(0, 10, 2), {
    body: 'Composer rules, final version: …',
    html: '<p>Composer rules, <strong>final</strong> version:</p><ol><li><strong>Enter</strong> sends, <code>Shift</code> + <code>Enter</code> adds a line</li><li>Paste a URL over selected text to make it a link</li><li>Drafts stay <del>in the cloud</del> <em>on this device</em></li></ol><blockquote>One line of copy, one clear action.</blockquote><p>Details in <a href="https://pasodrum.work/spec/composer">pasodrum.work/spec/composer</a></p>',
  });
  add('ek', at(0, 10, 10), {
    body: 'Fix for the isImeEnter() guard. Safari sends one more Enter right after composition:',
    html: `<p>Fix for the <code>isImeEnter()</code> guard. Safari sends one more Enter right after composition:</p><pre><code>${code.replace(/</g, '&lt;')}</code></pre>`,
  });
  add('ih', at(0, 10, 20), { body: 'Photos from the Nordlys workshop.' });
  for (const [ref, name] of [['wall', 'wall.jpg'], ['team', 'team.jpg'], ['sketch', 'sketch.jpg'], ['desk', 'desk.jpg'], ['screen', 'screen.jpg'], ['header', 'header.jpg']]) {
    add('ih', at(0, 10, 20), { kind: 'image', media: media(ref!, name!, { width: 1200, height: 800 }) });
  }
  add('ml', at(0, 10, 32), { body: 'Final crop for the header:' });
  add('ml', at(0, 10, 32), { kind: 'image', media: media('header', 'header-final.jpg', { width: 1440, height: 808 }) });
  add('ek', at(0, 10, 40), { body: 'Cold start after the sync rewrite, screen recording:' });
  add('ek', at(0, 10, 40), { kind: 'video', media: media('rec', 'cold-start.mov', { width: 1280, height: 720, durationMs: 42_000, thumbnailRef: 'mxc://fake/screen' }) });
  add('la', at(0, 10, 52), { body: 'Henrik’s interview, for the research notes.' });
  add('la', at(0, 10, 52), { kind: 'audio', media: media('interview', 'nordlys-interview-03.m4a', { durationMs: 728_000, mimetype: 'audio/mp4' }) });
  add('ih', at(0, 11, 1), { body: 'Signed contract from Nordlys.' });
  add('ih', at(0, 11, 1), { kind: 'file', media: media('contract', 'Nordlys-contract-signed.pdf', { size: 2_400_000 }) });
  add('jb', at(0, 11, 10), { body: 'Everything for Thursday:' });
  for (const [name, size] of [['agenda-thursday.docx', 86_000], ['budget-2027.xlsx', 312_000], ['nordlys-kickoff.key', 18_200_000], ['brand-assets.zip', 64_900_000]] as const) {
    add('jb', at(0, 11, 10), { kind: 'file', media: media(name, name, { size }) });
  }
  add('la', at(0, 11, 20), { body: 'M1 release notes …', html: release });
  add('ek', at(0, 11, 24), { body: 'Thanks Lea. Ship it.', reactions: [reacted('🚢', ['ih', 'ml', 'jb'])] });
  add('la', at(0, 11, 30), {
    body: 'Add people is live for everyone 🎉',
    reactions: [
      reacted('🎉', ['jb', 'ml', 'so'], 21), reacted('🚀', ['ek'], 11), reacted('👏', ['ih'], 8), reacted('❤️', ['so', 'tr'], 5),
      reacted('🔥', ['jb'], 4), reacted('💯', ['ml'], 2), reacted('😮', ['tr', 'ek']), reacted('🙏', ['ih']),
    ],
  });
  add('so', at(0, 11, 48), { body: 'On it. One line of copy, one clear action.', edited: true });
  return list;
}

function engHistory(): Message[] {
  const e = '!eng';
  return [
    rich(e, 'ek', at(0, 8, 40), { body: 'Sync rewrite is merged. Cold start is down to 1.2 s.' }),
    rich(e, 'so', at(0, 8, 52), { body: 'Nice. I’ll check it on Safari.' }),
    rich(e, 'jb', at(0, 9, 30), { body: 'Staging deploy is green.' }),
    rich(e, 'ek', at(0, 9, 41), { body: 'Release notes are in the doc.' }),
    rich(e, 'ih', at(0, 9, 47), { body: 'Can someone review the upload limits PR?' }),
  ];
}

const history: Record<string, () => Message[]> = {
  '!general': generalHistory,
  '!eng': engHistory,
};

const ART: Record<string, [string, string, string]> = {
  wall: ['#EFE9DE', '#D9CFBF', '#F2C94C'],
  team: ['#123A34', '#1F5A50', '#3DD6A5'],
  sketch: ['#FBFBF9', '#E9E8E3', '#0E7C66'],
  desk: ['#D8B48E', '#5B3E30', '#FFECC4'],
  screen: ['#FFFFFF', '#ECEAE4', '#1D4ED8'],
  header: ['#F4C99E', '#3E2A44', '#FFE2AA'],
};

/** A small SVG "photo" per media ref, so dev screens show distinct images without files. */
function fakeArt(ref: string): string {
  const [a, b, c] = ART[ref.replace('mxc://fake/', '')] ?? ['#0E7C66', '#123A34', '#3DD6A5'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="r"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="780" cy="420" r="320" fill="url(#r)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface FakeStoreOptions {
  connection?: ConnectionState;
  me?: Person;
  /** Delay before timelines finish loading; 0 = instant. */
  loadMs?: number;
  /** Delay before media URLs resolve, to see the placeholders. */
  mediaMs?: number;
  /** Time an upload takes, with progress; 0 = finished at once. */
  uploadMs?: number;
}

export function createFakeStore(opts: FakeStoreOptions = {}): WorkspaceStore & { set(patch: Partial<WorkspaceSnapshot>): void } {
  let snapshot: WorkspaceSnapshot = {
    me: opts.me ?? people.so!,
    connection: opts.connection ?? 'online',
    spaces,
    channels,
    timelines: {},
    sessionExpired: false,
    typing: { '!eng': [people.jb!] },
    uploads: {},
    dms: [
      { id: '!dm-ingrid', people: [people.ih!], unread: 1, mentions: 1, lastTs: Date.UTC(2026, 10, 20, 9, 40), spaceIds: ['!pasodrum', '!nordlys'] },
      { id: '!dm-jonas-tanaka', people: [people.jb!, people.ty!], unread: 0, mentions: 0, lastTs: Date.UTC(2026, 10, 20, 8, 15), spaceIds: ['!pasodrum'] },
    ],
    threads: [],
    threadTimelines: {},
    activity: [],
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
  const patchUpload = (channelId: string, id: string, patch: Partial<Upload>) =>
    set({ uploads: { ...snapshot.uploads, [channelId]: (snapshot.uploads[channelId] ?? []).map((u) => (u.id === id ? { ...u, ...patch } : u)) } });
  const progressUpload = (channelId: string, id: string, ms: number, end: 'done' | 'failed') => {
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      setTimeout(() => {
        if (!(snapshot.uploads[channelId] ?? []).some((u) => u.id === id)) return;
        patchUpload(channelId, id, i < steps ? { progress: i / steps } : end === 'failed' ? { status: 'failed', progress: 0.6 } : { status: 'done', progress: 1 });
      }, (ms / steps) * i);
    }
  };
  const messagesOf = (channelId: string) => snapshot.timelines[channelId]?.messages ?? [];
  const finishLoad = (channelId: string) => setTimeline(channelId, { messages: history[channelId]?.() ?? [], initialLoading: false });

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
    send(channelId, draft) {
      const original = draft.replyTo ? messagesOf(channelId).find((x) => x.id === draft.replyTo) : undefined;
      const m: Message = {
        id: `~local${localId++}`, channelId, sender: snapshot.me, body: draft.body, html: draft.html, ts: Date.now(), status: 'sending',
        replyTo: original ? { id: original.id, sender: original.sender, body: original.body || original.media?.name || '', found: true } : undefined,
      };
      if (draft.body) setTimeline(channelId, { messages: [...messagesOf(channelId), m] });
      const files = (snapshot.uploads[channelId] ?? []).filter((u) => u.status === 'done');
      const sentFiles: Message[] = files.map((u) => ({
        id: `~local${localId++}`, channelId, sender: snapshot.me, body: '', ts: Date.now(), status: 'sending',
        kind: u.mimetype.startsWith('image/') ? 'image' : u.mimetype.startsWith('video/') ? 'video' : u.mimetype.startsWith('audio/') ? 'audio' : 'file',
        media: { ref: u.previewUrl ?? `mxc://fake/${u.name}`, name: u.name, size: u.size, mimetype: u.mimetype },
      }));
      if (files.length) set({ uploads: { ...snapshot.uploads, [channelId]: (snapshot.uploads[channelId] ?? []).filter((u) => u.status === 'uploading') }, timelines: { ...snapshot.timelines, [channelId]: { ...snapshot.timelines[channelId]!, messages: [...messagesOf(channelId), ...sentFiles] } } });
      const ids = new Set([m.id, ...sentFiles.map((x) => x.id)]);
      setTimeout(() => {
        setTimeline(channelId, {
          messages: messagesOf(channelId).map((x) => (ids.has(x.id) ? { ...x, status: draft.body.includes('fail') ? 'failed' : 'sent' } : x)),
        });
      }, 300);
    },
    edit(channelId, messageId, draft) {
      setTimeline(channelId, { messages: messagesOf(channelId).map((x) => (x.id === messageId ? { ...x, body: draft.body, html: draft.html, edited: true } : x)) });
    },
    remove(channelId, messageId) {
      setTimeline(channelId, { messages: messagesOf(channelId).map((x) => (x.id === messageId ? { ...x, kind: 'deleted', body: '', html: undefined } : x)) });
    },
    react(channelId, messageId, key) {
      setTimeline(channelId, {
        messages: messagesOf(channelId).map((x) => {
          if (x.id !== messageId) return x;
          const list = x.reactions ?? [];
          const hit = list.find((r) => r.key === key);
          if (hit?.mine) return x;
          const next = hit
            ? list.map((r) => (r.key === key ? { ...r, count: r.count + 1, mine: true, senders: [...r.senders, snapshot.me] } : r))
            : [...list, { key, count: 1, mine: true, senders: [snapshot.me] }];
          return { ...x, reactions: next };
        }),
      });
    },
    unreact(channelId, messageId, key) {
      setTimeline(channelId, {
        messages: messagesOf(channelId).map((x) => {
          if (x.id !== messageId) return x;
          const next = (x.reactions ?? [])
            .map((r) => (r.key === key && r.mine ? { ...r, count: r.count - 1, mine: false, senders: r.senders.filter((p) => p.id !== snapshot.me.id) } : r))
            .filter((r) => r.count > 0);
          return { ...x, reactions: next };
        }),
      });
    },
    attach(channelId, files) {
      const ms = opts.uploadMs ?? 0;
      const added: Upload[] = files.map((f) => {
        const end = f.size > 50 * 1024 * 1024 ? ('too-large' as const) : f.name.includes('fail') ? ('failed' as const) : ('done' as const);
        const previewUrl = f.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : undefined;
        return { id: `up${localId++}`, name: f.name, size: f.size, mimetype: f.type, previewUrl, progress: ms && end !== 'too-large' ? 0 : 1, status: ms && end !== 'too-large' ? 'uploading' : end };
      });
      set({ uploads: { ...snapshot.uploads, [channelId]: [...(snapshot.uploads[channelId] ?? []), ...added] } });
      if (ms) for (const u of added) if (u.status === 'uploading') progressUpload(channelId, u.id, ms, u.name.includes('fail') ? 'failed' : 'done');
    },
    retryUpload(channelId, uploadId) {
      if (opts.uploadMs) {
        patchUpload(channelId, uploadId, { status: 'uploading', progress: 0 });
        progressUpload(channelId, uploadId, opts.uploadMs, 'done');
      } else patchUpload(channelId, uploadId, { status: 'done' });
    },
    removeUpload(channelId, uploadId) {
      set({ uploads: { ...snapshot.uploads, [channelId]: (snapshot.uploads[channelId] ?? []).filter((u) => u.id !== uploadId) } });
    },
    setTyping() {},
    members: () => Object.values(people),
    mediaUrl: (ref) => {
      const url = ref.startsWith('mxc://fake/') ? fakeArt(ref) : ref;
      return opts.mediaMs ? new Promise((r) => setTimeout(() => r(url), opts.mediaMs)) : Promise.resolve(url);
    },
    messageLink: (channelId, messageId) => `https://pasodrum.work/m/${encodeURIComponent(channelId)}/${encodeURIComponent(messageId)}`,
    // M3 — fuller fake data arrives with the M3 UI tasks.
    openThread(channelId, rootId) {
      if (snapshot.threadTimelines[rootId]) return;
      set({ threadTimelines: { ...snapshot.threadTimelines, [rootId]: { messages: [], initialLoading: false, loadingOlder: false, hasOlder: false } } });
      void channelId;
    },
    loadOlderInThread() {},
    markThreadRead(channelId, rootId) {
      set({ threads: snapshot.threads.map((t) => (t.rootId === rootId && t.channelId === channelId ? { ...t, unread: false } : t)) });
    },
    markActivityRead(itemId) {
      set({ activity: snapshot.activity.map((a) => (a.id === itemId ? { ...a, unread: false } : a)) });
    },
    searchPeople: (query) => Promise.resolve(Object.values(people).filter((p) => p.id !== snapshot.me.id && p.name.toLowerCase().includes(query.toLowerCase()))),
    async openDm(userIds) {
      const hit = snapshot.dms.find((d) => d.people.length === userIds.length && d.people.every((p) => userIds.includes(p.id)));
      if (hit) return hit.id;
      const id = `!dm-${localId++}`;
      const dmPeople = Object.values(people).filter((p) => userIds.includes(p.id));
      set({ dms: [{ id, people: dmPeople, unread: 0, mentions: 0, lastTs: Date.now(), spaceIds: ['!pasodrum'] }, ...snapshot.dms] });
      return id;
    },
    profile: (userId) => {
      const person = Object.values(people).find((p) => p.id === userId) ?? { id: userId, name: userId };
      return Promise.resolve({ person, email: `${person.name.split(' ')[0]!.toLowerCase()}@pasodrum.work`, timeZone: person.name === '田中 由紀' ? 'Asia/Tokyo' : 'Europe/Oslo' });
    },
  };
}
