// D-36 isolation against the seeded local server + invite service: pnpm dev:server && pnpm dev:seed && pnpm test:matrix
// Fresh accounts each run: an External, a client in each of two new client spaces, and fresh accounts for auto-accept.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorkspaceStore, signIn } from './index';
import { BASE, mx, open, PASSWORD, setupIntegration, stores, until } from './integration.helpers';

setupIntegration();
globalThis.location = { origin: BASE } as Location;

const E = encodeURIComponent;
const ROOT = new URL('../../../../', import.meta.url);
const regToken = () => process.env.REGISTRATION_TOKEN ?? readFileSync(new URL('dev/.env', ROOT), 'utf8').match(/^REGISTRATION_TOKEN=(.+)$/m)![1]!.trim();
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function register(label: string) {
  const username = `pa${label}${stamp()}`;
  const post = async (body: object) => {
    const res = await fetch(`${BASE}/_matrix/client/v3/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const first = await post({ username, password: PASSWORD });
  const done = await post({ username, password: PASSWORD, auth: { type: 'm.login.registration_token', token: regToken(), session: first.body.session } });
  expect(done.status).toBe(200);
  return { username, userId: done.body.user_id as string, token: done.body.access_token as string };
}
type Account = Awaited<ReturnType<typeof register>>;

const join = async (token: string, roomId: string) => (await mx(token, 'POST', `/_matrix/client/v3/join/${E(roomId)}`)).status;
const membership = async (token: string, roomId: string, userId: string) =>
  (await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(roomId)}/state/m.room.member/${E(userId)}`)).body.membership as string | undefined;
const childrenOf = async (token: string, spaceId: string) => {
  const all = (await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(spaceId)}/state`)).body as unknown as { type: string; state_key: string; content: { via?: string[] } }[];
  return all.filter((e) => e.type === 'm.space.child' && e.content.via?.length).map((e) => e.state_key);
};
const lockedOut = async (token: string) => {
  const res = await mx(token, 'GET', '/_matrix/client/v3/account/whoami');
  return res.status === 401 && res.body.errcode === 'M_USER_LOCKED';
};
const hierarchyStatus = async (token: string, spaceId: string) => (await mx(token, 'GET', `/_matrix/client/v1/rooms/${E(spaceId)}/hierarchy`)).status;
const migrate = () => execFileSync('node', ['dev/migrate-people.ts'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MATRIX_BASE: BASE } });

let sofia: Awaited<ReturnType<typeof open>>;
let owner: string;
let workspace: string;
let ext: Account;
let a: { account: Account; spaceId: string; channelId: string; app?: Awaited<ReturnType<typeof open>> };
let b: typeof a;
let w1: string;
let w2: string;
const roleIds: string[] = [];

beforeAll(async () => {
  sofia = await open('sofia');
  owner = sofia.session.accessToken;
  workspace = sofia.store.getSnapshot().spaces.find((s) => s.kind === 'workspace')!.id;
  const s = stamp();
  w1 = await sofia.store.createChannel({ spaceId: workspace, name: `pa-w1-${s}`, private: false });
  w2 = await sofia.store.createChannel({ spaceId: workspace, name: `pa-w2-${s}`, private: false });
  const client = async (label: string) => {
    const account = await register(label);
    const made = await sofia.store.createClientSpace({ name: `PA ${label} ${s}`, colour: '#3f7d6e', channels: ['hello', 'files'], team: [], clientEmails: [] });
    for (const roomId of [made.spaceId, made.channelId]) {
      await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/invite`, { user_id: account.userId });
      expect(await join(account.token, roomId)).toBe(200);
    }
    return { account, ...made };
  };
  // One at a time: room version 12 derives the ID from the create event, so rooms made in the same millisecond collide.
  ext = await register('ext');
  a = await client('a');
  b = await client('b');
  a.app = await open(a.account.username);
  b.app = await open(b.account.username);
});

afterAll(async () => {
  for (const id of roleIds) await sofia.store.deleteAccessRole(id).catch(() => {});
  for (const spaceId of [a?.spaceId, b?.spaceId].filter(Boolean) as string[]) {
    for (const roomId of [...(await childrenOf(owner, spaceId)), spaceId]) {
      await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/leave`);
      await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/forget`);
    }
  }
  for (const roomId of [w1, w2].filter(Boolean)) {
    await mx(owner, 'PUT', `/_matrix/client/v3/rooms/${E(workspace)}/state/m.space.child/${E(roomId)}`, {});
    await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/leave`);
    await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/forget`);
  }
});

describe('D-36 isolation', () => {
  it('a. an External with a role {workspace channel, client space} reaches only those; the server refuses the rest', async () => {
    const saved = await sofia.store.saveAccessRole({ name: `PA role ${stamp()}`, colour: '#3f7d6e', channels: [w1], spaces: [a.spaceId] });
    roleIds.push(saved.id);
    expect(saved.failed).toEqual([]);
    const added = await sofia.store.addPeople(workspace, { type: 'external', userIds: [ext.userId], emails: [], roles: [saved.id], channels: [] });
    expect(added).toEqual({ added: [ext.userId], invited: [], failed: [] });
    expect(sofia.store.getSnapshot().externals[ext.userId]).toEqual({ roles: [saved.id], channels: [] });
    for (const roomId of [w1, a.spaceId, a.channelId]) expect(await join(ext.token, roomId)).toBe(200);
    const [access] = await sofia.store.externalAccess(ext.userId);
    expect(access).toMatchObject({ roles: [saved.id], rooms: { channels: [w1], spaces: [a.spaceId] } });
    expect(access!.notApplied).toBeUndefined();

    expect(await join(ext.token, w2)).toBe(403);
    expect(await join(ext.token, b.spaceId)).toBe(403);
    expect(await join(ext.token, b.channelId)).toBe(403);
    expect(await join(ext.token, workspace)).toBe(403);
    expect(await hierarchyStatus(ext.token, workspace)).toBe(403);
    // Externals add nobody (invite 10): not into the channel they're in.
    expect((await mx(ext.token, 'POST', `/_matrix/client/v3/rooms/${E(w1)}/invite`, { user_id: b.account.userId })).status).toBe(403);
  });

  it('b. a client never sees another client or client space, and gets no access data', async () => {
    for (const [mine, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const snap = mine.app!.store.getSnapshot();
      expect(snap.spaces.map((s) => s.id)).toEqual([mine.spaceId]);
      expect(Object.keys(snap.channels)).toEqual([mine.spaceId]);
      expect(snap.accessRoles).toEqual([]);
      expect(snap.externals).toEqual({});
      const people = await mine.app!.store.searchPeople('');
      expect(people.some((p) => p.id === other.account.userId)).toBe(false);
      expect(await mine.app!.store.searchPeople(other.account.username)).toEqual([]);
      expect(await hierarchyStatus(mine.account.token, other.spaceId)).toBe(403);
      expect(await hierarchyStatus(mine.account.token, workspace)).toBe(403);
      expect(await join(mine.account.token, other.spaceId)).toBe(403);
    }
    // Client A sees the External as part of the team (no outside mark).
    const team = await a.app!.store.spaceMembers(a.spaceId);
    expect(team.find((m) => m.person.id === ext.userId)).toMatchObject({ role: 'staff' });
    expect(team.find((m) => m.person.id === ext.userId)?.person.external).toBeUndefined();
  });

  it('d. auto-accept refuses a bridge between client spaces, and a fresh account takes only its listed rooms', async () => {
    const role2 = await sofia.store.saveAccessRole({ name: `PA role b ${stamp()}`, colour: '#7d3f5e', channels: [], spaces: [b.spaceId] });
    roleIds.push(role2.id);
    const change = await sofia.store.setExternalRoles(ext.userId, [roleIds[0]!, role2.id]);
    expect(change.failed).toEqual([]);
    for (const roomId of [b.spaceId, b.channelId]) expect(await join(ext.token, roomId)).toBe(200);

    // A room and a group DM from the External, each with clients of both spaces. Neither client stays in either. (In the
    // group DM both may join for a moment and leave again: an invite doesn't show who else was invited.)
    const create = async (body: object) => (await mx(ext.token, 'POST', '/_matrix/client/v3/createRoom', { preset: 'private_chat', ...body })).body.room_id as string;
    const both = [a.account.userId, b.account.userId];
    const room = await create({ invite: both });
    const groupDm = await create({ is_direct: true, invite: both });
    await sleep(12_000);
    for (const id of [room, groupDm]) {
      for (const c of [a, b]) {
        expect(await membership(ext.token, id, c.account.userId)).not.toBe('join');
        expect(c.app!.store.getSnapshot().dms.some((d) => d.id === id)).toBe(false);
      }
    }

    // A fresh account (nothing joined) takes the room the invite service listed, not one from someone else.
    const [fresh, stranger] = await Promise.all([register('fresh'), register('stranger')]);
    await mx(fresh.token, 'PUT', `/_matrix/client/v3/user/${E(fresh.userId)}/account_data/work.pasodrum.invited`, { rooms: [w2] });
    const outside = (await mx(stranger.token, 'POST', '/_matrix/client/v3/createRoom', { preset: 'private_chat', invite: [fresh.userId] })).body.room_id as string;
    const session = await signIn(BASE, fresh.username, PASSWORD);
    const store = createWorkspaceStore(session);
    stores.push(store);
    await until(store, (s) => s.connection === 'online');
    await sleep(3_000);
    expect(await membership(stranger.token, outside, fresh.userId)).toBe('invite');
    await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(w2)}/invite`, { user_id: fresh.userId });
    await until(store, (s) => s.spaces.some((sp) => (s.channels[sp.id] ?? []).some((c) => c.id === w2)), 20_000);
    await sleep(5_000);
    expect(await membership(stranger.token, outside, fresh.userId)).toBe('invite');
    // Out again, so the migration in e doesn't make them an External.
    await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(w2)}/kick`, { user_id: fresh.userId });
  });

  it('c. removeFromWorkspace leaves an External in none of our rooms, and locks them out', async () => {
    // A page room (D-37) isn't a space child: removal has to reach it too.
    const pageId = await sofia.store.docsBoards.createPage({ spaceId: a.spaceId, title: `PA page ${stamp()}` });
    expect(await join(ext.token, pageId)).toBe(200);
    await sofia.store.removeFromWorkspace(ext.userId);
    for (const roomId of [w1, w2, a.spaceId, a.channelId, b.spaceId, b.channelId, pageId, ...(await childrenOf(owner, a.spaceId)), ...(await childrenOf(owner, b.spaceId))]) {
      expect([undefined, 'leave', 'ban']).toContain(await membership(owner, roomId, ext.userId));
    }
    expect(sofia.store.getSnapshot().externals[ext.userId]).toBeUndefined();
    expect(await sofia.store.externalAccess(ext.userId)).toEqual([]);
    expect(await lockedOut(ext.token)).toBe(true);
  });

  it('f. SIDE-08 an Owner removes a Staff member: locked, out of the workspace, its channels and client spaces; others untouched', async () => {
    const jonas = await open('jonas');
    const ingrid = await open('ingrid');
    const jonasId = jonas.session.userId;
    const staff = await register('staff');
    const added = await sofia.store.addPeople(workspace, { type: 'staff', userIds: [staff.userId], emails: [], spaces: [a.spaceId] });
    expect(added.failed).toEqual([]);
    await mx(owner, 'POST', `/_matrix/client/v3/rooms/${E(w1)}/invite`, { user_id: staff.userId });
    const invited = (await mx(staff.token, 'GET', '/_matrix/client/v3/sync?timeout=0')).body as { rooms?: { invite?: Record<string, unknown> } };
    const rooms = Object.keys(invited.rooms?.invite ?? {});
    expect(rooms).toEqual(expect.arrayContaining([workspace, w1, a.spaceId]));
    for (const roomId of rooms) expect(await join(staff.token, roomId)).toBe(200);
    const before = { workspace: await membership(owner, workspace, jonasId), w1: await membership(owner, w1, jonasId) };
    await expect(jonas.store.removeFromWorkspace(staff.userId)).rejects.toThrow('not-allowed');
    await expect(ingrid.store.removeFromWorkspace(sofia.session.userId)).rejects.toThrow('not-allowed');
    expect(await membership(owner, workspace, staff.userId)).toBe('join');

    await sofia.store.removeFromWorkspace(staff.userId);
    expect(await lockedOut(staff.token)).toBe(true);
    for (const roomId of [workspace, w1, ...rooms]) expect([undefined, 'leave', 'ban']).toContain(await membership(owner, roomId, staff.userId));
    expect({ workspace: await membership(owner, workspace, jonasId), w1: await membership(owner, w1, jonasId) }).toEqual(before);
    expect(before.workspace).toBe('join');
  });

  it('e. the migration is idempotent: a second run makes 0 writes', () => {
    migrate();
    expect(migrate()).toMatch(/0 writes: already migrated/);
  });
});
