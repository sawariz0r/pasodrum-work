// Integration tests against the local stack (pnpm dev:server, pnpm dev:seed). Run: pnpm test:invite
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { BASE, SEED_FILE, SERVER, login, mx } from '../../../dev/lib.ts';
import { keyFrom, unseal } from '../src/secret.ts';

const MAILPIT = 'http://localhost:8025';
type RoomKey = 'workspace' | 'general' | 'design' | 'lead' | 'nordlys' | 'projectUpdates' | 'questions';
const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { rooms: Record<RoomKey, string> };
const rooms = seed.rooms;
const devEnv = readFileSync(new URL('../../../dev/.env', import.meta.url), 'utf8');
const key = keyFrom(devEnv.match(/^INVITE_SECRET=(.+)$/m)![1]!.trim());

type Res = { status: number; body: any };
async function api(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const res = await fetch(`${BASE}/api/invites${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const freshEmail = (domain = 'example.com') => `t${randomBytes(4).toString('hex')}@${domain}`;
const localpartOf = (userId: string) => userId.slice(1, userId.indexOf(':'));

// Runs inside the invite container, which has node:sqlite and the database.
function db(sql: string, ...params: string[]): any {
  const script = `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/invites.db');
    const s=d.prepare(process.argv[1]);const p=JSON.parse(process.argv[2]);
    console.log(JSON.stringify(/^select/i.test(process.argv[1])?s.get(...p)??null:s.run(...p)));`;
  const out = execFileSync('docker', ['compose', '-f', 'dev/docker-compose.yml', '--env-file', 'dev/.env', 'exec', '-T', 'invite',
    'node', '-e', script, sql, JSON.stringify(params)], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  return JSON.parse(out.trim().split('\n').pop()!);
}

async function mailTo(email: string): Promise<{ Subject: string; HTML: string; Text: string; From: { Address: string } }> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((x) => x.json()) as any;
    if (r.messages?.length) return fetch(`${MAILPIT}/api/v1/message/${r.messages[0].ID}`).then((x) => x.json()) as any;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`no mail to ${email}`);
}

const spacesPath = (userId: string) => `/_matrix/client/v3/user/${encodeURIComponent(userId)}/account_data/work.pasodrum.spaces`;

const loginStatus = async (localpart: string, password: string) =>
  (await mx(null, 'POST', '/_matrix/client/v3/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: localpart }, password }));

let sofia = '', ingrid = '', jonas = '', henrik = '';
before(async () => {
  [sofia, ingrid, jonas, henrik] = await Promise.all([login('sofia'), login('ingrid'), login('jonas'), login('henrik_nordlys.no')]);
});

describe('invite service', () => {
  it('create → email → preview → claim → sign in; second claim is 410', async () => {
    const email = freshEmail();
    const r = await api(sofia, 'POST', '', { email, name: 'Test Person', role: 'member', spaceId: rooms.workspace, channelIds: [rooms.general], locale: 'en' });
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
    assert.ok(list.body.some((i: any) => i.code === r.body.code && i.email === email && i.role === 'member'));

    const c = await api(null, 'POST', `/${r.body.code}/claim`, { name: 'Tess Person', password: 'a-good-long-password' });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.deepEqual(c.body, { userId: r.body.userId, identifier: localpartOf(r.body.userId) });

    const token = await login(c.body.identifier, 'a-good-long-password');
    const profile = await mx(token, 'GET', `/_matrix/client/v3/profile/${encodeURIComponent(r.body.userId)}/displayname`);
    assert.equal(profile.body.displayname, 'Tess Person');

    assert.equal((await api(null, 'POST', `/${r.body.code}/claim`, { name: 'X', password: 'another-password' })).status, 410);
    assert.equal((await api(null, 'GET', `/${r.body.code}`)).body.state, 'used');
    assert.equal(db('SELECT secret FROM invites WHERE code = ?', r.body.code).secret, null);
  });

  it('409 when the account exists, 400 for a bad email, 401 without a token', async () => {
    const r = await api(sofia, 'POST', '', { email: 'Jonas@pasodrum.localhost', role: 'member', spaceId: rooms.workspace, channelIds: [] });
    assert.deepEqual([r.status, r.body], [409, { error: 'exists', userId: `@jonas:${SERVER}` }]);
    const bad = await api(sofia, 'POST', '', { email: 'not an email', role: 'guest', spaceId: rooms.workspace, channelIds: [] });
    assert.deepEqual([bad.status, bad.body], [400, { error: 'invalid-email' }]);
    assert.equal((await api(null, 'POST', '', { email: freshEmail(), role: 'guest', spaceId: rooms.workspace })).status, 401);
    assert.equal((await api('nope', 'POST', '', { email: freshEmail(), role: 'guest', spaceId: rooms.workspace })).status, 401);
  });

  it('enforces D-25: Members cannot add Members; clients cannot add clients; the team can', async () => {
    const m = await api(jonas, 'POST', '', { email: freshEmail(), role: 'member', spaceId: rooms.workspace, channelIds: [] });
    assert.deepEqual([m.status, m.body], [403, { error: 'not-allowed' }]);
    const c = await api(henrik, 'POST', '', { email: freshEmail('nordlys.no'), role: 'client', spaceId: rooms.nordlys, channelIds: [] });
    assert.equal(c.status, 403);
    const outsider = await api(henrik, 'POST', '', { email: freshEmail(), role: 'guest', spaceId: rooms.workspace, channelIds: [] });
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

  it('member invites a guest; resend; revoke kills only the code; re-invite issues a fresh one', async () => {
    const email = freshEmail('freelance.dev');
    const r = await api(jonas, 'POST', '', { email, role: 'guest', spaceId: rooms.workspace, channelIds: [rooms.design] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const localpart = localpartOf(r.body.userId);
    const temp = unseal(key, db('SELECT secret FROM invites WHERE code = ?', r.body.code).secret);

    assert.equal((await api(jonas, 'POST', `/${r.body.code}/resend`)).status, 204);
    assert.equal((await api(sofia, 'DELETE', `/${r.body.code}`)).status, 204);

    assert.equal((await api(null, 'GET', `/${r.body.code}`)).body.state, 'revoked');
    const dead = await api(null, 'POST', `/${r.body.code}/claim`, { name: 'Lea', password: 'a-good-long-password' });
    assert.deepEqual([dead.status, dead.body], [410, { error: 'revoked' }]);
    assert.equal((await api(jonas, 'POST', `/${r.body.code}/resend`)).status, 410);
    const list = await api(jonas, 'GET', `?roomId=${encodeURIComponent(rooms.design)}`);
    assert.ok(!list.body.some((i: any) => i.code === r.body.code));
    assert.equal((await loginStatus(localpart, temp)).status, 200, 'account stays dormant, not deactivated');

    const again = await api(sofia, 'POST', '', { email, name: 'Lea Again', role: 'guest', spaceId: rooms.workspace, channelIds: [rooms.general] });
    assert.equal(again.status, 201, JSON.stringify(again.body));
    assert.equal(again.body.userId, r.body.userId);
    assert.notEqual(again.body.code, r.body.code);
    const mails = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((x) => x.json()) as any;
    assert.equal(mails.messages.length, 3, 'invite, resend, re-invite');

    // A third invite supersedes the second code too.
    const third = await api(sofia, 'POST', '', { email, role: 'guest', spaceId: rooms.workspace, channelIds: [] });
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
    const after = await api(sofia, 'POST', '', { email, role: 'guest', spaceId: rooms.workspace, channelIds: [] });
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
    const b = await api(ingrid, 'POST', '', { email, role: 'guest', spaceId: rooms.workspace, channelIds: [rooms.design] });
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
    for (const [role, spaceId] of [['member', fake], ['guest', fake], ['client', marked]]) {
      const r = await api(jonas, 'POST', '', { email: freshEmail(), role, spaceId, channelIds: [] });
      assert.deepEqual([r.status, r.body], [403, { error: 'not-allowed' }], `${role} in a fake space`);
    }

    // Ingrid's pending invite: Jonas inviting the same email gets no code (it would claim the account), just "exists".
    const email = freshEmail();
    const mine = await api(ingrid, 'POST', '', { email, role: 'member', spaceId: rooms.workspace, channelIds: [rooms.general] });
    assert.equal(mine.status, 201);
    const theirs = await api(jonas, 'POST', '', { email, role: 'guest', spaceId: rooms.workspace, channelIds: [rooms.design] });
    assert.deepEqual([theirs.status, theirs.body], [409, { error: 'exists', userId: mine.body.userId }]);
    assert.equal((await api(null, 'GET', `/${mine.body.code}`)).body.state, 'open');

    // Codes and links in the pending list only for the inviter and Admins of the space.
    const own = await api(jonas, 'POST', '', { email: freshEmail(), role: 'guest', spaceId: rooms.workspace, channelIds: [rooms.general] });
    const seen = (await api(jonas, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`)).body.map((i: any) => i.code);
    assert.ok(seen.includes(own.body.code));
    assert.ok(!seen.includes(mine.body.code));
    assert.ok((await api(sofia, 'GET', `?roomId=${encodeURIComponent(rooms.general)}`)).body.some((i: any) => i.code === mine.body.code));
    for (const code of [mine.body.code, own.body.code]) await api(sofia, 'DELETE', `/${code}`);
    for (const id of [fake, marked]) await mx(jonas, 'POST', `/_matrix/client/v3/rooms/${encodeURIComponent(id)}/leave`, {});
  });

  it('expired codes cannot be claimed; unknown codes are 404; bad claims are 400', async () => {
    const r = await api(sofia, 'POST', '', { email: freshEmail(), role: 'guest', spaceId: rooms.workspace, channelIds: [] });
    assert.equal(r.status, 201);
    assert.equal((await api(null, 'POST', `/${r.body.code}/claim`, { name: 'A', password: 'short' })).status, 400);
    assert.equal((await api(null, 'POST', `/${r.body.code}/claim`, { name: ' ', password: 'long-enough-pw' })).status, 400);
    db('UPDATE invites SET expiresTs = 1 WHERE code = ?', r.body.code);
    assert.equal((await api(null, 'GET', `/${r.body.code}`)).body.state, 'expired');
    const c = await api(null, 'POST', `/${r.body.code}/claim`, { name: 'A', password: 'long-enough-pw' });
    assert.deepEqual([c.status, c.body], [410, { error: 'expired' }]);
    assert.equal((await api(null, 'GET', `/${'A'.repeat(24)}`)).status, 404);
  });

  it('translate is team only: clients and guests are 403, no token is 401', async () => {
    const translate = (token: string | null, body: unknown) => fetch(`${BASE}/api/translate`, {
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
