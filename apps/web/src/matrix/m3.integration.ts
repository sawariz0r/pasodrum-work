// M3 (D-24) against the seeded local server: pnpm dev:server && pnpm dev:seed && pnpm test:matrix
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signIn, type Message, type WorkspaceStore } from './index';
import { BASE, channel, mx, open, PASSWORD, sendRaw, setupIntegration, until } from './integration.helpers';

setupIntegration();

const JONAS = '@jonas:pasodrum.localhost';
const INGRID = '@ingrid:pasodrum.localhost';
const TANAKA = '@tanaka:pasodrum.localhost';
const HENRIK = '@henrik_nordlys.no:pasodrum.localhost';
const LEA = '@lea_freelance.dev:pasodrum.localhost';
const E = encodeURIComponent;

type Account = Awaited<ReturnType<typeof open>>;
const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const rawEvent = async (token: string, roomId: string, eventId: string) =>
  (await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(roomId)}/event/${E(eventId)}`)).body.content as Record<string, unknown>;
const inTimeline = (store: WorkspaceStore, roomId: string, pick: (m: Message) => boolean) => until(store, (s) => s.timelines[roomId]?.messages.find(pick));
const inThread = (store: WorkspaceStore, rootId: string, pick: (m: Message) => boolean) => until(store, (s) => s.threadTimelines[rootId]?.messages.find(pick));
const threadReply = (rootId: string, latestId: string, body: string) => ({
  msgtype: 'm.text',
  body,
  'm.relates_to': { rel_type: 'm.thread', event_id: rootId, is_falling_back: true, 'm.in_reply_to': { event_id: latestId } },
});
const joinedRooms = async (token: string) => (await mx(token, 'GET', '/_matrix/client/v3/joined_rooms')).body.joined_rooms as string[];

/** Leaves every DM and pending invite from earlier runs, so each run starts from "no DMs". */
async function leaveDms(identifier: string) {
  const { accessToken, userId } = await signIn(BASE, identifier, PASSWORD);
  const direct = (await mx(accessToken, 'GET', `/_matrix/client/v3/user/${E(userId)}/account_data/m.direct`)).body;
  const filter = JSON.stringify({ room: { timeline: { limit: 0 }, state: { lazy_load_members: true } } });
  const sync = (await mx(accessToken, 'GET', `/_matrix/client/v3/sync?timeout=0&filter=${E(filter)}`)).body as { rooms?: { invite?: object; join?: object } };
  const dms = new Set(Object.values(direct).flat() as string[]);
  const rooms = [...Object.keys(sync.rooms?.invite ?? {}), ...Object.keys(sync.rooms?.join ?? {}).filter((id) => dms.has(id))];
  await Promise.all(rooms.map((id) => mx(accessToken, 'POST', `/_matrix/client/v3/rooms/${E(id)}/leave`)));
  await mx(accessToken, 'POST', '/_matrix/client/v3/logout');
}

let jonas: Account;
let ingrid: Account;
let tanaka: Account;
let general: string;
let pasodrum: string;

beforeAll(async () => {
  for (const who of ['jonas', 'ingrid', 'tanaka', 'lea_freelance.dev']) await leaveDms(who);
  [jonas, ingrid, tanaka] = await Promise.all([open('jonas'), open('ingrid'), open('tanaka')]);
  general = channel(jonas.store.getSnapshot(), 'Pasodrum', 'general')!.id;
  pasodrum = jonas.store.getSnapshot().spaces[0]!.id;
  for (const { store } of [jonas, ingrid, tanaka]) {
    store.openTimeline(general);
    await until(store, (s) => s.timelines[general]?.initialLoading === false);
  }
});

describe('threads', () => {
  it('replies in a thread with the Element-style fallback; the root shows the summary; the channel skips replies', async () => {
    const body = unique('thread root');
    jonas.store.send(general, { body, mentions: [] });
    const root = await inTimeline(ingrid.store, general, (m) => m.body === body && m.status === 'sent');
    ingrid.store.openThread(general, root.id);
    const empty = await until(ingrid.store, (s) => s.threadTimelines[root.id]?.initialLoading === false && s.threadTimelines[root.id]);
    expect(empty.messages.map((m) => m.id)).toEqual([root.id]);
    expect(empty.hasOlder).toBe(false);

    const reply = unique('thread reply');
    ingrid.store.send(general, { body: reply, mentions: [], threadRootId: root.id });
    const r1 = await inThread(ingrid.store, root.id, (m) => m.body === reply && m.status === 'sent');
    expect(await rawEvent(ingrid.session.accessToken, general, r1.id)).toMatchObject({
      body: reply,
      'm.relates_to': { rel_type: 'm.thread', event_id: root.id, is_falling_back: true, 'm.in_reply_to': { event_id: root.id } },
    });
    expect(r1.replyTo).toBeUndefined();

    const summary = await until(jonas.store, (s) => s.timelines[general]?.messages.find((m) => m.id === root.id && m.thread?.count === 1)?.thread);
    expect(summary).toMatchObject({ count: 1, participants: [{ id: INGRID, name: 'Ingrid Holm' }], unread: true });
    expect(jonas.store.getSnapshot().timelines[general]!.messages.some((m) => m.body === reply)).toBe(false);

    jonas.store.openThread(general, root.id);
    await inThread(jonas.store, root.id, (m) => m.id === r1.id);
    const reply2 = unique('thread reply 2');
    jonas.store.send(general, { body: reply2, mentions: [], threadRootId: root.id });
    const r2 = await inThread(jonas.store, root.id, (m) => m.body === reply2 && m.status === 'sent');
    expect((await rawEvent(jonas.session.accessToken, general, r2.id))['m.relates_to']).toMatchObject({ is_falling_back: true, 'm.in_reply_to': { event_id: r1.id } });
    const both = await until(ingrid.store, (s) => s.timelines[general]?.messages.find((m) => m.id === root.id && m.thread?.count === 2)?.thread);
    expect(both.participants.map((p) => p.id)).toEqual([JONAS, INGRID]);
    expect(ingrid.store.getSnapshot().threadTimelines[root.id]!.messages.map((m) => m.id)).toEqual([root.id, r1.id, r2.id]);
  });

  it('lists the threads I follow, newest first, with unread; markThreadRead clears it and the server keeps it', async () => {
    const t = tanaka.session.accessToken;
    const i = ingrid.session.accessToken;
    const rootId = await sendRaw(t, general, { msgtype: 'm.text', body: unique('followed root') });
    const a = await sendRaw(i, general, threadReply(rootId, rootId, 'from ingrid'));
    const b = await sendRaw(jonas.session.accessToken, general, threadReply(rootId, a, 'from jonas'));
    const otherRoot = await sendRaw(i, general, { msgtype: 'm.text', body: unique('not followed by jonas') });
    await sendRaw(t, general, threadReply(otherRoot, otherRoot, 'tanaka only'));
    await until(jonas.store, (s) => s.timelines[general]?.messages.find((m) => m.id === otherRoot && m.thread));
    jonas.store.markRead(general);
    await until(jonas.store, (s) => channel(s, 'Pasodrum', 'general')?.unread === 0);
    const last = await sendRaw(i, general, threadReply(rootId, b, 'ingrid again'));

    const followed = await until(jonas.store, (s) => s.threads.find((x) => x.rootId === rootId && x.lastReply?.id === last));
    expect(followed).toMatchObject({ channelId: general, count: 3, unread: true, root: { sender: { id: TANAKA }, thread: { count: 3, unread: true } }, lastReply: { body: 'ingrid again' } });
    const s = jonas.store.getSnapshot();
    expect(s.threads.some((x) => x.rootId === otherRoot)).toBe(false);
    expect(s.timelines[general]!.messages.find((m) => m.id === otherRoot)!.thread).toMatchObject({ count: 1, unread: false });
    expect(s.threads.map((x) => x.lastTs)).toEqual([...s.threads.map((x) => x.lastTs)].sort((x, y) => y - x));
    await until(tanaka.store, (s) => s.threads.find((x) => x.rootId === rootId && x.count === 3));

    jonas.store.markThreadRead(general, rootId);
    await until(jonas.store, (s) => s.threads.find((x) => x.rootId === rootId)?.unread === false);
    const fresh = await open('jonas');
    await until(fresh.store, (s) => s.threads.find((x) => x.rootId === rootId && x.count === 3));
    expect(fresh.store.getSnapshot().threads.find((x) => x.rootId === rootId)!.unread).toBe(false);

    // The server keeps one read position per room: reading the thread must not swallow an unread channel message.
    await sendRaw(i, general, { msgtype: 'm.text', body: unique('channel message while reading a thread') });
    const more = await sendRaw(i, general, threadReply(rootId, last, 'one more'));
    await until(jonas.store, (s) => s.threads.find((x) => x.rootId === rootId && x.lastReply?.id === more && x.unread));
    jonas.store.markThreadRead(general, rootId);
    await until(jonas.store, (s) => s.threads.find((x) => x.rootId === rootId)?.unread === false);
    const again = await open('jonas');
    await until(again.store, (s) => (channel(s, 'Pasodrum', 'general')?.unread ?? 0) > 0);
  });

  it('pages older replies', async () => {
    const t = tanaka.session.accessToken;
    const rootId = await sendRaw(t, general, { msgtype: 'm.text', body: unique('long thread') });
    let latest = rootId;
    for (let n = 1; n <= 35; n++) latest = await sendRaw(ingrid.session.accessToken, general, threadReply(rootId, latest, `reply ${n}`));
    const fresh = await open('tanaka');
    fresh.store.openThread(general, rootId);
    let tl = await until(fresh.store, (s) => s.threadTimelines[rootId]?.initialLoading === false && s.threadTimelines[rootId]);
    expect(tl.hasOlder).toBe(true);
    expect(tl.messages.at(-1)!.body).toBe('reply 35');
    while (tl.hasOlder) {
      fresh.store.loadOlderInThread(general, rootId);
      tl = await until(fresh.store, (s) => s.threadTimelines[rootId] !== tl && !s.threadTimelines[rootId]!.loadingOlder && s.threadTimelines[rootId]);
    }
    expect(tl.messages.map((m) => m.body)).toEqual([expect.stringContaining('long thread'), ...Array.from({ length: 35 }, (_, n) => `reply ${n + 1}`)]);
    expect(tl.messages[0]!.thread).toMatchObject({ count: 35, participants: [{ id: INGRID }] });
  });
});

describe('DMs', () => {
  const created: { token: () => string; roomId: string }[] = [];
  afterAll(async () => {
    for (const { token, roomId } of created) await mx(token(), 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/leave`);
  });

  it('creates an encrypted DM (M6), the other side opens it without accepting, and both reuse it', async () => {
    const id = await jonas.store.openDm([INGRID]);
    created.push({ token: () => jonas.session.accessToken, roomId: id }, { token: () => ingrid.session.accessToken, roomId: id });
    const state = (await mx(jonas.session.accessToken, 'GET', `/_matrix/client/v3/rooms/${E(id)}/state`)).body as unknown as { type: string; state_key: string; content: Record<string, unknown> }[];
    expect(state.filter((e) => e.type === 'm.room.encryption')).toHaveLength(1);
    const direct = (await mx(jonas.session.accessToken, 'GET', `/_matrix/client/v3/user/${E(JONAS)}/account_data/m.direct`)).body;
    expect(direct[INGRID]).toContain(id);

    const mine = await until(jonas.store, (s) => s.dms.find((d) => d.id === id && d.spaceIds.length));
    expect(mine).toMatchObject({ people: [{ id: INGRID, name: 'Ingrid Holm' }], spaceIds: [pasodrum] });
    const theirs = await until(ingrid.store, (s) => s.dms.find((d) => d.id === id && d.spaceIds.length));
    expect(theirs).toMatchObject({ people: [{ id: JONAS }], spaceIds: [pasodrum] });
    expect(Object.values(jonas.store.getSnapshot().channels).flat().some((c) => c.id === id)).toBe(false);

    expect(await ingrid.store.openDm([JONAS])).toBe(id);
    expect(await jonas.store.openDm([INGRID, JONAS])).toBe(id);

    const before = mine.lastTs;
    ingrid.store.send(id, { body: unique('hello jonas'), mentions: [] });
    const updated = await until(jonas.store, (s) => s.dms.find((d) => d.id === id && d.unread > 0));
    expect(updated.lastTs).toBeGreaterThan(before);
    expect(jonas.store.getSnapshot().dms[0]!.id).toBe(id);
  });

  it('reuses a group DM, also when asked twice at once', async () => {
    const [a, b] = await Promise.all([jonas.store.openDm([INGRID, TANAKA]), jonas.store.openDm([TANAKA, INGRID])]);
    expect(a).toBe(b);
    for (const who of [jonas, ingrid, tanaka]) created.push({ token: () => who.session.accessToken, roomId: a });
    expect(await jonas.store.openDm([TANAKA, INGRID])).toBe(a);
    const dm = await until(jonas.store, (s) => s.dms.find((d) => d.id === a));
    expect(dm.people.map((p) => p.id).sort()).toEqual([INGRID, TANAKA]);
    expect(await jonas.store.openDm([INGRID])).not.toBe(a);
  });

  it('leaves an invite from someone I share no space with pending, until I open that DM', async () => {
    const lea = await signIn(BASE, 'lea@freelance.dev', PASSWORD);
    const { body } = await mx(lea.accessToken, 'POST', '/_matrix/client/v3/createRoom', { preset: 'private_chat', is_direct: true, invite: [JONAS] });
    const roomId = body.room_id as string;
    created.push({ token: () => jonas.session.accessToken, roomId }, { token: () => lea.accessToken, roomId });
    await new Promise((r) => setTimeout(r, 1500));
    expect(await joinedRooms(jonas.session.accessToken)).not.toContain(roomId);
    expect(jonas.store.getSnapshot().dms.some((d) => d.id === roomId)).toBe(false);

    expect(await jonas.store.openDm([LEA])).toBe(roomId);
    expect(await joinedRooms(jonas.session.accessToken)).toContain(roomId);
    const dm = await until(jonas.store, (s) => s.dms.find((d) => d.id === roomId));
    expect(dm).toMatchObject({ people: [{ id: LEA, external: true }], spaceIds: [] });
  });
});

describe('activity', () => {
  it('collects mentions of me and replies to me (channel and thread), excluding my own; markActivityRead', async () => {
    const mine = unique('jonas says');
    jonas.store.send(general, { body: mine, mentions: [] });
    const original = await inTimeline(ingrid.store, general, (m) => m.body === mine && m.status === 'sent');

    const mention = unique('Jonas Berg, a mention');
    ingrid.store.send(general, { body: mention, html: `<a href="https://matrix.to/#/${JONAS}">Jonas Berg</a>, ${mention}`, mentions: [JONAS] });
    const reply = unique('a reply');
    ingrid.store.send(general, { body: reply, mentions: [], replyTo: original.id });
    const inThreadBody = unique('a thread reply');
    ingrid.store.send(general, { body: inThreadBody, mentions: [], threadRootId: original.id });
    const notMine = unique('nothing for jonas');
    ingrid.store.send(general, { body: notMine, mentions: [] });

    const thread = await until(jonas.store, (s) => s.activity.find((a) => a.message.body === inThreadBody));
    const s = jonas.store.getSnapshot();
    const byBody = (b: string) => s.activity.find((a) => a.message.body === b);
    expect(byBody(mention)).toMatchObject({ kind: 'mention', channelId: general, unread: true, message: { mentionsMe: true, sender: { id: INGRID } } });
    expect(byBody(reply)).toMatchObject({ kind: 'reply', unread: true, message: { replyTo: { id: original.id, found: true } } });
    expect(thread).toMatchObject({ kind: 'reply', threadRootId: original.id, unread: true });
    expect(byBody(notMine)).toBeUndefined();
    expect(s.activity.some((a) => a.message.sender.id === JONAS)).toBe(false);
    expect(s.activity.map((a) => a.message.ts)).toEqual([...s.activity.map((a) => a.message.ts)].sort((x, y) => y - x));
    expect(ingrid.store.getSnapshot().activity.some((a) => a.message.sender.id === INGRID)).toBe(false);

    const id = byBody(mention)!.id;
    jonas.store.markActivityRead(id);
    await until(jonas.store, (s) => s.activity.find((a) => a.id === id)?.unread === false);
  });
});

describe('people and profiles', () => {
  it('finds people the server lets me see; a client never finds unrelated staff', async () => {
    const henrik = await open('henrik@nordlys.no');
    expect(await henrik.store.searchPeople('jonas')).toEqual([]);
    expect(await henrik.store.searchPeople('ingrid')).toEqual([{ id: INGRID, name: 'Ingrid Holm' }]);
    const team = (await henrik.store.searchPeople('')).map((p) => p.id);
    expect(team).toContain(INGRID);
    expect(team).not.toContain(JONAS);
    expect(team).not.toContain(HENRIK);
    expect(await jonas.store.searchPeople('henrik')).toEqual([]);
    expect(await ingrid.store.searchPeople('Henrik')).toEqual([{ id: HENRIK, name: 'Henrik Dahl', external: true }]);
    const staff = await jonas.store.searchPeople('');
    expect(staff.map((p) => p.id)).toEqual(expect.arrayContaining([INGRID, TANAKA]));
    expect(staff.some((p) => p.id === JONAS || p.external)).toBe(false);
  });

  it('reads name, time zone and email; derives the email from the ID when none is stored', async () => {
    const t = tanaka.session.accessToken;
    await mx(t, 'PUT', `/_matrix/client/v3/profile/${E(TANAKA)}/m.tz`, { 'm.tz': 'Asia/Tokyo' });
    await mx(t, 'PUT', `/_matrix/client/v3/profile/${E(TANAKA)}/work.pasodrum.email`, { 'work.pasodrum.email': 'yuki.tanaka@pasodrum.no' });
    expect(await jonas.store.profile(TANAKA)).toEqual({ person: { id: TANAKA, name: '田中 由紀' }, email: 'yuki.tanaka@pasodrum.no', timeZone: 'Asia/Tokyo' });

    const henrik = await signIn(BASE, 'henrik@nordlys.no', PASSWORD);
    await mx(henrik.accessToken, 'DELETE', `/_matrix/client/v3/profile/${E(HENRIK)}/work.pasodrum.email`);
    expect(await ingrid.store.profile(HENRIK)).toMatchObject({ person: { id: HENRIK, name: 'Henrik Dahl', external: true }, email: 'henrik@nordlys.no' });
  });
});
