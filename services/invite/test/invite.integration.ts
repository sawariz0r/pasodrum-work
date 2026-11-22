// Integration tests against the local stack (pnpm dev:server, pnpm dev:seed). Run: pnpm test:invite
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { SEED_FILE, SERVER, login, mx, ok as mxOk } from '../../../dev/lib.ts';
import { powerLevels } from '../../../apps/web/src/matrix/levels.ts';
import { keyFrom, unseal } from '../src/secret.ts';
import { INVITE, MAILPIT, api, db, freshEmail, localpartOf, mailTo } from './helpers.ts';

type RoomKey = 'workspace' | 'general' | 'design' | 'lead' | 'nordlys' | 'projectUpdates' | 'questions';
const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { rooms: Record<RoomKey, string> };
const rooms = seed.rooms;
const devEnv = readFileSync(new URL('../../../dev/.env', import.meta.url), 'utf8');
const key = keyFrom(devEnv.match(/^INVITE_SECRET=(.+)$/m)![1]!.trim());

const accountData = (type: string) => (userId: string) => `/_matrix/client/v3/user/${encodeURIComponent(userId)}/account_data/${type}`;
const spacesPath = accountData('work.pasodrum.spaces');
const invitedPath = accountData('work.pasodrum.invited');
const enc = encodeURIComponent;

const loginStatus = async (localpart: string, password: string) =>
  (await mx(null, 'POST', '/_matrix/client/v3/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: localpart }, password }));

let sofia = '', ingrid = '', jonas = '', henrik = '';
// A client space of our own (marked by Sofia, so genuine) with Jonas as Staff at 10, and one channel in it.
let kumo = '', kumoChat = '';
before(async () => {
  [sofia, ingrid, jonas, henrik] = await Promise.all([login('sofia'), login('ingrid'), login('jonas'), login('henrik_nordlys.no')]);
  kumo = (await mxOk(sofia, 'POST', '/_matrix/client/v3/createRoom', {
    preset: 'private_chat', name: 'Kumo', creation_content: { type: 'm.space' },
    power_level_content_override: powerLevels('client', 'space', { [`@jonas:${SERVER}`]: 10 }),
    initial_state: [{ type: 'work.pasodrum.space', state_key: '', content: { kind: 'client' } }],
  })).room_id;
  kumoChat = (await mxOk(sofia, 'POST', '/_matrix/client/v3/createRoom', {
    preset: 'private_chat', name: 'chat',
    initial_state: [{ type: 'm.space.parent', state_key: kumo, content: { via: [SERVER], canonical: true } }],
  })).room_id;
  await mxOk(sofia, 'PUT', `/_matrix/client/v3/rooms/${enc(kumo)}/state/m.space.child/${enc(kumoChat)}`, { via: [SERVER] });
  for (const room of [kumo, kumoChat]) {
    await mxOk(sofia, 'POST', `/_matrix/client/v3/rooms/${enc(room)}/invite`, { user_id: `@jonas:${SERVER}` });
    await mxOk(jonas, 'POST', `/_matrix/client/v3/join/${enc(room)}`, {});
  }
});

describe('invite service', () => {
  it('create → email → preview → claim → sign in; second claim is 410', async () => {
    const email = freshEmail();
    const r = await api(sofia, 'POST', '', { email, name: 'Test Person', role: 'staff', spaceId: rooms.workspace, channelIds: [rooms.general], locale: 'en' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.userId, `@${email.replace('@', '_')}:${SERVER}`);
    assert.equal(r.body.emailed, true);
    assert.equal(r.body.link, `http://localhost:5173/join/${r.body.code}`);

    const mail = await mailTo(email);
    assert.equal(mail.Subject, 'Sofia Olsen added you to Pasodrum');
    assert.ok(mail.HTML.includes(`href="${r.body.link}"`));
    assert.ok(mail.Text.includes(r.body.link));

    const row = db('SELECT secret FROM invites WHERE code = ?', r.body.code);
    assert.ok(row.secret && !row.secret.includes(r.body.code), 'temporary password stored sealed');

    const p = await api(null, 'GET', `/${r.body.code}`);
    assert.equal(p.status, 200);
    assert.equal(p.body.state, 'open');
    assert.equal(p.body.spaceName, 'Pasodrum');
    assert.equal(p.body.spaceKind, 'workspace');
    assert.equal(p.body.inviter, 'Sofia Olsen');
    assert.equal(p.body.team[0].id, `@sofia:${SERVER}`);

    const list = await api(ingrid, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.some((i: any) => i.code === r.body.code && i.email === email && i.role === 'staff'));

    const c = await api(null, 'POST', `/${r.body.code}/claim`, { name: 'Tess Person', password: 'a-good-long-password' });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.deepEqual(c.body, { userId: r.body.userId, identifier: localpartOf(r.body.userId) });

    const token = await login(c.body.identifier, 'a-good-long-password');
    const profile = await mx(token, 'GET', `/_matrix/client/v3/profile/${encodeURIComponent(r.body.userId)}/displayname`);
    assert.equal(profile.body.displayname, 'Tess Person');
    assert.deepEqual((await mx(token, 'GET', invitedPath(r.body.userId))).body, { rooms: [rooms.workspace, rooms.general] });

    assert.equal((await api(null, 'POST', `/${r.body.code}/claim`, { name: 'X', password: 'another-password' })).status, 410);
    assert.equal((await api(null, 'GET', `/${r.body.code}`)).body.state, 'used');
    assert.equal(db('SELECT secret FROM invites WHERE code = ?', r.body.code).secret, null);
  });

  it('409 when the account exists, 400 for a bad email, 401 without a token', async () => {
    const r = await api(sofia, 'POST', '', { email: 'Jonas@pasodrum.localhost', role: 'staff', spaceId: rooms.workspace, channelIds: [] });
    assert.deepEqual([r.status, r.body], [409, { error: 'exists', userId: `@jonas:${SERVER}` }]);
    const bad = await api(sofia, 'POST', '', { email: 'not an email', role: 'external', spaceId: rooms.workspace, channelIds: [] });
    assert.deepEqual([bad.status, bad.body], [400, { error: 'invalid-email' }]);
    assert.equal((await api(null, 'POST', '', { email: freshEmail(), role: 'external', spaceId: rooms.workspace })).status, 401);
    assert.equal((await api('nope', 'POST', '', { email: freshEmail(), role: 'external', spaceId: rooms.workspace })).status, 401);
  });

  it('enforces D-36: Staff add no Staff or Externals; clients cannot add clients; the team can', async () => {
    for (const role of ['staff', 'external', 'member', 'guest']) {
      const m = await api(jonas, 'POST', '', { email: freshEmail(), role, spaceId: rooms.workspace, channelIds: [] });
      assert.deepEqual([m.status, m.body], [403, { error: 'not-allowed' }], role);
    }
    const c = await api(henrik, 'POST', '', { email: freshEmail('nordlys.no'), role: 'client', spaceId: rooms.nordlys, channelIds: [] });
    assert.equal(c.status, 403);
    const outsider = await api(henrik, 'POST', '', { email: freshEmail(), role: 'external', spaceId: rooms.workspace, channelIds: [] });
    assert.equal(outsider.status, 403);
    const email = freshEmail('nordlys.no');
    const ok = await api(ingrid, 'POST', '', { email, role: 'client', spaceId: rooms.nordlys, channelIds: [rooms.projectUpdates], locale: 'ja' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const mail = await mailTo(email);
    assert.equal(mail.Subject, 'Ingrid Holm さんが Nordlys にあなたを追加しました');
    // Jonas (Member) may not see or manage Ingrid's invite.
    assert.equal((await api(jonas, 'POST', `/${ok.body.code}/resend`)).status, 403);
    assert.equal((await api(jonas, 'GET', `?roomId=${encodeURIComponent(rooms.nordlys)}`)).status, 403);
  });

  it('an Admin invites an External; resend; revoke kills only the code; re-invite issues a fresh one', async () => {
    const email = freshEmail('freelance.dev');
    const r = await api(ingrid, 'POST', '', { email, role: 'external', spaceId: rooms.workspace, channelIds: [rooms.design] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const localpart = localpartOf(r.body.userId);
    const temp = unseal(key, db('SELECT secret FROM invites WHERE code = ?', r.body.code).secret);

    assert.equal((await api(jonas, 'POST', `/${r.body.code}/resend`)).status, 403);
    assert.equal((await api(ingrid, 'POST', `/${r.body.code}/resend`)).status, 204);
    assert.equal((await api(sofia, 'DELETE', `/${r.body.code}`)).status, 204);

    assert.equal((await api(null, 'GET', `/${r.body.code}`)).body.state, 'revoked');
    const dead = await api(null, 'POST', `/${r.body.code}/claim`, { name: 'Lea', password: 'a-good-long-password' });
    assert.deepEqual([dead.status, dead.body], [410, { error: 'revoked' }]);
    assert.equal((await api(ingrid, 'POST', `/${r.body.code}/resend`)).status, 410);
    const list = await api(ingrid, 'GET', `?roomId=${encodeURIComponent(rooms.design)}`);
    assert.ok(!list.body.some((i: any) => i.code === r.body.code));
    assert.equal((await loginStatus(localpart, temp)).status, 200, 'account stays dormant, not deactivated');

    const again = await api(sofia, 'POST', '', { email, name: 'Lea Again', role: 'external', spaceId: rooms.workspace, channelIds: [rooms.general] });
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal(again.body.userId, r.body.userId);
    assert.notEqual(again.body.code, r.body.code);
    const mails = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((x) => x.json()) as any;
    assert.equal(mails.messages.length, 3, 'invite, resend, re-invite');

    // A third invite supersedes the second code too.
    const third = await api(sofia, 'POST', '', { email, role: 'external', spaceId: rooms.workspace, channelIds: [] });
    assert.equal(third.status, 201);
    assert.equal((await api(null, 'GET', `/${again.body.code}`)).body.state, 'revoked');
    assert.ok((await api(sofia, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`)).body.some((i: any) => i.code === third.body.code));
    assert.ok(!(await api(jonas, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`)).body.some((i: any) => i.code === third.body.code), 'not Jonas’s invite');

    // A guest can't read the space it was added to, so claim leaves its name in account data (merged, not replaced).
    const temp3 = unseal(key, db('SELECT secret FROM invites WHERE code = ?', third.body.code).secret);
    const pre = await login(localpart, temp3);
    await mx(pre, 'PUT', spacesPath(r.body.userId), { '!other:x': { name: 'Other', kind: 'client' } });
    await mx(pre, 'POST', '/_matrix/client/v3/logout', {});

    const c = await api(null, 'POST', `/${third.body.code}/claim`, { name: 'Lea Fischer', password: 'a-good-long-password' });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const token = await login(c.body.identifier, 'a-good-long-password');
    assert.deepEqual((await mx(token, 'GET', spacesPath(r.body.userId))).body, {
      '!other:x': { name: 'Other', kind: 'client' },
      [rooms.workspace]: { name: 'Pasodrum', kind: 'workspace' },
    });
    const after = await api(sofia, 'POST', '', { email, role: 'external', spaceId: rooms.workspace, channelIds: [] });
    assert.deepEqual([after.status, after.body], [409, { error: 'exists', userId: r.body.userId }]);
  });

  it('remove from space: an Admin of the space revokes that person’s open codes there, and only there (D-28)', async () => {
    const email = freshEmail('nordlys.no');
    const r = await api(ingrid, 'POST', '', { email, role: 'client', spaceId: rooms.nordlys, channelIds: [rooms.projectUpdates] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const q = (spaceId: string) => `?spaceId=${encodeURIComponent(spaceId)}&userId=${encodeURIComponent(r.body.userId)}`;
    assert.equal((await api(jonas, 'DELETE', q(rooms.nordlys))).status, 403, 'not in the client space');
    assert.equal((await api(henrik, 'DELETE', q(rooms.nordlys))).status, 403, 'a client');
    assert.equal((await api(null, 'DELETE', q(rooms.nordlys))).status, 401);
    assert.equal((await api(ingrid, 'DELETE', `?spaceId=${encodeURIComponent(rooms.nordlys)}`)).status, 400);

    const ok = await api(ingrid, 'DELETE', q(rooms.nordlys));
    assert.deepEqual([ok.status, ok.body], [200, { revoked: 1 }]);
    assert.equal((await api(null, 'GET', `/${r.body.code}`)).body.state, 'revoked');
    assert.deepEqual((await api(sofia, 'DELETE', q(rooms.nordlys))).body, { revoked: 0 });

  });

  it('codes are per space: removing someone from one space leaves their link for another; claiming one kills the rest', async () => {
    const email = freshEmail('nordlys.no');
    const a = await api(ingrid, 'POST', '', { email, role: 'client', spaceId: rooms.nordlys, channelIds: [rooms.projectUpdates] });
    const b = await api(ingrid, 'POST', '', { email, role: 'external', spaceId: rooms.workspace, channelIds: [rooms.design] });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal((await api(null, 'GET', `/${a.body.code}`)).body.state, 'open');
    const q = `?spaceId=${encodeURIComponent(rooms.nordlys)}&userId=${encodeURIComponent(a.body.userId)}`;
    assert.deepEqual((await api(ingrid, 'DELETE', q)).body, { revoked: 1 });
    assert.equal((await api(null, 'GET', `/${b.body.code}`)).body.state, 'open');

    const c = await api(ingrid, 'POST', '', { email, role: 'client', spaceId: rooms.nordlys, channelIds: [rooms.questions] });
    assert.equal((await api(null, 'POST', `/${b.body.code}/claim`, { name: 'Per Space', password: 'a-good-long-password' })).status, 200);
    assert.equal((await api(null, 'GET', `/${c.body.code}`)).body.state, 'revoked');
  });

  it('D-06: only real spaces count; a code that claims an account goes only to whoever manages its invite', async () => {
    // A room anyone can make, posing as a workspace or a client space.
    const fake = (await mx(jonas, 'POST', '/_matrix/client/v3/createRoom', { preset: 'private_chat', creation_content: { type: 'm.space' }, name: 'Pasodrum' })).body.room_id;
    const marked = (await mx(jonas, 'POST', '/_matrix/client/v3/createRoom', {
      preset: 'private_chat', creation_content: { type: 'm.space' }, name: 'Acme',
      initial_state: [{ type: 'work.pasodrum.space', state_key: '', content: { kind: 'client' } }],
    })).body.room_id;
    for (const [role, spaceId] of [['staff', fake], ['external', fake], ['client', marked]]) {
      const r = await api(jonas, 'POST', '', { email: freshEmail(), role, spaceId, channelIds: [] });
      assert.deepEqual([r.status, r.body], [403, { error: 'not-allowed' }], `${role} in a fake space`);
    }

    // Ingrid's pending invite: Jonas (Staff on Kumo) inviting the same email gets no code (it would claim the account), just "exists".
    const email = freshEmail();
    const mine = await api(ingrid, 'POST', '', { email, role: 'staff', spaceId: rooms.workspace, channelIds: [rooms.general] });
    assert.equal(mine.status, 201);
    const theirs = await api(jonas, 'POST', '', { email, role: 'client', spaceId: kumo, channelIds: [kumoChat] });
    assert.deepEqual([theirs.status, theirs.body], [409, { error: 'exists', userId: mine.body.userId }]);
    assert.equal((await api(null, 'GET', `/${mine.body.code}`)).body.state, 'open');

    // Codes and links in the pending list only for the inviter and Admins of the space.
    const own = await api(jonas, 'POST', '', { email: freshEmail(), role: 'client', spaceId: kumo, channelIds: [kumoChat] });
    assert.ok((await api(jonas, 'GET', `?roomId=${encodeURIComponent(kumoChat)}`)).body.some((i: any) => i.code === own.body.code));
    assert.ok(!(await api(jonas, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`)).body.some((i: any) => i.code === mine.body.code));
    assert.ok((await api(sofia, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`)).body.some((i: any) => i.code === mine.body.code));
    for (const code of [mine.body.code, own.body.code]) await api(sofia, 'DELETE', `/${code}`);
    for (const id of [fake, marked]) await mx(jonas, 'POST', `/_matrix/client/v3/rooms/${encodeURIComponent(id)}/leave`, {});
  });

  it('expired codes cannot be claimed; unknown codes are 404; bad claims are 400', async () => {
    const r = await api(sofia, 'POST', '', { email: freshEmail(), role: 'external', spaceId: rooms.workspace, channelIds: [] });
    assert.equal(r.status, 201);
    assert.equal((await api(null, 'POST', `/${r.body.code}/claim`, { name: 'A', password: 'short' })).status, 400);
    assert.equal((await api(null, 'POST', `/${r.body.code}/claim`, { name: ' ', password: 'long-enough-pw' })).status, 400);
    db('UPDATE invites SET expiresTs = 1 WHERE code = ?', r.body.code);
    assert.equal((await api(null, 'GET', `/${r.body.code}`)).body.state, 'expired');
    const c = await api(null, 'POST', `/${r.body.code}/claim`, { name: 'A', password: 'long-enough-pw' });
    assert.deepEqual([c.status, c.body], [410, { error: 'expired' }]);
    assert.equal((await api(null, 'GET', `/${'A'.repeat(24)}`)).status, 404);
  });

  it('D-36: Staff at 10 on a client space invite its clients, nowhere else', async () => {
    const r = await api(jonas, 'POST', '', { email: freshEmail('kumo.jp'), role: 'client', spaceId: kumo, channelIds: [kumoChat] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const nordlys = await api(jonas, 'POST', '', { email: freshEmail('nordlys.no'), role: 'client', spaceId: rooms.nordlys, channelIds: [] });
    assert.equal(nordlys.status, 403, 'not on that client space');
    for (const role of ['staff', 'external']) assert.equal((await api(jonas, 'POST', '', { email: freshEmail(), role, spaceId: kumo, channelIds: [] })).status, 403);
    await api(jonas, 'DELETE', `/${r.body.code}`);
  });

  it('D-36: an External gets only workspace channels and genuine client spaces the inviter is in', async () => {
    const email = freshEmail('freelance.dev');
    const ok = await api(ingrid, 'POST', '', { email, role: 'external', spaceId: rooms.workspace, channelIds: [rooms.design, rooms.nordlys, rooms.projectUpdates] });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));

    // Rooms Jonas makes and Ingrid joins: a stray room, a client space marked by Staff, a channel claiming Nordlys as its parent.
    const make = async (body: object) => {
      const id = (await mxOk(jonas, 'POST', '/_matrix/client/v3/createRoom', { preset: 'private_chat', ...body })).room_id;
      await mxOk(jonas, 'POST', `/_matrix/client/v3/rooms/${enc(id)}/invite`, { user_id: `@ingrid:${SERVER}` });
      await mxOk(ingrid, 'POST', `/_matrix/client/v3/join/${enc(id)}`, {});
      return id;
    };
    const stray = await make({ name: 'stray' });
    const fakeClient = await make({ name: 'Acme', creation_content: { type: 'm.space' }, initial_state: [{ type: 'work.pasodrum.space', state_key: '', content: { kind: 'client' } }] });
    const fakeChild = await make({ name: 'sneaky', initial_state: [{ type: 'm.space.parent', state_key: rooms.nordlys, content: { via: [SERVER] } }] });
    const cases: [string, string[], string][] = [
      ['stray room', [rooms.design, stray], rooms.workspace],
      ['client space marked by Staff', [fakeClient], rooms.workspace],
      ['channel claiming a client space', [fakeChild], rooms.workspace],
      ['client space the inviter is not in', [kumo], rooms.workspace],
      ['the workspace itself', [rooms.workspace], rooms.workspace],
      ['filed under a client space', [rooms.projectUpdates], rooms.nordlys],
    ];
    for (const [what, channelIds, spaceId] of cases) {
      const r = await api(ingrid, 'POST', '', { email: freshEmail(), role: 'external', spaceId, channelIds });
      assert.deepEqual([r.status, r.body], [403, { error: 'not-allowed' }], what);
    }
    // Sofia is in Kumo and its channel, so she may hand them out.
    const kumoOk = await api(sofia, 'POST', '', { email: freshEmail(), role: 'external', spaceId: rooms.workspace, channelIds: [kumo, kumoChat] });
    assert.equal(kumoOk.status, 201, JSON.stringify(kumoOk.body));
    await api(sofia, 'DELETE', `/${kumoOk.body.code}`);

    // Claim leaves the rooms a fresh account may auto-accept (merged; never the workspace).
    const userId = ok.body.userId;
    const pre = await login(localpartOf(userId), unseal(key, db('SELECT secret FROM invites WHERE code = ?', ok.body.code).secret));
    await mx(pre, 'PUT', invitedPath(userId), { rooms: ['!old:x'] });
    await mx(pre, 'POST', '/_matrix/client/v3/logout', {});
    assert.equal((await api(null, 'POST', `/${ok.body.code}/claim`, { name: 'Ola', password: 'a-good-long-password' })).status, 200);
    const token = await login(localpartOf(userId), 'a-good-long-password');
    assert.deepEqual((await mx(token, 'GET', invitedPath(userId))).body, { rooms: ['!old:x', rooms.design, rooms.nordlys, rooms.projectUpdates] });
    for (const id of [stray, fakeClient, fakeChild]) {
      for (const t of [jonas, ingrid]) await mx(t, 'POST', `/_matrix/client/v3/rooms/${enc(id)}/leave`, {});
    }
  });

  it('D-36: pending invites from before keep working and read as staff/external', async () => {
    const a = await api(sofia, 'POST', '', { email: freshEmail(), role: 'member', spaceId: rooms.workspace, channelIds: [rooms.general] });
    const b = await api(sofia, 'POST', '', { email: freshEmail(), role: 'staff', spaceId: rooms.workspace, channelIds: [rooms.general] });
    assert.equal(a.status, 201, 'old name in a request body');
    db("UPDATE invites SET role = 'guest' WHERE code = ?", b.body.code);
    assert.equal(db('SELECT role FROM invites WHERE code = ?', a.body.code).role, 'staff');
    const list = (await api(sofia, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`)).body;
    assert.equal(list.find((i: any) => i.code === a.body.code).role, 'staff');
    assert.equal(list.find((i: any) => i.code === b.body.code).role, 'external');
    db("UPDATE invites SET role = 'member' WHERE code = ?", a.body.code);
    assert.equal((await api(sofia, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`)).body.find((i: any) => i.code === a.body.code).role, 'staff');
    assert.equal((await api(null, 'POST', `/${b.body.code}/claim`, { name: 'Old Guest', password: 'a-good-long-password' })).status, 200);
    const token = await login(localpartOf(b.body.userId), 'a-good-long-password');
    assert.deepEqual((await mx(token, 'GET', invitedPath(b.body.userId))).body, { rooms: [rooms.general] });
    await api(sofia, 'DELETE', `/${a.body.code}`);
  });

  it('D-36: revoke-all is Owner/Admin only and kills a person’s codes in every space', async () => {
    const email = freshEmail();
    const a = await api(jonas, 'POST', '', { email, role: 'client', spaceId: kumo, channelIds: [kumoChat] });
    const b = await api(sofia, 'POST', '', { email, role: 'external', spaceId: rooms.workspace, channelIds: [rooms.design] });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    const q = `/person?userId=${encodeURIComponent(a.body.userId)}`;
    assert.equal((await api(jonas, 'DELETE', q)).status, 403, 'Staff');
    assert.equal((await api(henrik, 'DELETE', q)).status, 403, 'a client');
    assert.equal((await api(null, 'DELETE', q)).status, 401);
    assert.equal((await api(ingrid, 'DELETE', '/person')).status, 400);
    for (const code of [a.body.code, b.body.code]) assert.equal((await api(null, 'GET', `/${code}`)).body.state, 'open');
    assert.deepEqual((await api(ingrid, 'DELETE', q)).body, { revoked: 2 });
    for (const code of [a.body.code, b.body.code]) assert.equal((await api(null, 'GET', `/${code}`)).body.state, 'revoked');
    assert.deepEqual((await api(sofia, 'DELETE', q)).body, { revoked: 0 });
  });

  it('DES-05: revoke-space is for Owners of that client space; it kills its open codes and no other space’s', async () => {
    const a = await api(jonas, 'POST', '', { email: freshEmail(), role: 'client', spaceId: kumo, channelIds: [kumoChat] });
    const b = await api(ingrid, 'POST', '', { email: freshEmail('nordlys.no'), role: 'client', spaceId: rooms.nordlys, channelIds: [rooms.projectUpdates] });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(b.status, 201, JSON.stringify(b.body));
    const q = (spaceId: string) => `/space?spaceId=${encodeURIComponent(spaceId)}`;
    assert.equal((await api(ingrid, 'DELETE', q(rooms.nordlys))).status, 403, 'an Admin');
    assert.equal((await api(jonas, 'DELETE', q(kumo))).status, 403, 'Staff');
    assert.equal((await api(henrik, 'DELETE', q(rooms.nordlys))).status, 403, 'a client');
    assert.equal((await api(sofia, 'DELETE', q(rooms.workspace))).status, 403, 'the workspace');
    // An Admin who created a client space outranks everyone in it (room v12), but isn't an Owner of the workspace.
    const own = (await mxOk(ingrid, 'POST', '/_matrix/client/v3/createRoom', {
      preset: 'private_chat', name: 'Own', creation_content: { type: 'm.space' },
      initial_state: [{ type: 'work.pasodrum.space', state_key: '', content: { kind: 'client' } }],
    })).room_id;
    assert.equal((await api(ingrid, 'DELETE', q(own))).status, 403, 'a creator who is an Admin');
    await mx(ingrid, 'POST', `/_matrix/client/v3/rooms/${enc(own)}/leave`, {});
    assert.equal((await api(null, 'DELETE', q(kumo))).status, 401);
    assert.equal((await api(sofia, 'DELETE', '/space')).status, 400);
    for (const code of [a.body.code, b.body.code]) assert.equal((await api(null, 'GET', `/${code}`)).body.state, 'open');

    const ok = await api(sofia, 'DELETE', q(kumo));
    assert.equal(ok.status, 200);
    assert.ok(ok.body.revoked >= 1);
    assert.equal((await api(null, 'GET', `/${a.body.code}`)).body.state, 'revoked');
    assert.equal((await api(null, 'GET', `/${b.body.code}`)).body.state, 'open');
    await api(sofia, 'DELETE', `/${b.body.code}`);
  });

  it('translate is team only: clients and guests are 403, no token is 401', async () => {
    const translate = (token: string | null, body: unknown) => fetch(INVITE.replace(/invites$/, 'translate'), {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.status);
    const ok = { segments: ['Hei ⟦0⟧'], to: 'en' };
    assert.equal(await translate(null, ok), 401);
    assert.equal(await translate(henrik, ok), 403);
    assert.equal(await translate(await login('lea_freelance.dev'), ok), 403);
    // Past the gate: 400 for a bad body, or 503 when the dev stack has no OpenAI key.
    assert.ok([400, 503].includes(await translate(jonas, { segments: [], to: 'en' })));
  });
});
