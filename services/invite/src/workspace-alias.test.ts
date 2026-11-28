// The invite service must pin the workspace by room id (`cfg.workspaceId`, the WORKSPACE_ID setting) and use that room
// for every check below. The #workspace alias is only a name for it: if a lookup does not return that id, fail closed.
// A second lookup must not choose a different room than the one that was authorized.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { powerLevels } from '../../../apps/web/src/matrix/levels.ts';
import { createApp, type Config } from './app.ts';
import { homeserverGet, matrixClient } from './matrix.ts';
import { keyFrom } from './secret.ts';
import { openStore, type Invite, type Store } from './store.ts';

const SERVER = 'pasodrum.test';
const ALIAS = `#workspace:${SERVER}`;
const USER_PASSWORD = 'placeholder-user-password';
const SYSTEM_PASSWORD = 'placeholder-system-password';
const REGISTRATION_TOKEN = 'placeholder-registration-token';
const SECRET = 'placeholder-invite-secret-value-x';
const CONFIRM_SECRET = 'placeholder-confirm-secret-value-x';

const id = (local: string) => `@${local}:${SERVER}`;
const enc = encodeURIComponent;

type Membership = 'join' | 'invite' | 'leave' | 'ban';
type Room = {
  id: string;
  version: string;
  creator: string;
  additionalCreators: string[];
  name: string;
  kind: 'workspace' | 'client' | null;
  power: Record<string, unknown>;
  members: Map<string, Membership>;
};

/**
 * The directory and account-lock rules Continuwuity v26.9.4 (dda4bdc367) actually applies, and nothing else.
 * Alias deletion follows user_can_remove_alias; creating an alias does not check power; room creators of version 12
 * outrank everyone; locking a server admin is refused.
 */
function homeserver() {
  const users = new Map<string, { id: string; password: string; serverAdmin: boolean; locked: boolean }>();
  const tokens = new Map<string, { userId: string; deviceId: string }>();
  const rooms = new Map<string, Room>();
  const aliases = new Map<string, { roomId: string; creator: string }>();
  const registrations: string[] = [];
  const lockPuts: string[] = [];
  let directoryReads = 0;
  let flip: { after: number; to: string } | null = null;
  let seq = 0;

  const addUser = (local: string, password: string, serverAdmin = false) => {
    const userId = id(local);
    users.set(userId, { id: userId, password, serverAdmin, locked: false });
    return userId;
  };

  const userLevel = (room: Room, userId: string): number => {
    const v12 = Number(room.version) >= 12 || room.version.includes('hydra');
    if (v12 && (userId === room.creator || room.additionalCreators.includes(userId))) return Infinity;
    const usersPl = (room.power.users ?? {}) as Record<string, number>;
    const fallback = typeof room.power.users_default === 'number' ? room.power.users_default : 0;
    return usersPl[userId] ?? fallback;
  };

  const stateLevel = (room: Room, type: string): number => {
    const events = (room.power.events ?? {}) as Record<string, number>;
    if (typeof events[type] === 'number') return events[type];
    return typeof room.power.state_default === 'number' ? room.power.state_default : 50;
  };

  const canSendState = (room: Room, userId: string, type: string) => userLevel(room, userId) >= stateLevel(room, type);

  const stateOf = (room: Room) => {
    const events: { type: string; state_key: string; sender: string; content: Record<string, unknown> }[] = [
      {
        type: 'm.room.create', state_key: '', sender: room.creator,
        content: { room_version: room.version, type: 'm.space', ...(room.additionalCreators.length ? { additional_creators: room.additionalCreators } : {}) },
      },
      { type: 'm.room.power_levels', state_key: '', sender: room.creator, content: room.power },
      { type: 'm.room.name', state_key: '', sender: room.creator, content: { name: room.name } },
    ];
    if (room.kind) events.push({ type: 'work.pasodrum.space', state_key: '', sender: room.creator, content: { kind: room.kind } });
    for (const [userId, membership] of room.members) {
      events.push({ type: 'm.room.member', state_key: userId, sender: room.creator, content: { membership } });
    }
    return events;
  };

  const createRoom = (creator: string, opts: { version?: string; name?: string; kind?: Room['kind']; power?: Record<string, unknown>; additionalCreators?: string[] }) => {
    const version = opts.version ?? '12';
    const room: Room = {
      id: `!r${++seq}:${SERVER}`,
      version,
      creator,
      additionalCreators: opts.additionalCreators ?? [],
      name: opts.name ?? '',
      kind: opts.kind ?? null,
      power: opts.power ?? {
        users: {}, users_default: 0, events_default: 0, state_default: 50, invite: 0, kick: 50, ban: 50, redact: 50,
        events: { 'm.room.power_levels': 100, 'm.room.server_acl': 100, 'm.room.tombstone': 150, 'm.room.encryption': 100, 'm.room.history_visibility': 100 },
      },
      members: new Map([[creator, 'join']]),
    };
    if (Number(version) >= 12) {
      const listed = { ...((room.power.users ?? {}) as Record<string, number>) };
      delete listed[creator];
      for (const extra of room.additionalCreators) delete listed[extra];
      room.power = { ...room.power, users: listed };
    }
    rooms.set(room.id, room);
    return room;
  };

  const sessionOf = (req: IncomingMessage) => {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const session = token ? tokens.get(token) : undefined;
    if (!session) return null;
    const user = users.get(session.userId);
    if (!user || user.locked) return { locked: true as const, userId: session.userId };
    return { locked: false as const, userId: session.userId, deviceId: session.deviceId };
  };

  const issue = (userId: string, deviceId = 'DEVICE') => {
    const token = randomBytes(16).toString('hex');
    tokens.set(token, { userId, deviceId });
    return token;
  };

  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  }

  const send = (res: ServerResponse, status: number, payload?: unknown) => {
    const data = payload === undefined ? '' : JSON.stringify(payload);
    res.writeHead(status, data ? { 'content-type': 'application/json' } : {});
    res.end(data);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://hs');
    const path = decodeURIComponent(url.pathname);
    try {
      if (req.method === 'POST' && path === '/_matrix/client/v3/login') {
        const b = await body(req);
        const local = (b.identifier as { user?: string } | undefined)?.user;
        const user = [...users.values()].find((u) => u.id === id(local ?? ''));
        if (!user || b.password !== user.password) return send(res, 403, { errcode: 'M_FORBIDDEN' });
        if (user.locked) return send(res, 401, { errcode: 'M_USER_LOCKED' });
        const deviceId = typeof b.device_id === 'string' ? b.device_id : 'DEVICE';
        return send(res, 200, { access_token: issue(user.id, deviceId), user_id: user.id, device_id: deviceId });
      }
      if (req.method === 'GET' && path === '/_matrix/client/v3/register/available') {
        const local = url.searchParams.get('username') ?? '';
        const taken = [...users.values()].some((u) => u.id === id(local));
        return taken ? send(res, 400, { errcode: 'M_USER_IN_USE' }) : send(res, 200, { available: true });
      }
      if (req.method === 'POST' && path === '/_matrix/client/v3/register') {
        const b = await body(req);
        const local = String(b.username ?? '');
        if ([...users.values()].some((u) => u.id === id(local))) return send(res, 400, { errcode: 'M_USER_IN_USE' });
        const auth = b.auth as { type?: string; token?: string; session?: string } | undefined;
        if (!auth) return send(res, 401, { session: 'reg-session' });
        if (auth.type !== 'm.login.registration_token' || auth.token !== REGISTRATION_TOKEN) return send(res, 401, { errcode: 'M_FORBIDDEN' });
        const userId = addUser(local, String(b.password ?? ''));
        registrations.push(userId);
        return send(res, 200, { access_token: issue(userId), user_id: userId });
      }
      if (req.method === 'GET' && path === '/_matrix/client/v3/account/whoami') {
        const session = sessionOf(req);
        if (!session) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        if (session.locked) return send(res, 401, { errcode: 'M_USER_LOCKED' });
        return send(res, 200, { user_id: session.userId, device_id: session.deviceId });
      }
      if (req.method === 'POST' && path === '/_matrix/client/v3/logout') return send(res, 200, {});
      if (req.method === 'PUT' && path.startsWith('/_matrix/client/v3/profile/')) return send(res, 200, {});

      const aliasPath = '/_matrix/client/v3/directory/room/';
      if (path.startsWith(aliasPath)) {
        const alias = path.slice(aliasPath.length);
        if (!alias.endsWith(`:${SERVER}`)) return send(res, 400, { errcode: 'M_INVALID_PARAM' });
        if (req.method === 'GET') {
          const row = aliases.get(alias);
          if (!row) return send(res, 404, { errcode: 'M_NOT_FOUND' });
          const roomId = row.roomId;
          directoryReads += 1;
          if (flip && directoryReads >= flip.after) {
            row.roomId = flip.to;
            flip = null;
          }
          return send(res, 200, { room_id: roomId });
        }
        const session = sessionOf(req);
        if (!session || session.locked) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        if (req.method === 'DELETE') {
          const row = aliases.get(alias);
          if (!row) return send(res, 404, { errcode: 'M_NOT_FOUND' });
          const room = rooms.get(row.roomId);
          const user = users.get(session.userId)!;
          const allowed = row.creator === session.userId || user.serverAdmin || (!!room && canSendState(room, session.userId, 'm.room.canonical_alias'));
          if (!allowed) return send(res, 403, { errcode: 'M_FORBIDDEN' });
          aliases.delete(alias);
          return send(res, 200, {});
        }
        if (req.method === 'PUT') {
          if (aliases.has(alias)) return send(res, 409, { errcode: 'M_UNKNOWN' });
          const b = await body(req);
          if (typeof b.room_id !== 'string') return send(res, 400, { errcode: 'M_BAD_JSON' });
          aliases.set(alias, { roomId: b.room_id, creator: session.userId });
          return send(res, 200, {});
        }
      }

      if (req.method === 'POST' && path === '/_matrix/client/v3/createRoom') {
        const session = sessionOf(req);
        if (!session || session.locked) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        const b = await body(req);
        const creation = (b.creation_content ?? {}) as { type?: string };
        const room = createRoom(session.userId, {
          version: typeof b.room_version === 'string' ? b.room_version : '12',
          name: typeof b.name === 'string' ? b.name : '',
          kind: creation.type === 'm.space' ? null : null,
          power: (b.power_level_content_override as Record<string, unknown> | undefined) ?? undefined,
        });
        return send(res, 200, { room_id: room.id });
      }

      const invite = path.match(/^\/_matrix\/client\/v3\/rooms\/(.+)\/invite$/);
      if (req.method === 'POST' && invite) {
        const session = sessionOf(req);
        if (!session || session.locked) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        const room = rooms.get(invite[1]!);
        if (!room || room.members.get(session.userId) !== 'join') return send(res, 403, { errcode: 'M_FORBIDDEN' });
        const b = await body(req);
        const userId = String(b.user_id ?? '');
        if (!users.has(userId)) return send(res, 404, { errcode: 'M_NOT_FOUND' });
        const current = room.members.get(userId);
        if (current === 'join' || current === 'ban') return send(res, 403, { errcode: 'M_FORBIDDEN' });
        const inviteLevel = typeof room.power.invite === 'number' ? room.power.invite : 0;
        if (userLevel(room, session.userId) < inviteLevel) return send(res, 403, { errcode: 'M_FORBIDDEN' });
        room.members.set(userId, 'invite');
        return send(res, 200, {});
      }

      const join = path.match(/^\/_matrix\/client\/v3\/join\/(.+)$/);
      if (req.method === 'POST' && join) {
        const session = sessionOf(req);
        if (!session || session.locked) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        const room = rooms.get(join[1]!);
        if (!room) return send(res, 404, { errcode: 'M_NOT_FOUND' });
        const current = room.members.get(session.userId);
        if (current !== 'invite' && current !== 'join') return send(res, 403, { errcode: 'M_FORBIDDEN' });
        room.members.set(session.userId, 'join');
        return send(res, 200, { room_id: room.id });
      }

      const member = path.match(/^\/_matrix\/client\/v3\/rooms\/(.+)\/state\/m\.room\.member\/(.+)$/);
      if (req.method === 'GET' && member) {
        const session = sessionOf(req);
        if (!session || session.locked) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        const room = rooms.get(member[1]!);
        if (!room || room.members.get(session.userId) !== 'join') return send(res, 403, { errcode: 'M_FORBIDDEN' });
        const membership = room.members.get(member[2]!);
        if (!membership) return send(res, 404, { errcode: 'M_NOT_FOUND' });
        return send(res, 200, { membership });
      }

      const state = path.match(/^\/_matrix\/client\/v3\/rooms\/(.+)\/state$/);
      if (req.method === 'GET' && state) {
        const session = sessionOf(req);
        if (!session || session.locked) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        const room = rooms.get(state[1]!);
        if (!room || room.members.get(session.userId) !== 'join') return send(res, 403, { errcode: 'M_FORBIDDEN' });
        return send(res, 200, stateOf(room));
      }

      const lock = path.match(/^\/_matrix\/client\/v1\/admin\/lock\/(.+)$/);
      if (lock) {
        const session = sessionOf(req);
        if (!session || session.locked) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        const actor = users.get(session.userId)!;
        if (!actor.serverAdmin) return send(res, 403, { errcode: 'M_FORBIDDEN' });
        const target = users.get(lock[1]!);
        if (!target) return send(res, 404, { errcode: 'M_NOT_FOUND' });
        if (req.method === 'PUT') {
          // The attempt is the call itself. Continuwuity then refuses to lock a server admin or the caller.
          lockPuts.push(target.id);
          if (target.id === session.userId || target.serverAdmin) return send(res, 403, { errcode: 'M_FORBIDDEN' });
          const b = await body(req);
          if (b.locked === true) target.locked = true;
          if (b.locked === false) target.locked = false;
          return send(res, 200, { locked: target.locked });
        }
        if (req.method === 'GET') {
          if (target.serverAdmin && target.id !== session.userId) return send(res, 403, { errcode: 'M_FORBIDDEN' });
          return send(res, 200, { locked: target.locked });
        }
      }
      send(res, 404, { errcode: 'M_UNRECOGNIZED' });
    } catch (e) {
      send(res, 500, { error: (e as Error).message });
    }
  });

  return {
    registrations,
    lockPuts,
    users,
    rooms,
    addUser,
    createRoom,
    issue,
    aliasRoom: () => aliases.get(ALIAS)?.roomId ?? null,
    pointAlias(roomId: string, creator: string) {
      aliases.set(ALIAS, { roomId, creator });
    },
    /** The next `after` directory reads return the current room; the read that reaches `after` leaves the alias on `to`. */
    armFlip(after: number, to: string) {
      directoryReads = 0;
      flip = { after, to };
    },
    url: () => `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    listen: () => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

type Hs = ReturnType<typeof homeserver>;

function person(userId: string, spaceId: string, claimed: boolean): Invite {
  return {
    code: randomBytes(18).toString('base64url'),
    email: `${userId.slice(1, userId.indexOf(':'))}@example.test`,
    name: null,
    role: 'staff',
    userId,
    spaceId,
    spaceName: 'Pasodrum',
    spaceKind: 'workspace',
    inviterId: id('admin'),
    inviterName: 'Admin',
    team: [],
    rooms: [spaceId],
    locale: 'en',
    secret: claimed ? null : 'sealed-placeholder',
    createdTs: 1,
    expiresTs: 9_000_000_000_000,
    claimedTs: claimed ? 1 : null,
    revokedTs: null,
  };
}

type World = {
  hs: Hs;
  store: Store;
  base: string;
  workspace: string;
  admin: string;
  owner: string;
  ranked: string;
  peer: string;
  staff: string;
  root: string;
  call: (token: string | null, method: string, path: string, body?: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
  /** Starts the invite service. Alias changes made before this are what a startup cache would see. */
  start: () => Promise<void>;
  close: () => Promise<void>;
};

async function world(opts?: { assistant?: boolean; hold?: boolean }): Promise<World> {
  const hs = homeserver();
  await hs.listen();
  const root = id('root');
  hs.addUser('root', USER_PASSWORD, true);
  const admin = hs.addUser('admin', USER_PASSWORD);
  const owner = hs.addUser('owner', USER_PASSWORD);
  const ranked = hs.addUser('ranked', USER_PASSWORD);
  const peer = hs.addUser('peer', USER_PASSWORD);
  const staff = hs.addUser('staff', USER_PASSWORD);
  hs.addUser('pasodrum', SYSTEM_PASSWORD, true);
  const workspace = hs.createRoom(root, {
    version: '12',
    name: 'Pasodrum',
    kind: 'workspace',
    additionalCreators: [owner],
    power: powerLevels('workspace', 'space', { [admin]: 50, [peer]: 50, [ranked]: 100, [staff]: 10 }) as unknown as Record<string, unknown>,
  });
  for (const userId of [admin, owner, ranked, peer, staff]) workspace.members.set(userId, 'join');
  hs.pointAlias(workspace.id, root);

  const dir = await mkdtemp(join(tmpdir(), 'alias-workspace-'));
  const store = openStore(join(dir, 'invites.db'));
  const cfg: Config = {
    serverName: SERVER,
    publicUrl: 'http://localhost:5173',
    registrationToken: REGISTRATION_TOKEN,
    workspaceAlias: ALIAS,
    translate: null,
    translateDailyLimit: 0,
  };
  // Pin. The running service ignores this until it requires the room id instead of the alias.
  Object.assign(cfg, { workspaceId: workspace.id });
  let handler: ReturnType<typeof createApp> | undefined;
  let app: ReturnType<typeof createServer> | undefined;
  let base = '';
  const start = async () => {
    if (app) return;
    handler = createApp({
      cfg,
      store,
      mx: matrixClient(hs.url()),
      sendMail: async () => {},
      key: keyFrom(SECRET),
      confirmKey: keyFrom(CONFIRM_SECRET),
      systemPassword: SYSTEM_PASSWORD,
      now: () => 1_700_000_000_000,
      ...(opts?.assistant
        ? {
            assistant: {
              get: homeserverGet(hs.url()),
              config: {
                apiKey: 'placeholder-api-key',
                quick: 'placeholder:low',
                thorough: 'placeholder:low',
                prices: { placeholder: { in: 0, cached: 0, write: 0, out: 0 } },
                dayUsd: 3,
                monthUsd: 100,
                dbPath: join(dir, 'assistant.db'),
                workspaceAlias: ALIAS,
                serverName: SERVER,
              },
            },
          }
        : {}),
    });
    app = createServer(handler);
    await new Promise<void>((resolve) => app!.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(app.address() as { port: number }).port}`;
  };
  if (!opts?.hold) await start();
  const call = async (token: string | null, method: string, path: string, payload?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* not json */ }
    return { status: res.status, body: parsed };
  };
  return {
    hs, store, get base() { return base; }, workspace: workspace.id, admin, owner, ranked, peer, staff, root,
    call,
    start,
    close: async () => {
      handler?.closeSockets();
      if (app) await new Promise<void>((resolve, reject) => app!.close((err) => (err ? reject(err) : resolve())));
      await hs.close();
      store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function hsCall(hs: Hs, token: string | null, method: string, path: string, payload?: unknown) {
  const res = await fetch(hs.url() + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* not json */ }
  return { status: res.status, body: parsed };
}

/** What an Admin can do to #workspace on Continuwuity: delete it, point it at a room they create, invite the target. */
async function repoint(w: World, target: string) {
  const adminToken = w.hs.issue(w.admin);
  const staffToken = w.hs.issue(w.staff);
  const aliasPath = `/_matrix/client/v3/directory/room/${enc(ALIAS)}`;
  const staffDelete = await hsCall(w.hs, staffToken, 'DELETE', aliasPath);
  if (staffDelete.status !== 403) throw new Error(`staff alias delete → ${staffDelete.status}`);
  const deleted = await hsCall(w.hs, adminToken, 'DELETE', aliasPath);
  if (deleted.status !== 200) throw new Error(`admin alias delete → ${deleted.status}`);
  const created = await hsCall(w.hs, adminToken, 'POST', '/_matrix/client/v3/createRoom', {
    name: 'Not Pasodrum',
    room_version: '12',
    creation_content: { type: 'm.space' },
  });
  if (created.status !== 200 || typeof created.body.room_id !== 'string') throw new Error(`createRoom → ${created.status}`);
  const fake = created.body.room_id;
  const put = await hsCall(w.hs, adminToken, 'PUT', aliasPath, { room_id: fake });
  if (put.status !== 200) throw new Error(`alias put → ${put.status}`);
  const invited = await hsCall(w.hs, adminToken, 'POST', `/_matrix/client/v3/rooms/${enc(fake)}/invite`, { user_id: target });
  if (invited.status !== 200) throw new Error(`invite → ${invited.status}`);
  return fake;
}

function track(w: World, userId: string) {
  const claimed = person(userId, w.workspace, true);
  const open = person(userId, w.workspace, false);
  w.store.insert(claimed);
  w.store.insert(open);
  w.store.putConfirmKey(userId, 'sealed-placeholder', 'key-placeholder', 1);
  return open.code;
}

function aftermath(w: World, userId: string, openCode: string) {
  return {
    locked: w.hs.users.get(userId)?.locked ?? null,
    locks: w.hs.lockPuts.filter((id) => id === userId),
    revoked: w.store.get(openCode)?.revokedTs ?? null,
    key: w.store.confirmKey(userId)?.keyId ?? null,
  };
}

const intact = { locked: false, locks: [] as string[], revoked: null, key: 'key-placeholder' };

let current: World | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe('workspace alias is not the workspace', () => {
  it('still lets an admin remove staff while the alias names the pinned room', async () => {
    const w = current = await world();
    const open = track(w, w.staff);
    const res = await w.call(w.hs.issue(w.admin), 'DELETE', `/api/invites/person?userId=${enc(w.staff)}`);
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(aftermath(w, w.staff, open).locked).toBe(true);
  });

  it('refuses an admin removing an owner, a peer admin, or a level-100 member of the pinned room', async () => {
    const w = current = await world();
    for (const target of [w.owner, w.peer, w.ranked, w.root]) {
      const open = track(w, target);
      const res = await w.call(w.hs.issue(w.admin), 'DELETE', `/api/invites/person?userId=${enc(target)}`);
      expect(res.status).toBe(403);
      expect(aftermath(w, target, open)).toEqual(intact);
    }
  });

  it('does not lock an owner after an admin points the alias at a room they outrank', async () => {
    const w = current = await world();
    const open = track(w, w.owner);
    await repoint(w, w.owner);
    const res = await w.call(w.hs.issue(w.admin), 'DELETE', `/api/invites/person?userId=${enc(w.owner)}`);
    expect(res.status).toBe(403);
    expect(aftermath(w, w.owner, open)).toEqual(intact);
  });

  it('does not lock an owner when the service starts with the alias already pointing elsewhere', async () => {
    const w = current = await world({ hold: true });
    const open = track(w, w.owner);
    await repoint(w, w.owner);
    await w.start();
    const res = await w.call(w.hs.issue(w.admin), 'DELETE', `/api/invites/person?userId=${enc(w.owner)}`);
    expect(res.status).toBe(403);
    expect(aftermath(w, w.owner, open)).toEqual(intact);
  });

  it('does not lock a peer admin or a level-100 member through that room', async () => {
    const w = current = await world();
    for (const target of [w.peer, w.ranked]) {
      const open = track(w, target);
      await repoint(w, target);
      const res = await w.call(w.hs.issue(w.admin), 'DELETE', `/api/invites/person?userId=${enc(target)}`);
      expect(res.status).toBe(403);
      expect(aftermath(w, target, open)).toEqual(intact);
      w.hs.pointAlias(w.workspace, w.root);
    }
  });

  it('does not ask the homeserver to lock a server admin through that room', async () => {
    const w = current = await world();
    const open = track(w, w.root);
    await repoint(w, w.root);
    const res = await w.call(w.hs.issue(w.admin), 'DELETE', `/api/invites/person?userId=${enc(w.root)}`);
    expect(res.status).toBe(403);
    expect(aftermath(w, w.root, open)).toEqual(intact);
  });

  it('does not lock a person who is only invited to the room the alias names', async () => {
    const w = current = await world();
    const outsider = w.hs.addUser('outsider', USER_PASSWORD);
    const open = track(w, outsider);
    await repoint(w, outsider);
    const res = await w.call(w.hs.issue(w.admin), 'DELETE', `/api/invites/person?userId=${enc(outsider)}`);
    expect(res.status).toBe(403);
    expect(aftermath(w, outsider, open)).toEqual(intact);
  });

  it('does not lock an owner when the alias changes between the check and the removal', async () => {
    const w = current = await world();
    const open = track(w, w.owner);
    const adminToken = w.hs.issue(w.admin);
    const created = await hsCall(w.hs, adminToken, 'POST', '/_matrix/client/v3/createRoom', {
      room_version: '12', creation_content: { type: 'm.space' },
    });
    const fake = String(created.body.room_id);
    expect((await hsCall(w.hs, adminToken, 'POST', `/_matrix/client/v3/rooms/${enc(fake)}/invite`, { user_id: w.owner })).status).toBe(200);
    w.hs.armFlip(1, fake);
    const res = await w.call(adminToken, 'DELETE', `/api/invites/person?userId=${enc(w.owner)}`);
    expect(res.status).toBe(403);
    expect(aftermath(w, w.owner, open)).toEqual(intact);
  });

  it('does not register a staff account when the alias names a room other than the pin', async () => {
    const w = current = await world();
    const fake = await repoint(w, w.owner);
    const res = await w.call(w.hs.issue(w.admin), 'POST', '/api/invites', {
      email: 'new.person@example.test', role: 'staff', spaceId: fake, channelIds: [], locale: 'en',
    });
    expect(res.status).toBe(403);
    expect(w.hs.registrations).toEqual([]);
    expect(w.store.pendingForRoom(fake)).toEqual([]);
  });

  it('does not revoke a client space\'s codes when the alias names a room the admin outranks', async () => {
    const w = current = await world();
    const client = w.hs.createRoom(w.admin, { version: '12', name: 'Kumo', kind: 'client' });
    const open = person(w.staff, client.id, false);
    open.spaceKind = 'client';
    w.store.insert(open);
    await repoint(w, w.owner);
    const res = await w.call(w.hs.issue(w.admin), 'DELETE', `/api/invites/space?spaceId=${enc(client.id)}`);
    expect(res.status).toBe(403);
    expect(w.store.get(open.code)?.revokedTs ?? null).toBeNull();
  });

  it('does not translate for someone who has only joined the room the alias names', async () => {
    const w = current = await world();
    const outsider = w.hs.addUser('reader', USER_PASSWORD);
    const fake = await repoint(w, outsider);
    expect((await hsCall(w.hs, w.hs.issue(outsider), 'POST', `/_matrix/client/v3/join/${enc(fake)}`, {})).status).toBe(200);
    const res = await w.call(w.hs.issue(outsider), 'POST', '/api/translate', { segments: ['hello'], to: 'ja' });
    expect(res.status).toBe(403);
  });

  it('does not let a workspace member save a confirm key by leaving the alias room', async () => {
    const w = current = await world();
    await repoint(w, w.owner);
    const res = await w.call(w.hs.issue(w.staff, 'PHONE'), 'POST', '/api/invites/confirm/key', { key: 'recovery-key-placeholder', keyId: 'key-placeholder' });
    expect(res.status).toBe(403);
    expect(w.store.confirmKey(w.staff)).toBeUndefined();
  });

  it('does not drop a client confirm key when the alias names a room the client has joined', async () => {
    const w = current = await world();
    const client = w.hs.addUser('client', USER_PASSWORD);
    w.store.putConfirmKey(client, 'sealed-placeholder', 'key-placeholder', 1);
    const fake = await repoint(w, client);
    expect((await hsCall(w.hs, w.hs.issue(client), 'POST', `/_matrix/client/v3/join/${enc(fake)}`, {})).status).toBe(200);
    await w.call(w.hs.issue(client, 'PHONE'), 'GET', '/api/invites/confirm/me');
    expect(w.store.confirmKey(client)?.keyId).toBe('key-placeholder');
  });

  it('does not admit the assistant for someone who has only joined the room the alias names', async () => {
    const w = current = await world({ assistant: true });
    const outsider = w.hs.addUser('asker', USER_PASSWORD);
    const fake = await repoint(w, outsider);
    expect((await hsCall(w.hs, w.hs.issue(outsider), 'POST', `/_matrix/client/v3/join/${enc(fake)}`, {})).status).toBe(200);
    const res = await w.call(w.hs.issue(outsider), 'GET', '/api/assistant/status?tz=0');
    expect(res.status).toBe(403);
  });

  it('does not admit the assistant when the alias changes between the check and the read', async () => {
    const w = current = await world({ assistant: true });
    const outsider = w.hs.addUser('asker', USER_PASSWORD);
    const adminToken = w.hs.issue(w.admin);
    const created = await hsCall(w.hs, adminToken, 'POST', '/_matrix/client/v3/createRoom', { room_version: '12', creation_content: { type: 'm.space' } });
    const fake = String(created.body.room_id);
    expect((await hsCall(w.hs, adminToken, 'POST', `/_matrix/client/v3/rooms/${enc(fake)}/invite`, { user_id: outsider })).status).toBe(200);
    expect((await hsCall(w.hs, w.hs.issue(outsider), 'POST', `/_matrix/client/v3/join/${enc(fake)}`, {})).status).toBe(200);
    w.hs.armFlip(1, fake);
    const res = await w.call(w.hs.issue(outsider), 'GET', '/api/assistant/status?tz=0');
    expect(res.status).toBe(403);
  });
});
