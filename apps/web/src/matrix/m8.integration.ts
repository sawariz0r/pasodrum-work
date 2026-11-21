// M8 search + SIDE-03 share history against the local server: pnpm dev:server && pnpm dev:seed && pnpm test:matrix.
// Ported from dev/spike-share-history.ts. Fresh accounts each run (the staff one is added to the seeded workspace).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWorkspaceStore, signIn, type SearchHit, type WorkspaceStore } from './index';
import { BASE, mx, PASSWORD, setupIntegration, stores, until } from './integration.helpers';

setupIntegration();

const E = encodeURIComponent;
const env = readFileSync(new URL('../../../../dev/.env', import.meta.url), 'utf8');
const regToken = () => process.env.REGISTRATION_TOKEN ?? env.match(/^REGISTRATION_TOKEN=(.+)$/m)![1]!.trim();
const seeded = JSON.parse(readFileSync(new URL('../../../../dev/data/seed-pasodrum.localhost.json', import.meta.url), 'utf8')) as { rooms: { workspace: string } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function register(label: string) {
  const username = `m8${label}${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
  const post = async (body: object) => {
    const res = await fetch(`${BASE}/_matrix/client/v3/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const first = await post({ username, password: PASSWORD });
  const done = await post({ username, password: PASSWORD, auth: { type: 'm.login.registration_token', token: regToken(), session: first.body.session } });
  expect(done.status).toBe(200);
  return { username, userId: done.body.user_id as string, token: done.body.access_token as string };
}

async function device(username: string) {
  const session = await signIn(BASE, username, PASSWORD);
  const store = createWorkspaceStore(session);
  stores.push(store);
  await until(store, (s) => s.connection === 'online' && s.security.device !== 'starting', 30_000);
  return { session, store };
}

const reason = (p: Promise<unknown>) => p.then(() => 'resolved', (e: Error) => e.message);
const readable = (store: WorkspaceStore, dmId: string, bodies: string[]) => (store.getSnapshot().timelines[dmId]?.messages ?? []).filter((m) => bodies.includes(m.body));

describe('SIDE-03 share history + M8 search', () => {
  it('refuses without both confirmations, restores after them, refuses after another reset; searches older encrypted history', async () => {
    // Staff: a fresh team person in the seeded workspace. Client: a fresh account outside it.
    const [staff, client] = await Promise.all([register('staff'), register('client')]);
    const owner = (await signIn(BASE, 'sofia', PASSWORD)).accessToken;
    await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(seeded.rooms.workspace)}/invite`, { user_id: staff.userId });
    await mx(owner, 'POST', '/_matrix/client/v3/logout');
    expect((await mx(staff.token, 'POST', `/_matrix/client/v3/join/${E(seeded.rooms.workspace)}`)).status).toBe(200);

    const s1 = await device(staff.username);
    const staffKey = await s1.store.newRecoveryKey();
    await until(s1.store, (s) => !s.security.needsRecoveryKey && s.spaces.some((sp) => sp.kind === 'workspace'));
    const c1 = await device(client.username);
    await c1.store.newRecoveryKey();

    // The DM, with history on both sides. (Client and staff share no space, so the client joins by hand.)
    const dmId = await s1.store.openDm([client.userId]);
    expect((await mx(client.token, 'POST', `/_matrix/client/v3/join/${E(dmId)}`)).status).toBe(200);
    await mx(client.token, 'PUT', `/_matrix/client/v3/user/${E(client.userId)}/account_data/m.direct`, { [staff.userId]: [dmId] });
    await until(c1.store, (s) => s.dms.find((d) => d.id === dmId)?.encrypted);
    s1.store.openTimeline(dmId);
    c1.store.openTimeline(dmId);
    const history: string[] = [];
    for (let i = 0; i < 3; i++) {
      for (const [from, to, who] of [[s1, c1, 'staff'], [c1, s1, 'client']] as const) {
        const body = `M8 ${who} #${i}`;
        from.store.sendText(dmId, body);
        await until(to.store, () => readable(to.store, dmId, [body]).length === 1);
        history.push(body);
      }
    }
    await expect(reason(s1.store.shareHistory(dmId, staff.userId))).resolves.toBe('not-allowed');

    // The client loses everything and resets: old messages unreadable.
    await c1.store.signOut();
    const c2 = await device(client.username);
    await until(c2.store, (s) => s.security.device === 'unconfirmed');
    await c2.store.resetEncryption(PASSWORD);
    c2.store.openTimeline(dmId);
    await until(c2.store, (s) => s.timelines[dmId] && !s.timelines[dmId].initialLoading && s.timelines[dmId].messages.length >= history.length);
    await sleep(2000);
    expect(readable(c2.store, dmId, history)).toHaveLength(0);

    // Refused: staff hasn't confirmed the client; an unconfirmed staff device.
    await expect(reason(s1.store.shareHistory(dmId, client.userId))).resolves.toBe('not-confirmed');
    const s2 = await device(staff.username);
    await until(s2.store, (s) => s.security.device === 'unconfirmed');
    await expect(reason(s2.store.shareHistory(dmId, client.userId))).resolves.toBe('device-unconfirmed');
    await s2.store.signOut();

    // Emoji with the person: staff asks, the client sees 'asked', both compare the same emoji.
    await sleep(1500);
    s1.store.requestPersonConfirmation(client.userId);
    await until(s1.store, (s) => s.security.confirmation?.role === 'person' && s.security.confirmation.phase === 'waiting');
    const asked = await until(c2.store, (s) => s.security.confirmation?.role === 'person' && s.security.confirmation.phase === 'asked' && s.security.confirmation, 20_000);
    expect(asked.person?.id).toBe(staff.userId);
    c2.store.acceptConfirmation();
    const emoji = (store: WorkspaceStore) => until(store, (s) => s.security.confirmation?.phase === 'compare' && s.security.confirmation.emoji?.map((e) => e.index).join(','));
    const [mine, theirs] = await Promise.all([emoji(s1.store), emoji(c2.store)]);
    expect(mine).toBe(theirs);
    s1.store.confirmEmoji(true);
    c2.store.confirmEmoji(true);
    await Promise.all([s1.store, c2.store].map((st) => until(st, (s) => s.security.confirmation?.phase === 'done', 20_000)));
    expect(await s1.store.personConfirmed(client.userId)).toBe(true);
    s1.store.dismissConfirmation();
    c2.store.dismissConfirmation();

    // Share: the client reads 6/6, marked restored, below a "history shared" row; repeating is harmless.
    await s1.store.shareHistory(dmId, client.userId);
    const restored = await until(c2.store, () => {
      const got = readable(c2.store, dmId, history);
      return got.length === history.length && got.every((m) => m.restored) && got;
    }, 30_000);
    expect(restored.map((m) => m.body).sort()).toEqual([...history].sort());
    const row = await until(c2.store, (s) => s.timelines[dmId]?.messages.find((m) => m.system?.historyShared));
    expect(row.system?.historyShared?.by.id).toBe(staff.userId);
    expect(c2.store.getSnapshot().timelines[dmId]?.messages.some((m) => m.kind === 'unsupported')).toBe(false);
    await s1.store.shareHistory(dmId, client.userId);

    // M8: a Japanese message beyond the loaded page, found by a new confirmed staff device (scan + decrypt here).
    const needle = 'キックオフの議事録';
    s1.store.sendText(dmId, `共有します：${needle}です。`);
    for (let i = 0; i < 35; i++) s1.store.sendText(dmId, `filler ${i}`);
    await until(s1.store, (s) => s.timelines[dmId]?.messages.some((m) => m.body === 'filler 34' && m.status === 'sent'), 30_000);
    // The new device reads them from the backup: wait until staff's keys are all in it.
    for (let i = 0; i < 20 && (await s1.store.signOutRisk()) === 'no-backup'; i++) await sleep(500);
    const s3 = await device(staff.username);
    await s3.store.useRecoveryKey(staffKey);
    s3.store.openTimeline(dmId);
    await until(s3.store, (s) => s.timelines[dmId]?.messages.some((m) => m.body === 'filler 34'), 30_000);
    expect(s3.store.getSnapshot().timelines[dmId]?.messages.some((m) => m.body.includes(needle))).toBe(false);
    const hits: SearchHit[] = [];
    const ac = new AbortController();
    // Half-width katakana in the query, full-width in the message.
    await s3.store.search('ｷｯｸｵﾌの議事録', { channelId: dmId, signal: ac.signal, onHits: (h) => hits.push(...h) });
    expect(hits.map((h) => h.message.body)).toEqual([`共有します：${needle}です。`]);
    expect(hits[0]!.message.channelId).toBe(dmId);

    // The existing jump (?msg=, up to 10 older pages) reaches it.
    const target = hits[0]!.message.id;
    for (let i = 0; i < 10 && !s3.store.getSnapshot().timelines[dmId]?.messages.some((m) => m.id === target); i++) {
      s3.store.loadOlder(dmId);
      await until(s3.store, (s) => !s.timelines[dmId]?.loadingOlder);
      await sleep(200);
    }
    expect(s3.store.getSnapshot().timelines[dmId]?.messages.some((m) => m.id === target)).toBe(true);

    // Abort: stops after the batch it's in, rejects with AbortError.
    const stop = new AbortController();
    let batches = 0;
    const aborted = s3.store.search('filler', {
      signal: stop.signal,
      onHits: () => {
        batches++;
        stop.abort();
      },
    });
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(batches).toBe(1);
    await sleep(1000);
    expect(batches).toBe(1);

    // The client resets again: the confirmation was for the old identity, so sharing is refused.
    await c2.store.signOut();
    const c3 = await device(client.username);
    await until(c3.store, (s) => s.security.device === 'unconfirmed');
    await c3.store.resetEncryption(PASSWORD);
    for (let i = 0; i < 30 && (await s1.store.personConfirmed(client.userId)); i++) await sleep(500);
    await expect(reason(s1.store.shareHistory(dmId, client.userId))).resolves.toBe('not-confirmed');
  }, 300_000);
});
