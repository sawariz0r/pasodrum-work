// Runs against the seeded local server: pnpm dev:server && pnpm dev:seed && pnpm test:matrix
import { beforeAll, describe, expect, it } from 'vitest';
import { loadSession, resolveServer, signIn, SignInError } from './index';
import { BASE, channel, mx, names, open, PASSWORD, setupIntegration, stores, until } from './integration.helpers';

setupIntegration();

describe('server and sign-in', () => {
  it('resolves the server through .well-known', async () => {
    expect(await resolveServer(BASE)).toBe('http://localhost:8008');
    expect(await resolveServer('localhost:8008')).toBe('http://localhost:8008');
    await expect(resolveServer('http://localhost:1')).rejects.toEqual(new SignInError('unreachable'));
  });

  it('maps failures', async () => {
    await expect(signIn(BASE, 'jonas', 'wrong')).rejects.toMatchObject({ reason: 'wrong-password' });
    await expect(signIn(BASE, 'nobody@nowhere.example', 'wrong')).rejects.toMatchObject({ reason: 'wrong-password' });
    await expect(signIn('http://localhost:1', 'jonas', PASSWORD)).rejects.toMatchObject({ reason: 'unreachable' });
  });

  it('accepts own-server and deterministic emails, and persists the session', async () => {
    const own = await signIn(BASE, 'sofia@pasodrum.localhost', PASSWORD);
    expect(own.userId).toBe('@sofia:pasodrum.localhost');
    expect(loadSession()).toEqual(own);
    const client = await signIn(BASE, 'henrik@nordlys.no', PASSWORD);
    expect(client.userId).toBe('@henrik_nordlys.no:pasodrum.localhost');
    for (const s of [own, client]) await mx(s.accessToken, 'POST', '/_matrix/client/v3/logout');
  });
});

describe('workspace', () => {
  let jonas: Awaited<ReturnType<typeof open>>;
  let ingrid: Awaited<ReturnType<typeof open>>;
  beforeAll(async () => {
    [jonas, ingrid] = await Promise.all([open('jonas'), open('ingrid')]);
  });

  it('shows the workspace and its joined channels', async () => {
    const s = jonas.store.getSnapshot();
    expect(s.me).toEqual({ id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' });
    expect(s.spaces.map((x) => [x.name, x.kind])).toEqual([['Pasodrum', 'workspace']]);
    expect(names(s, 'Pasodrum')).toEqual(expect.arrayContaining(['design', 'general']));
    expect(names(s, 'Pasodrum')).not.toContain('lead');
    expect(channel(s, 'Pasodrum', 'general')).toMatchObject({ private: false, memberCount: 4 });
    const i = ingrid.store.getSnapshot();
    expect(i.spaces.map((x) => [x.name, x.kind])).toEqual([['Pasodrum', 'workspace'], ['Nordlys', 'client']]);
    expect(channel(i, 'Pasodrum', 'lead')).toMatchObject({ private: true });
  });

  it('loads history, skipping what is not shown', async () => {
    const general = channel(jonas.store.getSnapshot(), 'Pasodrum', 'general')!.id;
    jonas.store.openTimeline(general);
    expect(jonas.store.getSnapshot().timelines[general]).toBeUndefined();
    let t = await until(jonas.store, (s) => s.timelines[general]?.initialLoading === false && s.timelines[general]);
    while (t.hasOlder) {
      jonas.store.loadOlder(general);
      t = await until(jonas.store, (s) => s.timelines[general] !== t && !s.timelines[general]!.loadingOlder && s.timelines[general]);
    }
    const seed = t.messages.find((m) => m.body === 'Nordlys review moved to Thursday 14:00.');
    expect(seed).toMatchObject({ sender: { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' }, status: 'sent' });
    expect(t.messages.some((m) => m.sender.name === '田中 由紀')).toBe(true);
    expect(t.messages.filter((m) => !(m.channelId === general && (m.kind === 'system' ? m.system!.joined.length + m.system!.left.length : m.body || m.media || m.kind === 'deleted')))).toEqual([]);

    const lead = channel(ingrid.store.getSnapshot(), 'Pasodrum', 'lead')!.id;
    ingrid.store.openTimeline(lead);
    const encrypted = await until(ingrid.store, (s) => s.timelines[lead]?.initialLoading === false && s.timelines[lead]);
    expect(encrypted.messages.filter((m) => m.kind !== 'system')).toEqual([]);
  });

  it('sends, receives, edits and marks read', async () => {
    const general = channel(jonas.store.getSnapshot(), 'Pasodrum', 'general')!.id;
    ingrid.store.openTimeline(general);
    await until(ingrid.store, (s) => s.timelines[general]?.initialLoading === false);
    ingrid.store.markRead(general);
    await until(ingrid.store, (s) => channel(s, 'Pasodrum', 'general')?.unread === 0);

    const before = jonas.store.getSnapshot();
    const body = `integration ${Date.now()}`;
    jonas.store.sendText(general, body);
    const sending = await until(jonas.store, (s) => s.timelines[general]?.messages.find((m) => m.body === body));
    expect(sending.status).toBe('sending');
    const after = jonas.store.getSnapshot();
    expect(after.spaces).toBe(before.spaces);
    expect(after.channels).toBe(before.channels);
    expect(after.timelines[general]!.messages[0]).toBe(before.timelines[general]!.messages[0]);

    const sent = await until(jonas.store, (s) => s.timelines[general]?.messages.find((m) => m.body === body && m.status === 'sent'));
    expect(sent.id.startsWith('$')).toBe(true);
    const received = await until(ingrid.store, (s) => s.timelines[general]?.messages.find((m) => m.id === sent.id));
    expect(received).toMatchObject({ body, sender: { name: 'Jonas Berg' }, status: 'sent' });
    await until(ingrid.store, (s) => (channel(s, 'Pasodrum', 'general')?.unread ?? 0) > 0);
    ingrid.store.markRead(general);
    expect(channel(ingrid.store.getSnapshot(), 'Pasodrum', 'general')?.unread).toBeGreaterThan(0);
    await until(ingrid.store, (s) => channel(s, 'Pasodrum', 'general')?.unread === 0);

    await mx(jonas.session.accessToken, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(general)}/send/m.room.message/edit${Date.now()}`, {
      msgtype: 'm.text',
      body: `* ${body} (edited)`,
      'm.new_content': { msgtype: 'm.text', body: `${body} (edited)` },
      'm.relates_to': { rel_type: 'm.replace', event_id: sent.id },
    });
    const edited = await until(ingrid.store, (s) => s.timelines[general]?.messages.find((m) => m.id === sent.id && m.edited));
    expect(edited.body).toBe(`${body} (edited)`);
    expect(ingrid.store.getSnapshot().timelines[general]!.messages.some((m) => m.body.startsWith('* '))).toBe(false);
  });

  it('marks a refused send failed; retry and discard', async () => {
    const space = jonas.store.getSnapshot().spaces[0]!.id;
    jonas.store.openTimeline(space);
    await until(jonas.store, (s) => s.timelines[space]?.initialLoading === false);
    jonas.store.sendText(space, 'not allowed here');
    const failed = await until(jonas.store, (s) => s.timelines[space]?.messages.find((m) => m.status === 'failed'));
    jonas.store.retry(space, failed.id);
    await until(jonas.store, (s) => s.timelines[space]?.messages.find((m) => m.id === failed.id)?.status === 'sending');
    await until(jonas.store, (s) => s.timelines[space]?.messages.find((m) => m.id === failed.id)?.status === 'failed');
    jonas.store.discard(space, failed.id);
    await until(jonas.store, (s) => !s.timelines[space]?.messages.some((m) => m.id === failed.id));
  });
});

describe('paging', () => {
  it('opens on the latest ~30 messages and pages back', async () => {
    const sofia = await signIn(BASE, 'sofia', PASSWORD);
    const { body } = await mx(sofia.accessToken, 'POST', '/_matrix/client/v3/createRoom', { preset: 'private_chat', name: 'paging test' });
    const roomId = body.room_id as string;
    for (let n = 1; n <= 70; n++) {
      await mx(sofia.accessToken, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/p${Date.now()}-${n}`, { msgtype: 'm.text', body: `m${n}` });
    }
    await mx(sofia.accessToken, 'POST', '/_matrix/client/v3/logout');
    const { session, store } = await open('sofia');
    store.openTimeline(roomId);
    let t = await until(store, (s) => s.timelines[roomId]?.initialLoading === false && s.timelines[roomId]);
    const texts = () => t.messages.filter((m) => m.kind !== 'system');
    expect(texts().length).toBeGreaterThanOrEqual(30);
    expect(texts().length).toBeLessThan(70);
    expect(t.messages.at(-1)!.body).toBe('m70');
    expect(t.hasOlder).toBe(true);
    const counts = [t.messages.length];
    while (t.hasOlder) {
      store.loadOlder(roomId);
      t = await until(store, (s) => s.timelines[roomId] !== t && !s.timelines[roomId]!.loadingOlder && s.timelines[roomId]);
      counts.push(t.messages.length);
    }
    expect(texts().map((m) => m.body)).toEqual(Array.from({ length: 70 }, (_, i) => `m${i + 1}`));
    expect(t.messages[0]).toMatchObject({ kind: 'system', system: { joined: [{ id: '@sofia:pasodrum.localhost' }], left: [] } });
    expect(counts.length).toBeGreaterThan(2);
    await mx(session.accessToken, 'POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`);
    await mx(session.accessToken, 'POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/forget`);
  });
});

describe('client isolation', () => {
  it('a client sees only their client space', async () => {
    const { store } = await open('henrik@nordlys.no');
    const s = store.getSnapshot();
    expect(s.spaces.map((x) => [x.name, x.kind])).toEqual([['Nordlys', 'client']]);
    expect(names(s, 'Nordlys')).toEqual(['project-updates', 'questions']);
  });
});

describe('session end', () => {
  it('flags an expired token and clears the stored session', async () => {
    const { session, store } = await open('tanaka');
    expect(loadSession()?.accessToken).toBe(session.accessToken);
    // Signed in before the expiry, so its saved session can't land after the store clears it.
    const other = await signIn(BASE, 'jonas', PASSWORD);
    await mx(session.accessToken, 'POST', '/_matrix/client/v3/logout');
    store.reconnectNow();
    const general = channel(store.getSnapshot(), 'Pasodrum', 'general')!.id;
    await mx(other.accessToken, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(general)}/send/m.room.message/wake${Date.now()}`, { msgtype: 'm.text', body: 'wake up' });
    await mx(other.accessToken, 'POST', '/_matrix/client/v3/logout');
    await until(store, (s) => s.sessionExpired, 40_000);
    expect(loadSession()).toBeNull();
  });

  it('signOut logs the device out', async () => {
    const { session, store } = await open('jonas');
    await store.signOut();
    stores.splice(stores.indexOf(store), 1);
    expect(loadSession()).toBeNull();
    expect((await mx(session.accessToken, 'GET', '/_matrix/client/v3/account/whoami')).status).toBe(401);
  });
});
