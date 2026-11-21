// M5 against the seeded local server + invite service: pnpm dev:server && pnpm dev:seed && pnpm test:matrix
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { previewInvite, type WorkspaceSnapshot } from './index';
import { BASE, mx, open, sendRaw, setupIntegration, until } from './integration.helpers';
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
/** Client spaces this run made, with their channels; everyone leaves them at the end. */
const madeSpaces: string[] = [];
const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error);
const state = async (token: string, roomId: string, type: string, key = '') => (await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(roomId)}/state/${type}/${E(key)}`)).body;
const joinedRooms = async (token: string) => (await mx(token, 'GET', '/_matrix/client/v3/joined_rooms')).body.joined_rooms as string[];
const membership = async (token: string, roomId: string, userId: string) => (await state(token, roomId, 'm.room.member', userId)).membership;
const childrenOf = async (token: string, spaceId: string) => {
  const all = (await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(spaceId)}/state`)).body as unknown as { type: string; state_key: string; content: { via?: string[] } }[];
  return all.filter((e) => e.type === 'm.space.child' && e.content.via?.length).map((e) => e.state_key);
};
const spaceNamed = (s: WorkspaceSnapshot, name: string) => s.spaces.find((x) => x.name === name);
const mayInvite = async () => {
  if (!inviteServiceUp) return false;
  const probe = await createInvite(ingrid.session.accessToken, { email: 'not an email', role: 'external', spaceId: pasodrum, channelIds: [], locale: 'en' }).catch((e: Error) => e.message);
  return probe !== 'rate-limited';
};

beforeAll(async () => {
  [sofia, ingrid, jonas, henrik] = await Promise.all([open('sofia'), open('ingrid'), open('jonas'), open('henrik_nordlys.no')]);
  const spaces = sofia.store.getSnapshot().spaces;
  pasodrum = spaces.find((s) => s.name === 'Pasodrum')!.id;
  nordlys = spaces.find((s) => s.name === 'Nordlys')!.id;
});

afterAll(async () => {
  for (const spaceId of madeSpaces) {
    const rooms = [...(await childrenOf(ingrid.session.accessToken, spaceId).catch(() => [])), spaceId];
    for (const roomId of rooms) {
      for (const code of (await ingrid.store.pendingInvites(roomId)).map((p) => p.code)) await ingrid.store.revokeInvite(code).catch(() => {});
      for (const a of [jonas, sofia, ingrid]) {
        await mx(a.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/leave`);
        await mx(a.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/forget`);
      }
    }
  }
});

describe('snapshot', () => {
  it('spaces carry colour and archived from work.pasodrum.space; workspace first', () => {
    const spaces = sofia.store.getSnapshot().spaces;
    expect(spaces[0]).toEqual({ id: pasodrum, name: 'Pasodrum', kind: 'workspace' });
    expect(spaces.find((s) => s.id === nordlys)).toEqual({ id: nordlys, name: 'Nordlys', kind: 'client' });
  });

  it('outside: the team sees clients and guests per channel; clients and guests never get it (D-28)', async () => {
    const updates = await until(sofia.store, (s) => s.channels[nordlys]?.find((c) => c.name === 'project-updates' && c.outside));
    expect(updates.outside).toEqual([{ id: HENRIK, name: 'Henrik Dahl', external: true }]);
    // Fills in as member lists load (lazy loading first knows only recent senders).
    const design = await until(sofia.store, (s) => s.channels[pasodrum]?.find((c) => c.name === 'design' && c.outside?.some((p) => p.id === LEA)));
    expect(design.outside!.some((p) => [SOFIA, INGRID, JONAS, TANAKA].includes(p.id))).toBe(false);
    expect(sofia.store.getSnapshot().channels[pasodrum]!.find((c) => c.name === 'general')?.outside).toBeUndefined();
    await until(jonas.store, (s) => s.channels[pasodrum]?.find((c) => c.name === 'design')?.outside);

    expect(Object.values(henrik.store.getSnapshot().channels).flat().every((c) => c.outside === undefined)).toBe(true);
  });
});

describe('client spaces', () => {
  const name = `M5 ${stamp()}`;
  let spaceId = '';
  let channelId = '';
  let second = '';
  let clientEmail = '';
  let clientId = '';

  it('creates a client space: D-27 levels, colour, restricted channels, team joins on its own, clients by email; nothing half-made shows', async () => {
    const emails = (await mayInvite()) ? [(clientEmail = `m5-${stamp()}@acme.example`)] : [];
    const seen: number[] = [];
    const stop = ingrid.store.subscribe(() => {
      const s = ingrid.store.getSnapshot();
      const space = spaceNamed(s, name);
      if (space) seen.push(s.channels[space.id]?.length ?? 0);
    });
    try {
      ({ spaceId, channelId } = await ingrid.store.createClientSpace({ name: `  ${name} `, colour: '#7A3E9D', channels: ['general', ' questions ', 'General'], team: [JONAS, INGRID, HENRIK, '@ghost:example.org'], clientEmails: emails }));
    } finally {
      stop();
    }
    madeSpaces.push(spaceId);
    const snap = ingrid.store.getSnapshot();
    expect(spaceNamed(snap, name)).toEqual({ id: spaceId, name, kind: 'client', colour: '#7A3E9D' });
    expect(snap.channels[spaceId]!.map((c) => c.name)).toEqual(['general', 'questions']);
    expect(snap.channels[spaceId]![0]!.id).toBe(channelId);
    second = snap.channels[spaceId]![1]!.id;
    expect(snap.myRoles[spaceId]).toBe('admin');
    // Every snapshot that showed the space showed it whole.
    expect(seen.filter((n) => n !== 2)).toEqual([]);

    const t = ingrid.session.accessToken;
    expect(await state(t, spaceId, 'work.pasodrum.space')).toEqual({ kind: 'client', colour: '#7A3E9D' });
    // Only workspace people join the team: Henrik (a client) and an unknown id are ignored.
    expect(await state(t, spaceId, 'm.room.power_levels')).toMatchObject({ users: { [JONAS]: 10 }, invite: 10, events: { 'm.space.child': 10 } });
    expect(Object.keys((await state(t, spaceId, 'm.room.power_levels')).users as object)).toEqual([JONAS]);
    expect(await membership(t, spaceId, HENRIK)).toBeUndefined();
    expect(await state(t, spaceId, 'm.room.join_rules')).toEqual({ join_rule: 'invite' });
    expect(new Set(await childrenOf(t, spaceId))).toEqual(new Set([channelId, second]));
    for (const id of [channelId, second]) {
      expect(await state(t, id, 'm.room.join_rules')).toEqual({ join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: spaceId }] });
      expect(await state(t, id, 'm.space.parent', spaceId)).toMatchObject({ canonical: true });
      expect(await state(t, id, 'm.room.power_levels')).toMatchObject({ users: { [JONAS]: 10 }, invite: 10, events_default: 0 });
    }

    await until(jonas.store, (s) => s.channels[spaceId]?.length === 2 && s);
    expect(jonas.store.getSnapshot().myRoles[spaceId]).toBe('staff');
    expect(spaceNamed(jonas.store.getSnapshot(), name)?.colour).toBe('#7A3E9D');

    if (clientEmail) {
      const pending = (await ingrid.store.pendingInvites(channelId)).find((p) => p.email === clientEmail)!;
      expect(pending).toMatchObject({ role: 'client' });
      expect(await previewInvite(pending.code)).toMatchObject({ spaceName: name, spaceKind: 'client', state: 'open' });
      clientId = `@${clientEmail.replace('@', '_')}:pasodrum.localhost`;
      expect(await membership(t, spaceId, clientId)).toBe('invite');
      expect(await membership(t, second, clientId)).toBe('invite');
      const outside = await until(ingrid.store, (s) => s.channels[spaceId]?.find((c) => c.id === channelId)?.outside);
      expect(outside.map((p) => p.id)).toEqual([clientId]);
    }
  });

  it('refuses a taken name (case-insensitive, trimmed) and Members', async () => {
    const req = { colour: '#000000', channels: ['general'], team: [], clientEmails: [] };
    expect((await rejection(ingrid.store.createClientSpace({ ...req, name: ` ${name.toUpperCase()}  ` })))?.message).toBe('name-taken');
    expect((await rejection(sofia.store.createClientSpace({ ...req, name: 'nordlys' })))?.message).toBe('name-taken');
    expect((await rejection(jonas.store.createClientSpace({ ...req, name: `M5 ${stamp()}` })))?.message).toBe('not-allowed');
  });

  it('a failure leaves nothing behind; a bad email is refused before anything is made', async () => {
    const before = new Set(await joinedRooms(ingrid.session.accessToken));
    const failName = `M5 fail ${stamp()}`;
    const seen = new Set<string>();
    const stop = ingrid.store.subscribe(() => ingrid.store.getSnapshot().spaces.forEach((s) => seen.add(s.name)));
    try {
      // The server refuses an event this big, after the space and the first channel exist.
      const refused = await rejection(ingrid.store.createClientSpace({ name: failName, colour: '#111111', channels: ['general', 'x'.repeat(70_000)], team: [JONAS], clientEmails: [] }));
      expect(refused?.message).toBe('other');
      const bad = await rejection(ingrid.store.createClientSpace({ name: failName, colour: '#111111', channels: ['general'], team: [], clientEmails: ['a@b.example', 'not an email'] }));
      expect(bad?.message).toBe('invalid-email');
    } finally {
      stop();
    }
    expect(seen.has(failName)).toBe(false);
    expect((await joinedRooms(ingrid.session.accessToken)).filter((id) => !before.has(id))).toEqual([]);
    await new Promise((r) => setTimeout(r, 1500));
    expect(spaceNamed(jonas.store.getSnapshot(), failName)).toBeUndefined();
  });

  it('spaceMembers: team first, then clients; pending people carry pending', async () => {
    await expect.poll(async () => (await ingrid.store.spaceMembers(spaceId)).find((m) => m.person.id === JONAS)?.pending, { timeout: 15_000 }).toBeUndefined();
    const members = await ingrid.store.spaceMembers(spaceId);
    expect(members.map((m) => [m.person.id, m.role, !!m.pending])).toEqual([
      [INGRID, 'admin', false],
      [JONAS, 'staff', false],
      ...(clientId ? [[clientId, 'client', true]] : []),
    ]);
  });

  it('updateSpace renames and recolours (Owners/Admins); a taken name is refused', async () => {
    const renamed = `${name} Ltd`;
    await ingrid.store.updateSpace(spaceId, { name: renamed, colour: '#0E7C66' });
    expect(ingrid.store.getSnapshot().spaces.find((s) => s.id === spaceId)).toMatchObject({ name: renamed, colour: '#0E7C66' });
    expect(await state(ingrid.session.accessToken, spaceId, 'work.pasodrum.space')).toEqual({ kind: 'client', colour: '#0E7C66' });
    await until(jonas.store, (s) => s.spaces.find((x) => x.id === spaceId)?.colour === '#0E7C66');
    expect((await rejection(ingrid.store.updateSpace(spaceId, { name: 'NORDLYS' })))?.message).toBe('name-taken');
    expect((await rejection(jonas.store.updateSpace(spaceId, { colour: '#FF0000' })))?.message).toBe('not-allowed');
    await ingrid.store.updateSpace(spaceId, { name });
  });

  it('setMainContact: Owners/Admins mark and unmark; a Member is refused by the server', async () => {
    const t = jonas.session.accessToken;
    const put = await mx(t, 'PUT', `/_matrix/client/v3/rooms/${E(spaceId)}/state/work.pasodrum.space/`, { kind: 'client', colour: '#0E7C66', contacts: [JONAS] });
    expect(put.status).toBe(403);
    expect((await rejection(jonas.store.setMainContact(spaceId, JONAS, true)))?.message).toBe('not-allowed');
    await ingrid.store.setMainContact(spaceId, JONAS, true);
    expect(await state(t, spaceId, 'work.pasodrum.space')).toEqual({ kind: 'client', colour: '#0E7C66', contacts: [JONAS] });
    await until(jonas.store, (s) => s.spaces.find((x) => x.id === spaceId)?.contacts?.[0] === JONAS);
    await ingrid.store.setMainContact(spaceId, JONAS, false);
    expect(await state(t, spaceId, 'work.pasodrum.space')).toEqual({ kind: 'client', colour: '#0E7C66' });
    expect(ingrid.store.getSnapshot().spaces.find((s) => s.id === spaceId)).not.toHaveProperty('contacts');
  });

  it('colour and archive saved at the same moment both stick (writes go one at a time)', async () => {
    await Promise.all([ingrid.store.updateSpace(spaceId, { colour: '#123456' }), ingrid.store.setArchived(spaceId, true)]);
    expect(await state(ingrid.session.accessToken, spaceId, 'work.pasodrum.space')).toEqual({ kind: 'client', colour: '#123456', archived: true });
    await Promise.all([ingrid.store.setArchived(spaceId, false), ingrid.store.updateSpace(spaceId, { colour: '#0E7C66' })]);
    expect(await state(ingrid.session.accessToken, spaceId, 'work.pasodrum.space')).toEqual({ kind: 'client', colour: '#0E7C66' });
  });

  it('setArchived: every channel read-only below Admin, nobody removed, tile sorts last; unarchive restores D-27', async () => {
    const t = jonas.session.accessToken;
    const post = (roomId: string) => mx(t, 'PUT', `/_matrix/client/v3/rooms/${E(roomId)}/send/m.room.message/m5-${stamp()}`, { msgtype: 'm.text', body: 'hi' });
    expect((await rejection(jonas.store.setArchived(spaceId, true)))?.message).toBe('not-allowed');
    await ingrid.store.setArchived(spaceId, true);
    try {
      expect(ingrid.store.getSnapshot().spaces.at(-1)).toMatchObject({ id: spaceId, archived: true });
      expect(await state(t, spaceId, 'work.pasodrum.space')).toEqual({ kind: 'client', colour: '#0E7C66', archived: true });
      expect(await state(t, channelId, 'm.room.power_levels')).toMatchObject({ events_default: 50, events: { 'm.reaction': 50, 'm.room.redaction': 50 }, users: { [JONAS]: 10 } });
      expect((await post(channelId)).status).toBe(403);
      expect((await post(second)).status).toBe(403);
      await until(jonas.store, (s) => s.spaces.find((x) => x.id === spaceId)?.archived);
      expect(jonas.store.getSnapshot().channels[spaceId]).toHaveLength(2);
    } finally {
      await ingrid.store.setArchived(spaceId, false);
    }
    expect(ingrid.store.getSnapshot().spaces.find((s) => s.id === spaceId)).not.toHaveProperty('archived');
    expect(await state(t, spaceId, 'work.pasodrum.space')).toEqual({ kind: 'client', colour: '#0E7C66' });
    const pl = await state(t, channelId, 'm.room.power_levels');
    expect(pl.events_default).toBe(0);
    expect(pl.events).not.toHaveProperty('m.reaction');
    expect((await post(channelId)).status).toBe(200);
  });

  it('removeFromSpace: out of the space and every channel, even ones I’m not in; a pending person’s link dies; Members can’t', async () => {
    expect((await rejection(jonas.store.removeFromSpace(spaceId, INGRID)))?.message).toBe('not-allowed');
    // A channel Jonas (team) made, which Ingrid isn't in. Room version 12: Jonas, its creator, can never be kicked from it.
    const own = await jonas.store.createChannel({ spaceId, name: `m5-${stamp()}`, private: false });
    const seen = new Set<string>();
    const stop = ingrid.store.subscribe(() => Object.values(ingrid.store.getSnapshot().channels).flat().forEach((c) => seen.add(c.id)));
    try {
      if (clientId) {
        await mx(jonas.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(own)}/invite`, { user_id: clientId });
        expect((await rejection(jonas.store.removeFromSpace(spaceId, clientId)))?.message).toBe('not-allowed');
        const code = (await ingrid.store.pendingInvites(channelId)).find((p) => p.email === clientEmail)!.code;
        await ingrid.store.removeFromSpace(spaceId, clientId);
        expect((await previewInvite(code)).state).toBe('used');
        expect((await ingrid.store.pendingInvites(channelId)).some((p) => p.email === clientEmail)).toBe(false);
        for (const id of [spaceId, channelId, second]) expect(await membership(ingrid.session.accessToken, id, clientId), id).toBe('leave');
        expect(await membership(jonas.session.accessToken, own, clientId)).toBe('leave');
        await until(ingrid.store, (s) => s.channels[spaceId]?.every((c) => !c.outside));
      }
      expect((await rejection(ingrid.store.removeFromSpace(spaceId, JONAS)))?.message).toBe('partial');
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      stop();
    }
    expect(seen.has(own)).toBe(false);
    expect(await joinedRooms(ingrid.session.accessToken)).not.toContain(own);
    // Out of the space and Ingrid's channels; only the channel he created is left (that's the 'partial').
    await until(jonas.store, (s) => s.channels[spaceId]?.length === 1 && s.channels[spaceId]![0]!.id === own);
    const left = await joinedRooms(jonas.session.accessToken);
    expect([spaceId, channelId, second].filter((id) => left.includes(id))).toEqual([]);
    expect(left).toContain(own);
    expect((await ingrid.store.spaceMembers(spaceId)).map((m) => m.person.id)).toEqual([INGRID]);
    expect((await rejection(ingrid.store.removeFromSpace(spaceId, INGRID)))?.message).toBe('not-allowed');
  });

  it('anotherApp: the homeserver host and my username', () => {
    expect(ingrid.store.anotherApp()).toEqual({ server: new URL(BASE).host, username: 'ingrid' });
    expect(henrik.store.anotherApp()).toEqual({ server: new URL(BASE).host, username: 'henrik_nordlys.no' });
  });
});

describe('client’s eye: a client reaches nothing internal (D-06)', () => {
  let internal: string[] = [];
  let other: string[] = [];
  const t = () => henrik.session.accessToken;

  beforeAll(async () => {
    const hierarchy = (await mx(sofia.session.accessToken, 'GET', `/_matrix/client/v1/rooms/${E(pasodrum)}/hierarchy?limit=100`)).body.rooms as { room_id: string }[];
    internal = [pasodrum, ...hierarchy.map((r) => r.room_id)];
    // Another client's space: the client must not see it either.
    const made = await ingrid.store.createClientSpace({ name: `M5 other ${stamp()}`, colour: '#2F4A6D', channels: ['general'], team: [], clientEmails: [] });
    madeSpaces.push(made.spaceId);
    other = [made.spaceId, made.channelId];
  });

  it('is in nothing but their client space, its channels and DMs', async () => {
    const mine = await joinedRooms(t());
    expect(mine).toContain(nordlys);
    expect(mine.filter((id) => internal.includes(id) || other.includes(id))).toEqual([]);
    expect(henrik.store.getSnapshot().spaces.map((s) => s.id)).toEqual([nordlys]);
  });

  it('the server refuses hierarchy, state, members, summaries and history of internal rooms and other client spaces', async () => {
    for (const id of [...internal, ...other]) {
      expect((await mx(t(), 'GET', `/_matrix/client/v1/rooms/${E(id)}/hierarchy`)).status, `hierarchy ${id}`).toBe(403);
      expect((await mx(t(), 'GET', `/_matrix/client/v3/rooms/${E(id)}/state`)).status, `state ${id}`).toBe(403);
      expect((await mx(t(), 'GET', `/_matrix/client/v3/rooms/${E(id)}/members`)).status, `members ${id}`).toBe(403);
      expect((await mx(t(), 'GET', `/_matrix/client/unstable/im.nheko.summary/rooms/${E(id)}/summary`)).status, `summary ${id}`).toBe(403);
      // Continuwuity answers 200 with nothing in it rather than 403.
      const history = await mx(t(), 'GET', `/_matrix/client/v3/rooms/${E(id)}/messages?dir=b&limit=50`);
      expect(history.status === 403 || (history.body.chunk as unknown[]).length === 0, `messages ${id}`).toBe(true);
    }
  });

  it('joining by id is refused everywhere internal', async () => {
    for (const id of [...internal, ...other]) {
      const res = await mx(t(), 'POST', `/_matrix/client/v3/join/${E(id)}`, {});
      if (res.status === 200) await mx(t(), 'POST', `/_matrix/client/v3/rooms/${E(id)}/leave`);
      expect(res.status, `join ${id}`).toBe(403);
    }
  });

  it('directory and people search find no internal-only people; the public directory is empty', async () => {
    for (const term of ['jonas', 'berg', 'tanaka', '田中', 'pasodrum']) {
      const { results } = (await mx(t(), 'POST', '/_matrix/client/v3/user_directory/search', { search_term: term, limit: 50 })).body as { results: { user_id: string }[] };
      expect(results.map((r) => r.user_id).filter((id) => id === JONAS || id === TANAKA), term).toEqual([]);
    }
    expect((await mx(t(), 'GET', '/_matrix/client/v3/publicRooms')).body.chunk).toEqual([]);

    expect((await henrik.store.searchPeople('')).map((p) => p.id).filter((id) => id === JONAS || id === TANAKA)).toEqual([]);
    expect(await henrik.store.searchPeople('jonas')).toEqual([]);
    expect(await henrik.store.spaceMembers(pasodrum)).toEqual([]);
    expect(await henrik.store.channelMembers(internal[1]!)).toEqual([]);
    expect(await rejection(henrik.store.browseChannels(pasodrum))).toBeInstanceOf(Error);
  });

  it('their client space’s team is visible to them', async () => {
    const members = await henrik.store.spaceMembers(nordlys);
    expect(members.map((m) => [m.person.id, m.role])).toEqual(expect.arrayContaining([[SOFIA, 'owner'], [INGRID, 'admin'], [HENRIK, 'client']]));
    expect(members.some((m) => m.person.id === JONAS || m.person.id === TANAKA)).toBe(false);
  });

  // Accepted (D-29): any account reads any local profile by ID, work email included; it reveals nothing else.
  it('profiles are readable by ID, and that is all', async () => {
    expect((await mx(t(), 'GET', `/_matrix/client/v3/profile/${E(JONAS)}`)).body).toMatchObject({ displayname: 'Jonas Berg' });
  });

  it('a client can’t post where the server says no: other client spaces, the workspace', async () => {
    for (const id of [...other, internal[1]!]) {
      const res = await mx(t(), 'PUT', `/_matrix/client/v3/rooms/${E(id)}/send/m.room.message/m5-${stamp()}`, { msgtype: 'm.text', body: 'x' });
      expect(res.status, `send ${id}`).toBe(403);
    }
    expect(await sendRaw(t(), nordlys, { msgtype: 'm.text', body: 'x' }).catch(() => undefined)).toBeUndefined();
  });
});
