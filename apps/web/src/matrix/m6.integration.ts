// M6 (D-31) against the local server: pnpm dev:server && pnpm test:matrix. Fresh accounts each run, so the seeded
// ones never get an encryption identity (a lost recovery key would lock the browser check out).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWorkspaceStore, signIn, type WorkspaceStore } from './index';
import { BASE, mx, PASSWORD, sendRaw, setupIntegration, stores, until } from './integration.helpers';

setupIntegration();

const E = encodeURIComponent;
const regToken = () => process.env.REGISTRATION_TOKEN ?? readFileSync(new URL('../../../../dev/.env', import.meta.url), 'utf8').match(/^REGISTRATION_TOKEN=(.+)$/m)![1]!.trim();

async function register(label: string) {
  const username = `m6${label}${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
  const post = async (body: object) => {
    const res = await fetch(`${BASE}/_matrix/client/v3/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const first = await post({ username, password: PASSWORD });
  const done = await post({ username, password: PASSWORD, auth: { type: 'm.login.registration_token', token: regToken(), session: first.body.session } });
  expect(done.status).toBe(200);
  return username;
}

async function device(username: string) {
  const session = await signIn(BASE, username, PASSWORD);
  const store = createWorkspaceStore(session);
  stores.push(store);
  await until(store, (s) => s.connection === 'online' && s.security.device !== 'starting', 30_000);
  return { session, store };
}

const encryptionEvents = async (token: string, roomId: string) => {
  const filter = E(JSON.stringify({ types: ['m.room.encryption'] }));
  const { body } = await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(roomId)}/messages?dir=b&limit=50&filter=${filter}`);
  return (body.chunk as { sender: string; event_id: string; origin_server_ts: number }[]).map((e) => `${e.sender} ${e.origin_server_ts}`);
};

const backedUp = async (token: string) => {
  for (let i = 0; i < 40; i++) {
    const version = (await mx(token, 'GET', '/_matrix/client/v3/room_keys/version')).body.version as string | undefined;
    if (version) {
      const { body } = await mx(token, 'GET', `/_matrix/client/v3/room_keys/keys?version=${version}`);
      if (Object.keys(body.rooms ?? {}).length) return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

const emojiOf = (store: WorkspaceStore) => until(store, (s) => s.security.confirmation?.phase === 'compare' && s.security.confirmation.emoji?.map((e) => e.index).join(','));

describe('M6 encryption', () => {
  it('turns encryption on once for an existing DM, only where I may', async () => {
    const [aName, bName] = await Promise.all([register('a'), register('b')]);
    const b = await signIn(BASE, bName, PASSWORD);
    const aToken = (await signIn(BASE, aName, PASSWORD)).accessToken;
    // An M3-era DM: no encryption, made by a; b (level 0) may not turn it on.
    const { body } = await mx(aToken, 'POST', '/_matrix/client/v3/createRoom', { preset: 'private_chat', is_direct: true, invite: [b.userId] });
    const roomId = body.room_id as string;
    await mx(b.accessToken, 'POST', `/_matrix/client/v3/join/${E(roomId)}`);
    await sendRaw(aToken, roomId, { msgtype: 'm.text', body: 'before M6' });
    // The store leaves rooms younger than 15 s alone (Continuwuity is still writing their initial state).
    await new Promise((r) => setTimeout(r, 15_500));

    const { store: bStore } = await device(bName);
    await until(bStore, (s) => s.dms.find((d) => d.id === roomId));
    const a1 = await device(aName);
    await until(a1.store, (s) => s.dms.find((d) => d.id === roomId)?.encrypted);
    const a2 = await device(aName);
    await until(a2.store, (s) => s.dms.find((d) => d.id === roomId)?.encrypted);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await encryptionEvents(aToken, roomId)).toHaveLength(1);

    // New DMs start encrypted.
    const [cName] = await Promise.all([register('c')]);
    const c = await signIn(BASE, cName, PASSWORD);
    const dmId = await a1.store.openDm([c.userId]);
    await until(a1.store, (s) => s.dms.find((d) => d.id === dmId)?.encrypted);
    expect(await encryptionEvents(aToken, dmId)).toHaveLength(1);
  });

  it('never deletes a backup this device cannot read', async () => {
    const name = await register('bk');
    const token = (await signIn(BASE, name, PASSWORD)).accessToken;
    // A backup made elsewhere (another app) whose key this account doesn't have here.
    const made = await mx(token, 'POST', '/_matrix/client/v3/room_keys/version', { algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2', auth_data: { public_key: 'hSDwCYkwp1R0i33ctD73Wg2/Og0mOBr066SpjqqbTmo' } });
    const { store } = await device(name);
    expect(store.getSnapshot().security).toMatchObject({ device: 'confirmed', needsRecoveryKey: true });
    await expect(store.newRecoveryKey()).rejects.toThrow('backup-unreadable');
    const { body } = await mx(token, 'GET', '/_matrix/client/v3/room_keys/version');
    expect(body.version).toBe(made.body.version);
  });

  it('recovery key + backup round trip, emoji confirmation, reset', async () => {
    const [name, peerName] = await Promise.all([register('me'), register('peer')]);
    const peer = await signIn(BASE, peerName, PASSWORD);

    // First device: no identity yet → confirmed, asked for a recovery key.
    const one = await device(name);
    expect(one.store.getSnapshot().security).toMatchObject({ device: 'confirmed', needsRecoveryKey: true, otherConfirmedDevices: 0 });
    const key = await one.store.newRecoveryKey();
    expect(key).toMatch(/^Es[1-9A-HJ-NP-Za-km-z]{2}( [1-9A-HJ-NP-Za-km-z]{4}){11}$/);
    await until(one.store, (s) => !s.security.needsRecoveryKey);

    const dmId = await one.store.openDm([peer.userId]);
    one.store.sendText(dmId, 'only for us');
    one.store.openTimeline(dmId);
    await until(one.store, (s) => s.timelines[dmId]?.messages.find((m) => m.body === 'only for us' && m.status === 'sent'));
    expect(await backedUp(one.session.accessToken)).toBe(true);
    expect(await one.store.signOutRisk()).toBe('last-device');

    // Second device: unconfirmed until the recovery key; then older messages come from the backup.
    const two = await device(name);
    await until(two.store, (s) => s.security.device === 'unconfirmed' && s.security.otherConfirmedDevices === 1);
    expect(two.store.getSnapshot().security.needsRecoveryKey).toBe(false);
    await expect(two.store.useRecoveryKey(key.replace(/E/g, 'e'))).rejects.toThrow('wrong-key');
    await expect(two.store.useRecoveryKey('EsTc 3vJH 9pLm Qx2R 7nWd Kf4A Zb8Y Hu6G Ve1T Rs5C Pj0N Mq3X')).rejects.toThrow('wrong-key');
    await two.store.useRecoveryKey(`  ${key.replace(/ /g, '\n')} `);
    expect(two.store.getSnapshot().security.device).toBe('confirmed');
    two.store.openTimeline(dmId);
    const restored = await until(two.store, (s) => s.timelines[dmId]?.messages.find((m) => m.body === 'only for us'), 30_000);
    expect(restored.kind).toBe('text');
    expect(await one.store.signOutRisk()).toBe('none');

    // Third device: emoji confirmation. Both confirmed devices are asked; the one that answers wins, the other lets go.
    const three = await device(name);
    await until(three.store, (s) => s.security.device === 'unconfirmed' && s.security.otherConfirmedDevices === 2);
    // The other devices must have fetched the new device's keys first, or their crypto ignores the request.
    await new Promise((r) => setTimeout(r, 2000));
    three.store.requestConfirmation();
    await until(three.store, (s) => s.security.confirmation?.role === 'new' && s.security.confirmation.phase === 'waiting');
    await until(one.store, (s) => s.security.confirmation?.phase === 'asked');
    await until(two.store, (s) => s.security.confirmation?.phase === 'asked');
    expect(one.store.getSnapshot().security.confirmation?.role).toBe('approver');
    one.store.acceptConfirmation();
    const [mine, theirs] = await Promise.all([emojiOf(three.store), emojiOf(one.store)]);
    expect(mine).toBe(theirs);
    expect(mine.split(',')).toHaveLength(7);
    expect(mine.split(',').every((i) => Number(i) >= 0 && Number(i) < 64)).toBe(true);
    await until(two.store, (s) => !s.security.confirmation);
    three.store.confirmEmoji(true);
    await until(three.store, (s) => s.security.confirmation?.phase === 'matched' || s.security.confirmation?.phase === 'done');
    one.store.confirmEmoji(true);
    await until(three.store, (s) => s.security.confirmation?.phase === 'done');
    await until(one.store, (s) => s.security.confirmation?.phase === 'done');
    await until(three.store, (s) => s.security.device === 'confirmed');
    three.store.dismissConfirmation();
    await until(three.store, (s) => !s.security.confirmation);
    three.store.openTimeline(dmId);
    await until(three.store, (s) => s.timelines[dmId]?.messages.find((m) => m.body === 'only for us'), 30_000);

    // Reset: a wrong password changes nothing; the right one makes a new identity, so the other devices must confirm again.
    await expect(three.store.resetEncryption('not-the-password')).rejects.toThrow('wrong-password');
    expect((await mx(three.session.accessToken, 'GET', '/_matrix/client/v3/room_keys/version')).status).toBe(200);
    const fresh = await three.store.resetEncryption(PASSWORD);
    expect(fresh).not.toBe(key);
    expect(three.store.getSnapshot().security.device).toBe('confirmed');
    await until(one.store, (s) => s.security.device === 'unconfirmed', 20_000);
    await expect(one.store.useRecoveryKey(key)).rejects.toThrow('wrong-key');
    await one.store.useRecoveryKey(fresh);
  });
});
