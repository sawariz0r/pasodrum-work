// M4 against the seeded local server (+ the invite service when it runs): pnpm dev:server && pnpm dev:seed && pnpm test:matrix
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimInvite, createWorkspaceStore, PasswordRequired, previewInvite, signIn, type WorkspaceStore } from './index';
import { BASE, channel, joinProof, mx, open, PASSWORD, setupIntegration, stores, until } from './integration.helpers';
import { createInvite } from './invites';

setupIntegration();
globalThis.location = { origin: BASE } as Location;

const SOFIA = '@sofia:pasodrum.localhost';
const INGRID = '@ingrid:pasodrum.localhost';
const JONAS = '@jonas:pasodrum.localhost';
const TANAKA = '@tanaka:pasodrum.localhost';
const HENRIK = '@henrik_nordlys.no:pasodrum.localhost';
const LEA = '@lea_freelance.dev:pasodrum.localhost';
const E = encodeURIComponent;
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const inviteServiceUp = await fetch(`${BASE}/api/invites/x`)
  .then((r) => !!r.headers.get('content-type')?.includes('json'))
  .catch(() => false);

type Account = Awaited<ReturnType<typeof open>>;
let sofia: Account;
let ingrid: Account;
let jonas: Account;
let henrik: Account;
let pasodrum: string;
let nordlys: string;
const created: string[] = [];
const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error);
const state = async (token: string, roomId: string, type: string, key = '') =>
  (await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(roomId)}/state/${type}/${E(key)}`)).body;
const joinedRooms = async (token: string) => (await mx(token, 'GET', '/_matrix/client/v3/joined_rooms')).body.joined_rooms as string[];

/** A store for an account in no space (a guest), which `open()` would wait on forever. */
async function openGuest(identifier: string, password = PASSWORD) {
  const session = await signIn(BASE, identifier, password);
  const store = createWorkspaceStore(session);
  stores.push(store);
  await until(store, (s) => s.connection === 'online');
  return { session, store };
}

async function createChannel(store: WorkspaceStore, spaceId: string, opts: { private?: boolean; topic?: string } = {}) {
  const id = await store.createChannel({ spaceId, name: `m4-${stamp()}`, private: !!opts.private, ...(opts.topic ? { topic: opts.topic } : {}) });
  created.push(id);
  return id;
}

beforeAll(async () => {
  [sofia, ingrid, jonas, henrik] = await Promise.all([open('sofia'), open('ingrid'), open('jonas'), open('henrik_nordlys.no')]);
  const spaces = sofia.store.getSnapshot().spaces;
  pasodrum = spaces.find((s) => s.name === 'Pasodrum')!.id;
  nordlys = spaces.find((s) => s.name === 'Nordlys')!.id;
});

afterAll(async () => {
  // Leave the seeded spaces as they were: unlink and leave every channel this run made.
  const t = ingrid.session.accessToken;
  for (const id of created) {
    for (const space of [pasodrum, nordlys]) await mx(t, 'PUT', `/_matrix/client/v3/rooms/${E(space)}/state/m.space.child/${E(id)}`, {});
    for (const a of [sofia, ingrid, jonas, henrik]) await mx(a.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(id)}/leave`);
  }
});

describe('roles', () => {
  it('myRoles per space from workspace power levels and membership', async () => {
    expect(await until(sofia.store, (s) => s.myRoles[nordlys] && s.myRoles)).toEqual({ [pasodrum]: 'owner', [nordlys]: 'owner' });
    expect(ingrid.store.getSnapshot().myRoles).toEqual({ [pasodrum]: 'admin', [nordlys]: 'admin' });
    expect(jonas.store.getSnapshot().myRoles).toEqual({ [pasodrum]: 'staff' });
    expect(henrik.store.getSnapshot().myRoles).toEqual({ [nordlys]: 'client' });
  });

  it('channel members carry roles; a client sees roles from their client space', async () => {
    const design = channel(sofia.store.getSnapshot(), 'Pasodrum', 'design')!.id;
    const roles = Object.fromEntries((await sofia.store.channelMembers(design)).map((m) => [m.person.id, m.role]));
    expect(roles).toMatchObject({ [SOFIA]: 'owner', [INGRID]: 'admin', [JONAS]: 'staff', [TANAKA]: 'staff', [LEA]: 'external' });

    const updates = channel(henrik.store.getSnapshot(), 'Nordlys', 'project-updates')!.id;
    const seen = Object.fromEntries((await henrik.store.channelMembers(updates)).map((m) => [m.person.id, m.role]));
    expect(seen).toMatchObject({ [SOFIA]: 'owner', [INGRID]: 'admin', [HENRIK]: 'client' });
  });

  it('setRole: an Owner moves people between Member, Admin and Owner in the space and its channels', async () => {
    const general = channel(sofia.store.getSnapshot(), 'Pasodrum', 'general')!.id;
    const tanaka = await open('tanaka');
    try {
      await sofia.store.setRole(pasodrum, TANAKA, 'admin');
      expect((await state(sofia.session.accessToken, pasodrum, 'm.room.power_levels')).users).toMatchObject({ [TANAKA]: 50 });
      expect((await state(sofia.session.accessToken, general, 'm.room.power_levels')).users).toMatchObject({ [TANAKA]: 50 });
      await until(tanaka.store, (s) => s.myRoles[pasodrum] === 'admin');
      await sofia.store.setRole(pasodrum, TANAKA, 'owner');
      await until(tanaka.store, (s) => s.myRoles[pasodrum] === 'owner');
      // Another Owner can't be changed by an Admin or a Member.
      expect((await rejection(ingrid.store.setRole(pasodrum, TANAKA, 'staff')))?.message).toBe('not-allowed');
    } finally {
      await sofia.store.setRole(pasodrum, TANAKA, 'staff');
    }
    await until(tanaka.store, (s) => s.myRoles[pasodrum] === 'staff');
    // D-36: Staff sit at 10 in workspace channels.
    expect(((await state(sofia.session.accessToken, general, 'm.room.power_levels')).users as Record<string, number>)[TANAKA]).toBe(10);
  });

  it('setRole: an Admin switches Member↔Admin but never touches Owners or peers; Members can’t (D-25, D-27)', async () => {
    const general = channel(ingrid.store.getSnapshot(), 'Pasodrum', 'general')!.id;
    await expect.poll(async () => (await ingrid.store.channelMembers(general)).find((m) => m.person.id === TANAKA)?.role, { timeout: 15_000 }).toBe('staff');
    try {
      await ingrid.store.setRole(pasodrum, TANAKA, 'admin');
      expect((await state(ingrid.session.accessToken, pasodrum, 'm.room.power_levels')).users).toMatchObject({ [TANAKA]: 50 });
      // Matrix: an Admin can't lower another Admin.
      expect((await rejection(ingrid.store.setRole(pasodrum, TANAKA, 'staff')))?.message).toBe('not-allowed');
    } finally {
      await sofia.store.setRole(pasodrum, TANAKA, 'staff');
    }
    expect((await rejection(jonas.store.setRole(pasodrum, TANAKA, 'admin')))?.message).toBe('not-allowed');
    expect((await rejection(ingrid.store.setRole(pasodrum, TANAKA, 'owner')))?.message).toBe('not-allowed');
    expect((await rejection(ingrid.store.setRole(pasodrum, SOFIA, 'staff')))?.message).toBe('not-allowed');
  });
});

describe('channels', () => {
  it('creates a public channel restricted to the space, linked both ways; the name must be free', async () => {
    const id = await createChannel(ingrid.store, pasodrum, { topic: 'Launch plans' });
    const made = Object.values(ingrid.store.getSnapshot().channels[pasodrum]!).find((c) => c.id === id)!;
    expect(made).toMatchObject({ spaceId: pasodrum, private: false, topic: 'Launch plans', memberCount: 1 });
    const token = ingrid.session.accessToken;
    expect(await state(token, id, 'm.room.join_rules')).toEqual({ join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: pasodrum }] });
    expect(await state(token, id, 'm.space.parent', pasodrum)).toMatchObject({ canonical: true });
    expect((await state(token, pasodrum, 'm.space.child', id)).via).toEqual(['pasodrum.localhost']);
    expect(await state(token, id, 'm.room.power_levels')).toMatchObject({ users: { [SOFIA]: 100, [JONAS]: 10 }, invite: 10, events: { 'm.room.power_levels': 50 } });
    expect(await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(id)}/state/m.room.encryption/`)).toMatchObject({ status: 404 });

    expect((await rejection(ingrid.store.createChannel({ spaceId: pasodrum, name: made.name.toUpperCase(), private: false })))?.message).toBe('taken');
    expect((await rejection(ingrid.store.createChannel({ spaceId: pasodrum, name: 'general', private: true })))?.message).toBe('taken');
  });

  it('any workspace Member creates workspace channels (D-27)', async () => {
    const id = await createChannel(jonas.store, pasodrum);
    expect((await state(jonas.session.accessToken, id, 'm.room.power_levels')).users).toMatchObject({ [SOFIA]: 100, [INGRID]: 50 });
  });

  it('browse, join, topic, leave', async () => {
    const id = await createChannel(ingrid.store, pasodrum);
    const hidden = await createChannel(ingrid.store, pasodrum, { private: true });
    expect(await state(ingrid.session.accessToken, hidden, 'm.room.join_rules')).toEqual({ join_rule: 'invite' });
    expect(ingrid.store.getSnapshot().channels[pasodrum]!.find((c) => c.id === hidden)?.private).toBe(true);

    const list = await jonas.store.browseChannels(pasodrum);
    expect(list.find((c) => c.id === id)).toMatchObject({ joined: false, private: false, memberCount: 1, spaceId: pasodrum });
    expect(list.find((c) => c.name === 'general')).toMatchObject({ joined: true });
    expect(list.some((c) => c.id === hidden)).toBe(false);
    expect((await ingrid.store.browseChannels(pasodrum)).find((c) => c.id === hidden)).toMatchObject({ joined: true, private: true });

    await jonas.store.joinChannel(id);
    expect(channel(jonas.store.getSnapshot(), 'Pasodrum', list.find((c) => c.id === id)!.name)?.id).toBe(id);
    await ingrid.store.setTopic(id, '  New topic ');
    await until(jonas.store, (s) => s.channels[pasodrum]!.find((c) => c.id === id)?.topic === 'New topic');
    await jonas.store.leaveChannel(id);
    expect(jonas.store.getSnapshot().channels[pasodrum]!.some((c) => c.id === id)).toBe(false);
    expect((await jonas.store.browseChannels(pasodrum)).find((c) => c.id === id)?.joined).toBe(false);
  });
});

describe('people', () => {
  it('adds an existing person: their app accepts on its own; remove takes them out', async () => {
    const id = await createChannel(ingrid.store, pasodrum, { private: true });
    const result = await ingrid.store.addPeople(id, { type: 'channel', userIds: [JONAS], emails: [] });
    expect(result).toEqual({ added: [JONAS], invited: [], failed: [] });
    await until(jonas.store, (s) => s.channels[pasodrum]?.some((c) => c.id === id));
    await expect.poll(async () => (await ingrid.store.channelMembers(id)).find((m) => m.person.id === JONAS), { timeout: 15_000 }).toEqual({
      person: { id: JONAS, name: 'Jonas Berg' },
      role: 'staff',
    });
    expect(await ingrid.store.addPeople(id, { type: 'channel', userIds: [JONAS], emails: [] })).toEqual({ added: [], invited: [], failed: [{ who: JONAS, reason: 'already-member' }] });

    await ingrid.store.removeFromChannel(id, JONAS);
    await until(jonas.store, (s) => !s.channels[pasodrum]?.some((c) => c.id === id));
  });

  it('a colleague added to a client-space channel joins its team (level 10): they add channels there, clients can’t', async () => {
    const id = await createChannel(ingrid.store, nordlys);
    const token = sofia.session.accessToken;
    try {
      expect(await ingrid.store.addPeople(id, { type: 'channel', userIds: [JONAS], emails: [] })).toMatchObject({ added: [JONAS] });
      await until(jonas.store, (s) => s.channels[nordlys]?.some((c) => c.id === id));
      expect((await state(token, nordlys, 'm.room.power_levels')).users).toMatchObject({ [JONAS]: 10 });
      expect(await state(ingrid.session.accessToken, id, 'm.room.power_levels')).toMatchObject({ users: { [JONAS]: 10 }, invite: 10 });
      expect(jonas.store.getSnapshot().myRoles[nordlys]).toBe('staff');
      await ingrid.store.addPeople(id, { type: 'client', userIds: [HENRIK], emails: [] });
      await until(henrik.store, (s) => s.channels[nordlys]?.some((c) => c.id === id));
      await expect.poll(async () => (await henrik.store.channelMembers(id)).find((m) => m.person.id === JONAS)?.role, { timeout: 15_000 }).toBe('staff');

      await until(jonas.store, (s) => s.channels[nordlys] !== undefined);
      await createChannel(jonas.store, nordlys);
      expect((await rejection(henrik.store.createChannel({ spaceId: nordlys, name: `m4-${stamp()}`, private: false })))?.message).toBe('not-allowed');
    } finally {
      await mx(token, 'POST', `/_matrix/client/v3/rooms/${E(nordlys)}/kick`, { user_id: JONAS });
      const pl = await state(token, nordlys, 'm.room.power_levels');
      delete (pl.users as Record<string, number>)[JONAS];
      await mx(token, 'PUT', `/_matrix/client/v3/rooms/${E(nordlys)}/state/m.room.power_levels/`, pl);
    }
  });

  it('a client added to a client-space channel joins it on their own', async () => {
    const id = await createChannel(ingrid.store, nordlys);
    expect(await ingrid.store.addPeople(id, { type: 'client', userIds: [HENRIK], emails: [] })).toMatchObject({ added: [HENRIK] });
    await until(henrik.store, (s) => s.channels[nordlys]?.some((c) => c.id === id));
  });

  it('a guest (in no space) added by someone from their channel joins on their own; a Member can’t add Members to the workspace', async () => {
    const id = await createChannel(ingrid.store, pasodrum, { private: true });
    const lea = await openGuest('lea_freelance.dev');
    expect(await ingrid.store.addPeople(id, { type: 'channel', userIds: [LEA], emails: [] })).toMatchObject({ added: [LEA] });
    await expect.poll(() => joinedRooms(lea.session.accessToken), { timeout: 15_000 }).toContain(id);
    expect((await ingrid.store.channelMembers(id)).find((m) => m.person.id === LEA)?.role).toBe('external');
    await mx(lea.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(id)}/leave`);

    expect(await jonas.store.addPeople(pasodrum, { type: 'staff', userIds: [HENRIK], emails: [], spaces: [] })).toEqual({ added: [], invited: [], failed: [{ who: HENRIK, reason: 'not-allowed' }] });
  });
});

describe('profile, devices, notifications, settings', () => {
  it('updates name, avatar and time zone', async () => {
    const token = jonas.session.accessToken;
    const before = (await mx(token, 'GET', `/_matrix/client/v3/profile/${E(JONAS)}`)).body;
    try {
      const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
      await jonas.store.updateProfile({ name: 'Jonas B', avatar: new File([png], 'me.png', { type: 'image/png' }), timeZone: 'Asia/Tokyo' });
      const profile = await sofia.store.profile(JONAS);
      expect(profile).toMatchObject({ person: { name: 'Jonas B' }, timeZone: 'Asia/Tokyo' });
      expect(profile.person.avatarUrl).toMatch(/^mxc:\/\//);
      expect(jonas.store.getSnapshot().me).toMatchObject({ name: 'Jonas B', avatarUrl: profile.person.avatarUrl });
    } finally {
      await mx(token, 'PUT', `/_matrix/client/v3/profile/${E(JONAS)}/displayname`, { displayname: before.displayname });
      await mx(token, 'PUT', `/_matrix/client/v3/profile/${E(JONAS)}/avatar_url`, { avatar_url: before.avatar_url ?? '' });
      await mx(token, 'PUT', `/_matrix/client/v3/profile/${E(JONAS)}/m.tz`, { 'm.tz': before['m.tz'] ?? 'Europe/Oslo' });
    }
  });

  it('lists devices; signing out others asks for the password', async () => {
    const lea = await openGuest('lea_freelance.dev');
    const extra = await signIn(BASE, 'lea_freelance.dev', PASSWORD);
    const devices = await lea.store.devices();
    expect(devices[0]).toMatchObject({ id: lea.session.deviceId, current: true });
    expect(devices.find((d) => d.id === extra.deviceId)).toMatchObject({ current: false });

    const asked = await rejection(lea.store.signOutDevice(extra.deviceId));
    expect(asked).toBeInstanceOf(PasswordRequired);
    expect(asked?.message).toBe('password-required');
    expect((await rejection((asked as PasswordRequired).retry('wrong password')))?.message).toBe('wrong-password');
    await (asked as PasswordRequired).retry(PASSWORD);
    expect((await lea.store.devices()).some((d) => d.id === extra.deviceId)).toBe(false);

    await signIn(BASE, 'lea_freelance.dev', PASSWORD);
    const all = await rejection(lea.store.signOutOtherDevices());
    expect(all).toBeInstanceOf(PasswordRequired);
    await (all as PasswordRequired).retry(PASSWORD);
    expect((await lea.store.devices()).map((d) => d.id)).toEqual([lea.session.deviceId]);
  });

  it('notification levels per channel and account-wide', async () => {
    const general = channel(jonas.store.getSnapshot(), 'Pasodrum', 'general')!.id;
    const rules = async () => (await mx(jonas.session.accessToken, 'GET', '/_matrix/client/v3/pushrules/')).body.global as Record<string, { rule_id: string; enabled: boolean; actions: unknown[] }[]>;
    const rule = async (kind: string, id: string) => (await rules())[kind]!.find((r) => r.rule_id === id);
    try {
      await jonas.store.setNotifyLevel(general, 'none');
      expect(jonas.store.notifyLevel(general)).toBe('none');
      expect(await rule('override', general)).toMatchObject({ actions: [] });
      await jonas.store.setNotifyLevel(general, 'mentions');
      expect(jonas.store.notifyLevel(general)).toBe('mentions');
      expect(await rule('override', general)).toBeUndefined();
      expect(await rule('room', general)).toMatchObject({ actions: [] });
      await jonas.store.setNotifyLevel(general, 'all');
      expect(jonas.store.notifyLevel(general)).toBe('all');
      expect(await rule('room', general)).toMatchObject({ actions: ['notify'] });

      await jonas.store.setNotifyLevel('default', 'mentions');
      expect(jonas.store.notifyLevel('default')).toBe('mentions');
      expect(await rule('underride', '.m.rule.message')).toMatchObject({ enabled: false });
      expect(jonas.store.notifyLevel(general)).toBe('all');
      await jonas.store.setNotifyLevel('default', 'none');
      expect(jonas.store.notifyLevel('default')).toBe('none');
      expect(await rule('override', '.m.rule.master')).toMatchObject({ enabled: true });
    } finally {
      await jonas.store.setNotifyLevel('default', 'all');
      await mx(jonas.session.accessToken, 'DELETE', `/_matrix/client/v3/pushrules/global/room/${E(general)}`);
    }
    expect(jonas.store.notifyLevel('default')).toBe('all');
    expect(await rule('override', '.m.rule.master')).toMatchObject({ enabled: false });
  });

  it('settings go to account data work.pasodrum.settings', async () => {
    const path = `/_matrix/client/v3/user/${E(JONAS)}/account_data/work.pasodrum.settings`;
    const before = await mx(jonas.session.accessToken, 'GET', path);
    try {
      await jonas.store.setSetting('language', 'ja');
      await expect.poll(async () => (await mx(jonas.session.accessToken, 'GET', path)).body).toMatchObject({ language: 'ja' });
      await jonas.store.setSetting('theme', 'dark');
      expect((await mx(jonas.session.accessToken, 'GET', path)).body).toMatchObject({ language: 'ja', theme: 'dark' });
    } finally {
      await mx(jonas.session.accessToken, 'PUT', path, before.status === 200 ? before.body : {});
    }
  });
});

describe.skipIf(!inviteServiceUp)('invites by email (invite service)', () => {
  // The service allows 60 invites per hour per caller; repeated local runs can use them up.
  const skipIfLimited = async (ctx: { skip: () => never }) => {
    const probe = await createInvite(ingrid.session.accessToken, { email: 'not an email', role: 'external', spaceId: pasodrum, channelIds: [], locale: 'en' }).catch((e: Error) => e.message);
    if (probe === 'rate-limited') ctx.skip();
  };

  it('adds a new email: account, pending invite with link, preview, claim, first sign-in joins on its own', async (ctx) => {
    await skipIfLimited(ctx);
    // D-36: Staff go into the workspace and its home channel (#general).
    const id = channel(ingrid.store.getSnapshot(), 'Pasodrum', 'general')!.id;
    const email = `m4-${stamp()}@example.org`;
    const result = await ingrid.store.addPeople(pasodrum, { type: 'staff', userIds: [], emails: [email, 'not an email'], spaces: [] });
    expect(result).toEqual({ added: [], invited: [email], failed: [{ who: 'not an email', reason: 'invalid-email' }] });
    // Invited to the workspace, so pending Staff (with the address on Workspace settings → People).
    await expect.poll(async () => (await ingrid.store.workspacePeople()).find((m) => m.email === email), { timeout: 15_000 }).toMatchObject({ role: 'staff', pending: true });

    const pending = await ingrid.store.pendingInvites(id);
    const invite = pending.find((p) => p.email === email)!;
    expect(invite).toMatchObject({ role: 'staff' });
    expect(invite.link).toContain(invite.code);
    expect(await previewInvite(invite.code)).toMatchObject({ email, spaceName: 'Pasodrum', spaceKind: 'workspace', state: 'open' });
    await ingrid.store.resendInvite(invite.code);

    // The service allows 20 claims per hour per IP; repeated local runs can use them up.
    const identifier = await claimInvite(invite.code, 'New Person', 'a-new-password-123', undefined, await joinProof(email, invite.code)).catch((e: Error) => (e.message === 'rate-limited' ? ctx.skip() : Promise.reject(e)));
    expect((await previewInvite(invite.code)).state).toBe('used');
    const fresh = await openGuest(identifier, 'a-new-password-123');
    expect(Object.values(fresh.store.getSnapshot().channels).flat().length).toBeGreaterThan(0);
    await until(fresh.store, (s) => s.spaces.some((x) => x.id === pasodrum) && s.channels[pasodrum]?.some((c) => c.id === id));
    expect(fresh.store.getSnapshot().myRoles[pasodrum]).toBe('staff');
    expect((await ingrid.store.pendingInvites(id)).some((p) => p.email === email)).toBe(false);
    // Leave the seeded workspace as it was.
    for (const roomId of [id, pasodrum]) await mx(fresh.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/leave`);
  });

  it('an External by email sees the workspace by name with only their channel; Staff can’t add new emails (D-36)', async (ctx) => {
    await skipIfLimited(ctx);
    const id = await createChannel(ingrid.store, pasodrum);
    await jonas.store.joinChannel(id);
    const email = `m4-${stamp()}@example.org`;
    expect(await jonas.store.addPeople(id, { type: 'channel', userIds: [], emails: [email] })).toEqual({ added: [], invited: [], failed: [{ who: email, reason: 'not-allowed' }] });
    expect((await ingrid.store.addPeople(id, { type: 'channel', userIds: [], emails: [email] })).invited).toEqual([email]);
    const invite = (await ingrid.store.pendingInvites(id)).find((p) => p.email === email)!;
    const identifier = await claimInvite(invite.code, 'Guest Person', 'a-new-password-123', undefined, await joinProof(email, invite.code)).catch((e: Error) => (e.message === 'rate-limited' ? ctx.skip() : Promise.reject(e)));
    const guest = await openGuest(identifier, 'a-new-password-123');
    expect(Object.values(guest.store.getSnapshot().channels).flat().length).toBeGreaterThan(0);
    await until(guest.store, (s) => s.channels[pasodrum]?.some((c) => c.id === id));
    const snap = guest.store.getSnapshot();
    expect(snap.spaces).toEqual([{ id: pasodrum, name: 'Pasodrum', kind: 'workspace' }]);
    expect(snap.channels[pasodrum]!.map((c) => c.id)).toEqual([id]);
    expect(snap.myRoles).toEqual({ [pasodrum]: 'external' });
    expect(await joinedRooms(guest.session.accessToken)).not.toContain(pasodrum);
  });

  it('an existing account’s email just gets the invite; revoke removes a pending one', async (ctx) => {
    await skipIfLimited(ctx);
    const id = await createChannel(ingrid.store, pasodrum, { private: true });
    expect(await ingrid.store.addPeople(id, { type: 'channel', userIds: [], emails: ['henrik@nordlys.no'] })).toEqual({ added: [HENRIK], invited: [], failed: [] });
    // D-36: that made the client an External with this channel as a one-off; the seeded client stays a client.
    await mx(sofia.session.accessToken, 'PUT', `/_matrix/client/v3/rooms/${E(pasodrum)}/state/work.pasodrum.external/${E(HENRIK.slice(1))}`, {});

    const email = `m4-${stamp()}@example.org`;
    expect((await ingrid.store.addPeople(id, { type: 'channel', userIds: [], emails: [email] })).invited).toEqual([email]);
    const first = (await ingrid.store.pendingInvites(id)).find((p) => p.email === email)!;
    // Adding a still-pending email again issues a fresh code (the old one dies) and keeps their Matrix invite.
    expect(await ingrid.store.addPeople(id, { type: 'channel', userIds: [], emails: [email] })).toEqual({ added: [], invited: [email], failed: [] });
    const invite = (await ingrid.store.pendingInvites(id)).find((p) => p.email === email)!;
    expect(invite.code).not.toBe(first.code);
    expect((await previewInvite(first.code)).state).toBe('used');
    expect((await ingrid.store.channelMembers(id)).filter((m) => m.pending && m.person.id !== HENRIK)).toHaveLength(1);

    await ingrid.store.revokeInvite(invite.code);
    expect((await ingrid.store.pendingInvites(id)).some((p) => p.email === email)).toBe(false);
    expect((await previewInvite(invite.code)).state).toBe('used');
  });
});
