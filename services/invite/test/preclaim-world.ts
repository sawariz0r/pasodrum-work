// In-process homeserver for the pre-claim tests. It speaks the client-server calls the invite
// service's matrix client makes, plus the sync/invite/message calls the web store makes.
// History reads follow Continuwuity (main, dc7daefe, user_can_see_event): Shared is visible to
// whoever is joined now, including events from before they joined.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matrixClient, type Matrix } from '../src/matrix.ts';
import { createApp } from '../src/app.ts';
import { openStore, type Store } from '../src/store.ts';
import { keyFrom } from '../src/secret.ts';
import { localpartFor } from '../src/ids.ts';

export const SERVER = 'pasodrum.test';
export const ATTACKER_PASSWORD = 'placeholder-attacker-password';
export const REGISTRATION_TOKEN = 'placeholder-registration-token';
export const HISTORY_MARKER = 'prior-history-marker';

const SECRET = 'placeholder-invite-secret-not-a-real-key';

type Ev = {
  type: string;
  state_key: string;
  event_id: string;
  sender: string;
  origin_server_ts: number;
  content: Record<string, unknown>;
};

type Room = { version: number; state: Ev[]; messages: Ev[] };
type User = { userId: string; localpart: string; password: string; displayName: string };
type Session = { userId: string; deviceId: string };

export type Party = { userId: string; token: string; deviceId: string };
export type Res = { status: number; body: Record<string, any> };

export type World = {
  base: string;
  serverName: string;
  admin: Party;
  staffB: Party;
  attacker: Party;
  rooms: { workspace: string; general: string; spaceA: string; chatA: string; spaceB: string; chatB: string };
  marker: string;
  mails: { to: string }[];
  unknown: string[];
  /** POSTs to create an invite, from either the test or the web app. */
  inviteCreates: number;
  matrixInvites: { roomId: string; userId: string; status: number }[];
  api: (token: string | null, method: string, path: string, body?: unknown) => Promise<Res>;
  membership: (roomId: string, userId: string) => string | undefined;
  login: (localpart: string, password: string) => Promise<Res>;
  /** Join (if invited) and read. True only when this password can see the marker. */
  reads: (localpart: string, password: string, roomId: string) => Promise<boolean>;
  accountId: (email: string) => string;
  close: () => Promise<void>;
};

const id = (local: string) => `@${local}:${SERVER}`;

/** Staff on client space A invites `email` and, when `claim` is set, sets the password with only the code the create call returned. */
export async function preclaim(world: World, email: string, claim: boolean) {
  const created = await world.api(world.attacker.token, 'POST', '', {
    email, role: 'client', spaceId: world.rooms.spaceA, channelIds: [world.rooms.chatA], locale: 'en',
  });
  const listed = await world.api(world.attacker.token, 'GET', `?roomId=${encodeURIComponent(world.rooms.chatA)}`);
  const fromList = Array.isArray(listed.body) ? listed.body.find((row: { email?: string; code?: string }) => row.email === email)?.code : undefined;
  const code = typeof created.body.code === 'string' ? created.body.code : typeof fromList === 'string' ? fromList : undefined;
  let claimed: Res | undefined;
  if (claim && code) {
    claimed = await world.api(null, 'POST', `/${code}/claim`, { name: 'Bob', password: ATTACKER_PASSWORD });
  }
  return { created, code, claimed, accountId: world.accountId(email) };
}

export async function createWorld(): Promise<World> {
  const rooms = new Map<string, Room>();
  const users = new Map<string, User>();
  const sessions = new Map<string, Session>();
  const aliases = new Map<string, string>();
  const accountData = new Map<string, Record<string, unknown>>();
  const mails: { to: string }[] = [];
  const unknown: string[] = [];
  let inviteCreates = 0;
  const matrixInvites: World['matrixInvites'] = [];
  let version = 1;
  let seq = 0;
  const eventId = () => `$e${++seq}`;
  const token = () => randomBytes(18).toString('base64url');

  const ev = (type: string, stateKey: string, sender: string, content: Record<string, unknown>): Ev => ({
    type, state_key: stateKey, event_id: eventId(), sender, origin_server_ts: Date.now(), content,
  });

  const contentOf = (room: Room, type: string, stateKey = '') => room.state.find((e) => e.type === type && e.state_key === stateKey)?.content;

  const memberOf = (room: Room, userId: string) => {
    const c = contentOf(room, 'm.room.member', userId);
    return typeof c?.membership === 'string' ? c.membership : undefined;
  };

  const levelOf = (room: Room, userId: string) => {
    const create = contentOf(room, 'm.room.create', '');
    const versionName = create?.room_version;
    const creators = typeof versionName === 'string' && (Number(versionName) >= 12 || versionName.includes('hydra'))
      ? [room.state.find((e) => e.type === 'm.room.create')?.sender, ...(Array.isArray(create?.additional_creators) ? create.additional_creators as string[] : [])]
      : [];
    if (creators.includes(userId)) return Infinity;
    const pl = contentOf(room, 'm.room.power_levels', '') ?? {};
    const usersPl = (pl.users ?? {}) as Record<string, number>;
    return usersPl[userId] ?? (typeof pl.users_default === 'number' ? pl.users_default : 0);
  };

  const bump = (room: Room) => {
    version += 1;
    room.version = version;
  };

  const setState = (room: Room, type: string, stateKey: string, sender: string, content: Record<string, unknown>) => {
    const next = ev(type, stateKey, sender, content);
    const at = room.state.findIndex((e) => e.type === type && e.state_key === stateKey);
    if (at >= 0) room.state[at] = next;
    else room.state.push(next);
    bump(room);
    return next;
  };

  const addUser = (localpart: string, password: string, displayName: string) => {
    const userId = id(localpart);
    users.set(localpart, { userId, localpart, password, displayName });
    const access = token();
    const deviceId = `D${localpart.toUpperCase()}`;
    sessions.set(access, { userId, deviceId });
    return { userId, token: access, deviceId };
  };

  const makeRoom = (roomId: string, name: string, creator: string, power: Record<string, number>, extra: Ev[] = []) => {
    const room: Room = { version: 1, state: [], messages: [] };
    room.state.push(ev('m.room.create', '', creator, { room_version: '12' }));
    room.state.push(ev('m.room.name', '', creator, { name }));
    room.state.push(ev('m.room.power_levels', '', creator, { users: power, users_default: 0, events_default: 50, state_default: 50, invite: 10, kick: 50, ban: 50, redact: 50 }));
    room.state.push(ev('m.room.history_visibility', '', creator, { history_visibility: 'shared' }));
    room.state.push(ev('m.room.member', creator, creator, { membership: 'join', displayname: users.get(creator.slice(1, creator.indexOf(':')))?.displayName ?? creator }));
    for (const userId of Object.keys(power)) {
      if (userId === creator) continue;
      room.state.push(ev('m.room.member', userId, creator, { membership: 'join', displayname: users.get(userId.slice(1, userId.indexOf(':')))?.displayName ?? userId }));
    }
    room.state.push(...extra);
    rooms.set(roomId, room);
    return room;
  };

  const admin = addUser('admin', 'placeholder-admin-password', 'Admin');
  const staffB = addUser('staffb', 'placeholder-staff-password', 'Staff B');
  const attacker = addUser('attacker', 'placeholder-attacker-login', 'Attacker');
  const power = { [admin.userId]: 100, [attacker.userId]: 10, [staffB.userId]: 10 };

  const workspace = '!ws:' + SERVER;
  const general = '!general:' + SERVER;
  const spaceA = '!spaceA:' + SERVER;
  const chatA = '!chatA:' + SERVER;
  const spaceB = '!spaceB:' + SERVER;
  const chatB = '!chatB:' + SERVER;
  aliases.set(`#workspace:${SERVER}`, workspace);

  const asSpace = (roomId: string, child: string, client: boolean) => {
    const room = rooms.get(roomId)!;
    room.state = room.state.filter((e) => e.type !== 'm.room.create');
    room.state.unshift(ev('m.room.create', '', admin.userId, { room_version: '12', type: 'm.space' }));
    if (client) room.state.push(ev('work.pasodrum.space', '', admin.userId, { kind: 'client' }));
    room.state.push(ev('m.space.child', child, admin.userId, { via: [SERVER] }));
  };
  makeRoom(workspace, 'Pasodrum', admin.userId, power);
  asSpace(workspace, general, false);
  makeRoom(general, 'general', admin.userId, power, [
    ev('m.space.parent', workspace, admin.userId, { via: [SERVER], canonical: true }),
  ]);
  // Staff B is on the workspace and on client space B, not on client space A.
  const powerA = { [admin.userId]: 100, [attacker.userId]: 10 };
  const powerB = { [admin.userId]: 100, [staffB.userId]: 10 };
  makeRoom(spaceA, 'Client A', admin.userId, powerA);
  asSpace(spaceA, chatA, true);
  makeRoom(chatA, 'chat', admin.userId, powerA, [ev('m.space.parent', spaceA, admin.userId, { via: [SERVER], canonical: true })]);
  makeRoom(spaceB, 'Client B', admin.userId, powerB);
  asSpace(spaceB, chatB, true);
  makeRoom(chatB, 'chat', admin.userId, powerB, [ev('m.space.parent', spaceB, admin.userId, { via: [SERVER], canonical: true })]);
  // Drop staff B from space A rooms and the attacker from space B rooms: makeRoom only joins `power` keys.
  // powerA has no staff B; powerB has no attacker. Workspace power includes all three, which is what genuine() needs.
  rooms.get(chatB)!.messages.push(ev('m.room.message', '', admin.userId, { msgtype: 'm.text', body: HISTORY_MARKER }));
  rooms.get(general)!.messages.push(ev('m.room.message', '', admin.userId, { msgtype: 'm.text', body: HISTORY_MARKER }));

  const joinedRooms = (userId: string) => [...rooms.entries()].filter(([, room]) => memberOf(room, userId) === 'join');

  const historyAllows = (room: Room, userId: string) => {
    const membership = memberOf(room, userId);
    const visibility = contentOf(room, 'm.room.history_visibility', '')?.history_visibility ?? 'shared';
    if (visibility === 'world_readable') return true;
    // Shared: a user who is joined now can see the event (Continuwuity user_can_see_event).
    if (visibility === 'shared') return membership === 'join';
    if (visibility === 'invited') return membership === 'join' || membership === 'invite';
    return membership === 'join';
  };

  const syncBody = (userId: string, since: number | null) => {
    const join: Record<string, unknown> = {};
    for (const [roomId, room] of joinedRooms(userId)) {
      if (since !== null && room.version <= since) continue;
      join[roomId] = {
        account_data: { events: [] },
        ephemeral: { events: [] },
        unread_notifications: { notification_count: 0, highlight_count: 0 },
        state: { events: room.state },
        timeline: { events: since === null ? room.messages.slice(-30) : room.messages.filter((m) => m.origin_server_ts > 0).slice(-30), limited: false, prev_batch: 'p' },
        summary: { 'm.joined_member_count': room.state.filter((e) => e.type === 'm.room.member' && e.content.membership === 'join').length },
      };
    }
    return { next_batch: String(version), account_data: { events: [] }, presence: { events: [] }, rooms: { join, invite: {}, leave: {} } };
  };

  function authed(req: IncomingMessage): Session | null {
    const m = req.headers.authorization?.match(/^Bearer (\S+)$/);
    return m ? sessions.get(m[1]!) ?? null : null;
  }

  async function readJson(req: IncomingMessage): Promise<Record<string, any>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (!chunks.length) return {};
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, any> : {};
  }

  function send(res: ServerResponse, status: number, body?: unknown) {
    if (res.writableEnded) return;
    const data = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, data ? { 'content-type': 'application/json' } : {});
    res.end(data);
  }

  const fail = (res: ServerResponse, status: number, errcode: string) => send(res, status, { errcode, error: errcode });

  async function matrix(req: IncomingMessage, res: ServerResponse, url: URL) {
    const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
    // ['', '_matrix', 'client', 'v3', ...] but filter(Boolean) drops empties.
    const method = req.method ?? 'GET';
    if (parts[0] === '_matrix' && parts[1] === 'client' && parts[2] === 'versions' && method === 'GET') {
      return send(res, 200, { versions: ['v1.12'], unstable_features: {} });
    }
    if (parts[0] !== '_matrix' || parts[1] !== 'client' || (parts[2] !== 'v3' && parts[2] !== 'r0')) {
      unknown.push(`${method} ${url.pathname}`);
      return fail(res, 404, 'M_UNRECOGNIZED');
    }
    const p = parts.slice(3);
    const key = `${method} ${p.join('/')}`;

    if (method === 'GET' && p[0] === 'capabilities') return send(res, 200, { capabilities: {} });
    if (method === 'GET' && p[0] === 'pushrules' && p.length === 1) {
      return send(res, 200, { global: { override: [], content: [], room: [], sender: [], underride: [] } });
    }
    if (method === 'GET' && p[0] === 'sync') {
      const session = authed(req);
      if (!session) return fail(res, 401, 'M_UNKNOWN_TOKEN');
      const since = url.searchParams.get('since');
      if (since !== null) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 400);
          req.on('close', () => { clearTimeout(timer); resolve(); });
        });
        if (req.destroyed || res.writableEnded) return;
      }
      return send(res, 200, syncBody(session.userId, since === null ? null : Number(since)));
    }
    if (method === 'GET' && p[0] === 'account' && p[1] === 'whoami') {
      const session = authed(req);
      if (!session) return fail(res, 401, 'M_UNKNOWN_TOKEN');
      return send(res, 200, { user_id: session.userId, device_id: session.deviceId });
    }
    if (method === 'GET' && p[0] === 'register' && p[1] === 'available') {
      const username = url.searchParams.get('username') ?? '';
      if (!/^[a-z0-9._=\-/]+$/.test(username)) return fail(res, 400, 'M_INVALID_USERNAME');
      if (users.has(username)) return fail(res, 400, 'M_USER_IN_USE');
      return send(res, 200, { available: true });
    }
    if (method === 'POST' && p[0] === 'register' && p.length === 1) {
      const body = await readJson(req);
      if (!body.auth) return send(res, 401, { session: 'reg', flows: [{ stages: ['m.login.registration_token'] }] });
      if (body.auth.token !== REGISTRATION_TOKEN) return fail(res, 403, 'M_FORBIDDEN');
      const username = String(body.username ?? '');
      if (!/^[a-z0-9._=\-/]+$/.test(username)) return fail(res, 400, 'M_INVALID_USERNAME');
      if (users.has(username)) return fail(res, 400, 'M_USER_IN_USE');
      const password = String(body.password ?? '');
      const userId = id(username);
      users.set(username, { userId, localpart: username, password, displayName: username });
      const access = token();
      const deviceId = 'INVITE';
      sessions.set(access, { userId, deviceId });
      return send(res, 200, { user_id: userId, access_token: access, device_id: deviceId });
    }
    if (method === 'POST' && p[0] === 'login') {
      const body = await readJson(req);
      const localpart = String(body.identifier?.user ?? '');
      const user = users.get(localpart);
      if (!user || user.password !== String(body.password ?? '')) return fail(res, 403, 'M_FORBIDDEN');
      const access = token();
      const deviceId = typeof body.device_id === 'string' ? body.device_id : 'LOGIN';
      sessions.set(access, { userId: user.userId, deviceId });
      return send(res, 200, { user_id: user.userId, access_token: access, device_id: deviceId });
    }
    if (method === 'POST' && p[0] === 'logout') {
      const header = req.headers.authorization?.match(/^Bearer (\S+)$/);
      if (header) sessions.delete(header[1]!);
      return send(res, 200, {});
    }
    if (method === 'POST' && p[0] === 'account' && p[1] === 'password') {
      const body = await readJson(req);
      const localpart = String(body.auth?.identifier?.user ?? '');
      const user = users.get(localpart);
      if (!user || user.password !== String(body.auth?.password ?? '')) return fail(res, 401, 'M_FORBIDDEN');
      user.password = String(body.new_password ?? '');
      if (body.logout_devices) {
        for (const [access, session] of sessions) if (session.userId === user.userId) sessions.delete(access);
      }
      return send(res, 200, {});
    }
    if (method === 'POST' && p[0] === 'createRoom') {
      const session = authed(req);
      if (!session) return fail(res, 401, 'M_UNKNOWN_TOKEN');
      const body = await readJson(req);
      const roomId = `!${randomBytes(6).toString('hex')}:${SERVER}`;
      const room: Room = { version, state: [], messages: [] };
      const create = { room_version: '12', ...(body.creation_content ?? {}) };
      room.state.push(ev('m.room.create', '', session.userId, create));
      if (body.name) room.state.push(ev('m.room.name', '', session.userId, { name: body.name }));
      const powers = body.power_level_content_override ?? { users: {}, users_default: 0, invite: 10 };
      room.state.push(ev('m.room.power_levels', '', session.userId, powers));
      room.state.push(ev('m.room.join_rules', '', session.userId, { join_rule: 'invite' }));
      room.state.push(ev('m.room.member', session.userId, session.userId, { membership: 'join', displayname: users.get(session.userId.slice(1, session.userId.indexOf(':')))?.displayName ?? session.userId }));
      for (const item of Array.isArray(body.initial_state) ? body.initial_state : []) {
        if (!item || typeof item.type !== 'string') continue;
        const stateKey = typeof item.state_key === 'string' ? item.state_key : '';
        const at = room.state.findIndex((e) => e.type === item.type && e.state_key === stateKey);
        const next = ev(item.type, stateKey, session.userId, item.content ?? {});
        if (at >= 0) room.state[at] = next;
        else room.state.push(next);
      }
      bump(room);
      rooms.set(roomId, room);
      return send(res, 200, { room_id: roomId });
    }
    if (method === 'GET' && p[0] === 'joined_rooms') {
      const session = authed(req);
      if (!session) return fail(res, 401, 'M_UNKNOWN_TOKEN');
      return send(res, 200, { joined_rooms: joinedRooms(session.userId).map(([roomId]) => roomId) });
    }
    if (method === 'GET' && p[0] === 'directory' && p[1] === 'room' && p[2]) {
      const roomId = aliases.get(p[2]);
      return roomId ? send(res, 200, { room_id: roomId }) : fail(res, 404, 'M_NOT_FOUND');
    }
    if (method === 'GET' && p[0] === 'rooms' && p[2] === 'state' && p.length === 3) {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      if (!session || !room || memberOf(room, session.userId) !== 'join') return fail(res, 403, 'M_FORBIDDEN');
      return send(res, 200, room.state);
    }
    if (method === 'GET' && p[0] === 'rooms' && p[2] === 'state' && p[3]) {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      if (!session || !room || (memberOf(room, session.userId) !== 'join' && memberOf(room, session.userId) !== 'invite')) return fail(res, 403, 'M_FORBIDDEN');
      const stateKey = p[4] ?? '';
      const found = room.state.find((e) => e.type === p[3] && e.state_key === stateKey);
      return found ? send(res, 200, found.content) : fail(res, 404, 'M_NOT_FOUND');
    }
    if (method === 'PUT' && p[0] === 'rooms' && p[2] === 'state' && p[3]) {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      if (!session || !room || memberOf(room, session.userId) !== 'join') return fail(res, 403, 'M_FORBIDDEN');
      const body = await readJson(req);
      const next = setState(room, p[3], p[4] ?? '', session.userId, body);
      return send(res, 200, { event_id: next.event_id });
    }
    if (method === 'GET' && p[0] === 'rooms' && p[2] === 'members') {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      if (!session || !room || memberOf(room, session.userId) !== 'join') return fail(res, 403, 'M_FORBIDDEN');
      return send(res, 200, { chunk: room.state.filter((e) => e.type === 'm.room.member') });
    }
    if (method === 'POST' && p[0] === 'rooms' && p[2] === 'invite') {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      const body = await readJson(req);
      const userId = String(body.user_id ?? '');
      const status = !session || !room || memberOf(room, session.userId) !== 'join' || levelOf(room, session.userId) < 10 || !userId.startsWith('@')
        ? 403 : 200;
      matrixInvites.push({ roomId: p[1] ?? '', userId, status });
      if (status !== 200) return fail(res, 403, 'M_FORBIDDEN');
      setState(room!, 'm.room.member', userId, session!.userId, { membership: 'invite' });
      return send(res, 200, {});
    }
    if (method === 'POST' && ((p[0] === 'join' && p[1]) || (p[0] === 'rooms' && p[2] === 'join'))) {
      const session = authed(req);
      const roomId = p[0] === 'join' ? p[1]! : p[1]!;
      const room = rooms.get(roomId);
      if (!session || !room) return fail(res, 403, 'M_FORBIDDEN');
      await readJson(req).catch(() => ({}));
      const membership = memberOf(room, session.userId);
      if (membership !== 'invite' && membership !== 'join') return fail(res, 403, 'M_FORBIDDEN');
      if (membership !== 'join') setState(room, 'm.room.member', session.userId, session.userId, { membership: 'join' });
      return send(res, 200, { room_id: roomId });
    }
    if (method === 'POST' && p[0] === 'rooms' && p[2] === 'kick') {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      const body = await readJson(req);
      if (!session || !room || levelOf(room, session.userId) < 50) return fail(res, 403, 'M_FORBIDDEN');
      setState(room, 'm.room.member', String(body.user_id ?? ''), session.userId, { membership: 'leave' });
      return send(res, 200, {});
    }
    if (method === 'POST' && p[0] === 'rooms' && p[2] === 'leave') {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      if (!session || !room) return fail(res, 403, 'M_FORBIDDEN');
      setState(room, 'm.room.member', session.userId, session.userId, { membership: 'leave' });
      return send(res, 200, {});
    }
    if (method === 'GET' && p[0] === 'rooms' && p[2] === 'messages') {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      if (!session || !room) return fail(res, 403, 'M_FORBIDDEN');
      const chunk = historyAllows(room, session.userId) ? room.messages : [];
      return send(res, 200, { start: 's', end: 'e', chunk });
    }
    if (method === 'PUT' && p[0] === 'rooms' && p[2] === 'send') {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      if (!session || !room || memberOf(room, session.userId) !== 'join') return fail(res, 403, 'M_FORBIDDEN');
      const body = await readJson(req);
      const message = ev(p[3] ?? 'm.room.message', '', session.userId, body);
      room.messages.push(message);
      bump(room);
      return send(res, 200, { event_id: message.event_id });
    }
    if ((method === 'PUT' || method === 'GET') && p[0] === 'profile' && p[1] && p[2]) {
      const userId = p[1];
      const field = p[2];
      const localpart = userId.slice(1, userId.indexOf(':'));
      const user = users.get(localpart);
      if (method === 'GET') {
        if (!user) return fail(res, 404, 'M_NOT_FOUND');
        if (field === 'displayname') return send(res, 200, { displayname: user.displayName });
        return send(res, 200, { [field]: (accountData.get(`${userId}|profile|${field}`) as Record<string, unknown> | undefined)?.[field] ?? null });
      }
      const session = authed(req);
      if (!session || session.userId !== userId || !user) return fail(res, 403, 'M_FORBIDDEN');
      const body = await readJson(req);
      if (field === 'displayname' && typeof body.displayname === 'string') user.displayName = body.displayname;
      accountData.set(`${userId}|profile|${field}`, body);
      return send(res, 200, {});
    }
    if ((method === 'GET' || method === 'PUT') && p[0] === 'user' && p[2] === 'account_data' && p[3]) {
      const session = authed(req);
      const userId = p[1] ?? '';
      if (!session || session.userId !== userId) return fail(res, 403, 'M_FORBIDDEN');
      const dataKey = `${userId}|${p[3]}`;
      if (method === 'GET') {
        const found = accountData.get(dataKey);
        return found ? send(res, 200, found) : fail(res, 404, 'M_NOT_FOUND');
      }
      accountData.set(dataKey, await readJson(req));
      return send(res, 200, {});
    }
    if (method === 'POST' && p[0] === 'user' && p[2] === 'filter') {
      if (!authed(req)) return fail(res, 401, 'M_UNKNOWN_TOKEN');
      await readJson(req);
      return send(res, 200, { filter_id: 'f' });
    }
    if (method === 'GET' && p[0] === 'rooms' && p[2] === 'hierarchy') {
      const session = authed(req);
      const room = rooms.get(p[1] ?? '');
      if (!session || !room) return fail(res, 403, 'M_FORBIDDEN');
      return send(res, 200, { rooms: [] });
    }
    unknown.push(key + url.search);
    return fail(res, 404, 'M_UNRECOGNIZED');
  }

  const dir = mkdtempSync(join(tmpdir(), 'preclaim-'));
  const store: Store = openStore(join(dir, 'invites.db'));
  const mx: Matrix = matrixClient(''); // replaced once we know the port
  let matrixBase = '';
  const liveMx: Matrix = new Proxy(mx, {
    get(_target, prop, receiver) {
      const real = matrixClient(matrixBase);
      const value = Reflect.get(real, prop, receiver);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
  const key = keyFrom(SECRET);
  const app = createApp({
    cfg: { serverName: SERVER, publicUrl: 'http://127.0.0.1', registrationToken: REGISTRATION_TOKEN, workspaceAlias: `#workspace:${SERVER}`, translate: null, translateDailyLimit: 1 },
    store,
    mx: liveMx,
    sendMail: async (mail) => { mails.push({ to: mail.to }); },
    key,
    confirmKey: keyFrom(SECRET, 'pasodrum-confirm/v1', 'INVITE_SECRET'),
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      if (req.method === 'POST' && parts.length === 2 && parts[0] === 'api' && parts[1] === 'invites') inviteCreates += 1;
      void app(req, res);
      return;
    }
    void matrix(req, res, url).catch((e: unknown) => {
      if (!res.writableEnded) fail(res, 500, 'M_UNKNOWN');
      unknown.push(`crash ${(e as Error).message}`);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  const base = `http://127.0.0.1:${address.port}`;
  matrixBase = base;
  // publicUrl was captured at create; claim links are not what the tests follow (they use the code).

  const api: World['api'] = async (bearer, method, path, body) => {
    const res = await fetch(base + '/api/invites' + path, {
      method,
      headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  };

  const login: World['login'] = async (localpart, password) => {
    const res = await fetch(base + '/_matrix/client/v3/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'm.login.password', identifier: { type: 'm.id.user', user: localpart }, password }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  };

  const reads: World['reads'] = async (localpart, password, roomId) => {
    const session = await login(localpart, password);
    if (session.status !== 200 || typeof session.body.access_token !== 'string') return false;
    const access = session.body.access_token as string;
    const joined = await fetch(base + `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, { method: 'POST', headers: { authorization: `Bearer ${access}` }, body: '{}' });
    if (!joined.ok) return false;
    const page = await fetch(base + `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`, { headers: { authorization: `Bearer ${access}` } });
    const body = await page.json() as { chunk?: { content?: { body?: string } }[] };
    return !!body.chunk?.some((event) => event.content?.body === HISTORY_MARKER);
  };

  return {
    base,
    serverName: SERVER,
    admin,
    staffB,
    attacker,
    rooms: { workspace, general, spaceA, chatA, spaceB, chatB },
    marker: HISTORY_MARKER,
    mails,
    unknown,
    get inviteCreates() { return inviteCreates; },
    matrixInvites,
    api,
    membership: (roomId, userId) => {
      const room = rooms.get(roomId);
      return room ? memberOf(room, userId) : undefined;
    },
    login,
    reads,
    accountId: (email) => id(localpartFor(email, SERVER)),
    close: async () => {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    },
  };
}
