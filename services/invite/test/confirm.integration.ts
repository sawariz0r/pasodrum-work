// D-38 confirm by email, against the local stack (pnpm dev:server, pnpm dev:seed, pnpm add:system). Run: pnpm test:invite
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { SEED_FILE, SERVER, enc, login, mx } from '../../../dev/lib.ts';
import { api, db, freshEmail, mailTo } from './helpers.ts';

const rooms = (JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { rooms: Record<string, string> }).rooms;
const KEY = 'EsTc 8Kq2 Fake Reco very Key0 1234 5678 9abc defg hijk';
const SYSTEM = `@pasodrum:${SERVER}`;

const signIn = async (localpart: string, password: string, device: string) =>
  (await mx(null, 'POST', '/_matrix/client/v3/login', {
    type: 'm.login.password', identifier: { type: 'm.id.user', user: localpart }, password, initial_device_display_name: device,
  })).body.access_token as string;
// One start a minute per person; tests move earlier links back in time instead of waiting.
const unthrottle = (userId: string) => db('UPDATE confirm_requests SET createdTs = createdTs - 120000 WHERE userId = ?', userId);
const latestCode = (userId: string) => db('SELECT code FROM confirm_requests WHERE userId = ? ORDER BY createdTs DESC', userId).code as string;

// A client Ingrid adds to Nordlys, signed in on two devices.
let email = '', client = '', deviceA = '', deviceB = '', henrik = '', ingrid = '';
before(async () => {
  ingrid = await login('ingrid');
  henrik = await login('henrik_nordlys.no');
  email = freshEmail('nordlys.no');
  const r = await api(ingrid, 'POST', '', { email, name: 'Kari Nord', role: 'client', spaceId: rooms.nordlys, channelIds: [rooms.projectUpdates] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const c = await api(null, 'POST', `/${r.body.code}/claim`, { name: 'Kari Nord', password: 'a-good-long-password' });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  client = c.body.userId;
  deviceA = await signIn(c.body.identifier, 'a-good-long-password', 'Chrome on Mac');
  deviceB = await signIn(c.body.identifier, 'a-good-long-password', 'Safari on iPhone');
});

describe('confirm by email (D-38)', () => {
  it('the key goes only to the device that asked, only after the tap, only once', async () => {
    assert.equal((await api(deviceA, 'POST', '/confirm/key', { key: KEY, keyId: 'k1' })).status, 204);
    const me = await api(deviceB, 'GET', '/confirm/me');
    assert.deepEqual(me.body, { email, keyId: 'k1', contact: { id: `@ingrid:${SERVER}`, name: 'Ingrid Holm' } });

    const s = await api(deviceB, 'POST', '/confirm/start', { locale: 'en', tz: 'Asia/Tokyo' });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.email, email);
    const mail = await mailTo(email);
    assert.equal(mail.Subject, 'Confirm it’s you on Safari on iPhone');
    const code = mail.Text.match(/\/confirm\/([A-Za-z0-9_-]{24})/)![1]!;
    assert.ok(mail.HTML.includes(`/confirm/${code}"`));

    assert.deepEqual((await api(deviceB, 'POST', '/confirm/collect')).body, { error: 'not-confirmed' });
    const opened = await api(null, 'GET', `/confirm/${code}`);
    assert.equal(opened.body.state, 'open');
    assert.equal(opened.body.device, 'Safari on iPhone');
    assert.equal(opened.body.contact, 'Ingrid Holm');
    assert.equal((await api(deviceB, 'GET', '/confirm/status')).body.state, 'pending', 'opening the link confirms nothing');
    assert.equal(db('SELECT confirmedTs FROM confirm_requests WHERE code = ?', code).confirmedTs, null);

    assert.deepEqual((await api(null, 'POST', `/confirm/${code}`)).body, { device: 'Safari on iPhone' });
    for (const other of [deviceA, henrik]) {
      const r = await api(other, 'POST', '/confirm/collect');
      assert.equal(r.status, 410);
      assert.ok(!JSON.stringify(r.body).includes(KEY));
    }
    assert.equal((await api(deviceB, 'GET', '/confirm/status')).body.state, 'confirmed');
    assert.deepEqual(await api(deviceB, 'POST', '/confirm/collect'), { status: 200, body: { key: KEY } });
    assert.equal((await api(deviceB, 'POST', '/confirm/collect')).status, 410);
    assert.equal((await api(null, 'POST', `/confirm/${code}`)).status, 410);
    assert.equal((await api(null, 'GET', `/confirm/${code}`)).body.state, 'gone');
    assert.equal((await api(deviceB, 'GET', '/confirm/status')).body.state, 'none');

    const row = db('SELECT sealed FROM confirm_keys WHERE userId = ?', client);
    assert.ok(row.sealed && !row.sealed.includes(KEY) && !Buffer.from(row.sealed, 'base64url').toString('utf8').includes('Fake'), 'held sealed');

    // A second sign-in that reuses the waiting device's ID (someone with the password) gets nothing either.
    unthrottle(client);
    const identifier = client.slice(1, client.indexOf(':'));
    const deviceC = await signIn(identifier, 'a-good-long-password', 'Firefox on Linux');
    const deviceId = (await mx(deviceC, 'GET', '/_matrix/client/v3/account/whoami')).body.device_id as string;
    assert.equal((await api(deviceC, 'POST', '/confirm/start', { locale: 'en' })).status, 200);
    assert.equal((await api(null, 'POST', `/confirm/${latestCode(client)}`)).status, 200);
    const reuse = (await mx(null, 'POST', '/_matrix/client/v3/login', {
      type: 'm.login.password', identifier: { type: 'm.id.user', user: identifier }, password: 'a-good-long-password', device_id: deviceId,
    })).body.access_token as string;
    assert.equal((await api(reuse, 'GET', '/confirm/status')).body.state, 'none');
    assert.equal((await api(reuse, 'POST', '/confirm/collect')).status, 410);
  });

  it('a new email kills the old link; an expired link does nothing', async () => {
    unthrottle(client);
    assert.equal((await api(deviceB, 'POST', '/confirm/start', { locale: 'ja' })).status, 200);
    const first = latestCode(client);
    const again = await api(deviceB, 'POST', '/confirm/start', { locale: 'ja' });
    assert.equal(again.status, 429);
    assert.ok(again.body.canResendAt > Date.now());
    unthrottle(client);
    assert.equal((await api(deviceB, 'POST', '/confirm/start', { locale: 'ja' })).status, 200);
    const second = latestCode(client);
    assert.notEqual(first, second);
    assert.equal((await api(null, 'GET', `/confirm/${first}`)).body.state, 'gone');
    assert.equal((await api(null, 'POST', `/confirm/${first}`)).status, 410);
    assert.equal((await api(null, 'GET', `/confirm/${second}`)).body.state, 'open');

    db('UPDATE confirm_requests SET expiresTs = 1 WHERE code = ?', second);
    assert.equal((await api(null, 'GET', `/confirm/${second}`)).body.state, 'gone');
    assert.equal((await api(null, 'POST', `/confirm/${second}`)).status, 410);
    assert.equal((await api(deviceB, 'GET', '/confirm/status')).body.state, 'none');
    assert.equal((await api(deviceB, 'POST', '/confirm/collect')).status, 410);
  });

  it('staff never hand over a key, and any held one is dropped', async () => {
    const [sofia, jonas] = await Promise.all([login('sofia'), login('jonas')]);
    db("INSERT OR REPLACE INTO confirm_keys VALUES (?, 'x.y.z', 'k', 0)", `@jonas:${SERVER}`);
    for (const token of [sofia, jonas]) {
      assert.deepEqual(await api(token, 'POST', '/confirm/key', { key: KEY, keyId: 'k1' }), { status: 403, body: { error: 'staff' } });
      assert.deepEqual(await api(token, 'POST', '/confirm/start', { locale: 'en' }), { status: 403, body: { error: 'staff' } });
    }
    for (const who of ['sofia', 'jonas']) assert.equal(db('SELECT * FROM confirm_keys WHERE userId = ?', `@${who}:${SERVER}`), null);
  });

  it('help: one read-only DM to the inviter, nothing secret, at most once in 10 minutes', async () => {
    const r = await api(deviceB, 'POST', '/confirm/help', { reason: 'email-missing', tz: 'Europe/Oslo' });
    assert.deepEqual([r.status, r.body], [200, { contact: { id: `@ingrid:${SERVER}`, name: 'Ingrid Holm' }, sent: true }]);
    assert.deepEqual((await api(deviceA, 'POST', '/confirm/help', { reason: 'stuck' })).body.sent, false);
    const code = latestCode(client);
    assert.deepEqual((await api(null, 'POST', `/confirm/${code}/help`, {})).body, { contact: { name: 'Ingrid Holm' }, sent: false });

    const roomId = db('SELECT roomId FROM help_rooms WHERE contactId = ?', `@ingrid:${SERVER}`).roomId;
    assert.equal((await mx(ingrid, 'POST', `/_matrix/client/v3/join/${enc(roomId)}`, {})).status, 200);
    const page = (await mx(ingrid, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/messages?dir=b&limit=50`)).body;
    const mine = page.chunk.filter((e: any) => e.content?.['work.pasodrum.help']?.user_id === client);
    assert.equal(mine.length, 1);
    const [msg] = mine;
    assert.equal(msg.sender, SYSTEM);
    assert.match(msg.content.body, /^Kari Nord needs your help\nThe email to confirm their new device didn’t arrive\.\nNordlys · .+ · their time \d\d:\d\d$/);
    assert.ok(msg.content.body.includes(email));
    assert.deepEqual({ ...msg.content['work.pasodrum.help'], local_time: undefined }, {
      user_id: client, name: 'Kari Nord', space_id: rooms.nordlys, space_name: 'Nordlys', reason: 'email-missing', email, local_time: undefined, tz: 'Europe/Oslo',
    });
    const all = JSON.stringify(msg.content);
    assert.ok(!all.includes(code) && !all.includes(KEY) && !all.includes('/confirm/'), 'no code, key or link');
    const post = await mx(ingrid, 'PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/send/m.room.message/t${Date.now()}`, { msgtype: 'm.text', body: 'hi' });
    assert.equal(post.status, 403, 'read-only');
    assert.equal((await mx(ingrid, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.encryption/`)).status, 404, 'not encrypted');
  });

  // SIDE-05: Sofia (Nordlys's Owner) marked as its main contact; Ingrid added the client.
  it('help goes to the main contact, not the inviter', async () => {
    const r = await api(ingrid, 'POST', '', { email: freshEmail('nordlys.no'), name: 'Ola Nord', role: 'client', spaceId: rooms.nordlys, channelIds: [rooms.projectUpdates] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const c = await api(null, 'POST', `/${r.body.code}/claim`, { name: 'Ola Nord', password: 'a-good-long-password' });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const ola = c.body.userId as string;
    const device = await signIn(c.body.identifier, 'a-good-long-password', 'Chrome on Mac');
    // Ingrid's app invites and Ola's app joins; the service reads the space with the client's own token.
    assert.equal((await mx(ingrid, 'POST', `/_matrix/client/v3/rooms/${enc(rooms.nordlys!)}/invite`, { user_id: ola })).status, 200);
    assert.equal((await mx(device, 'POST', `/_matrix/client/v3/join/${enc(rooms.nordlys!)}`, {})).status, 200);

    const sofia = await login('sofia');
    const sofiaId = `@sofia:${SERVER}`;
    const path = `/_matrix/client/v3/rooms/${enc(rooms.nordlys!)}/state/work.pasodrum.space/`;
    const original = (await mx(sofia, 'GET', path)).body;
    assert.equal(original.kind, 'client');
    assert.equal((await mx(sofia, 'PUT', path, { ...original, contacts: [sofiaId] })).status, 200);
    try {
      const contact = { id: sofiaId, name: 'Sofia Olsen' };
      assert.deepEqual((await api(device, 'GET', '/confirm/me')).body.contact, contact);
      const h = await api(device, 'POST', '/confirm/help', { reason: 'email-missing' });
      assert.deepEqual([h.status, h.body], [200, { contact, sent: true }]);

      const forOla = async (token: string, contactId: string) => {
        const roomId = db('SELECT roomId FROM help_rooms WHERE contactId = ?', contactId)?.roomId as string | undefined;
        if (!roomId) return [];
        assert.equal((await mx(token, 'POST', `/_matrix/client/v3/join/${enc(roomId)}`, {})).status, 200);
        const page = (await mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/messages?dir=b&limit=50`)).body;
        return page.chunk.filter((e: any) => e.content?.['work.pasodrum.help']?.user_id === ola);
      };
      assert.equal((await forOla(sofia, sofiaId)).length, 1);
      assert.equal((await forOla(ingrid, `@ingrid:${SERVER}`)).length, 0);
    } finally {
      assert.equal((await mx(sofia, 'PUT', path, original)).status, 200);
    }
  });
});
