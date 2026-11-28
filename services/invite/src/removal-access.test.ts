// Spec for removal vs open invite links. These fail while a removed Admin or Staff member can
// still claim a link they created or, as an Admin, read from the pending list.
//
// The homeserver below speaks the client calls in matrix.ts (register, login, change password,
// account data, lock). Password change follows continuwuity v26.9.0
// src/api/client/account/mod.rs change_password_route: a signed-in user whose current password
// checks out gets that new password, and a later password login succeeds with it.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { matrixClient } from './matrix.ts';
import type { StateEvent } from './rules.ts';
import { keyFrom } from './secret.ts';
import { openStore } from './store.ts';

const SERVER = 'pasodrum.test';
const PUBLIC = 'http://pasodrum.test';
const REG_TOKEN = 'placeholder-registration-token';
const SYSTEM_PASSWORD = 'placeholder-system-password';
const CLAIM_PASSWORD = 'placeholder-claimed-password';
const CLAIM_NAME = 'Claimed Name';

const ownerId = `@owner:${SERVER}`;
const adminId = `@admin:${SERVER}`;
const staffId = `@staff:${SERVER}`;
const ws = `!ws:${SERVER}`;
const general = `!general:${SERVER}`;
const clientA = `!clienta:${SERVER}`;
const clientB = `!clientb:${SERVER}`;
const alias = `#workspace:${SERVER}`;

const OWNER = 'placeholder-owner-token';
const ADMIN = 'placeholder-admin-token';
const STAFF = 'placeholder-staff-token';

type User = {
  localpart: string;
  userId: string;
  password: string | null;
  locked: boolean;
  admin: boolean;
  displayname: string | null;
  account: Record<string, Record<string, unknown>>;
  generation: number;
  logins: number;
};

type TokenRec = { userId: string; deviceId: string };

function member(id: string, name: string): StateEvent {
  return { type: 'm.room.member', state_key: id, content: { membership: 'join', displayname: name } };
}
function power(users: Record<string, number>): StateEvent {
  return { type: 'm.room.power_levels', state_key: '', content: { users } };
}

function roomEvents(): Map<string, StateEvent[]> {
  const workspace: StateEvent[] = [
    { type: 'm.room.create', state_key: '', sender: ownerId, content: { room_version: '10' } },
    { type: 'm.room.name', state_key: '', content: { name: 'Pasodrum' } },
    power({ [ownerId]: 100, [adminId]: 50, [staffId]: 10 }),
    member(ownerId, 'Owner'),
    member(adminId, 'Admin'),
    member(staffId, 'Staff'),
  ];
  const client = (id: string, name: string, levels: Record<string, number>, people: [string, string][]): StateEvent[] => [
    { type: 'm.room.create', state_key: '', sender: ownerId, content: { room_version: '10' } },
    { type: 'm.room.name', state_key: '', content: { name } },
    { type: 'work.pasodrum.space', state_key: '', sender: ownerId, content: { kind: 'client' } },
    power({ [ownerId]: 100, ...levels }),
    member(ownerId, 'Owner'),
    ...people.map(([pid, pname]) => member(pid, pname)),
  ];
  return new Map([
    [ws, workspace],
    // Admin is a member at Admin level, so the pending list shows them every open link.
    [clientA, client(clientA, 'Client A', { [adminId]: 50, [staffId]: 10 }, [[adminId, 'Admin'], [staffId, 'Staff']])],
    // Admin is not a member. Staff can invite clients; an Admin cannot read those links.
    [clientB, client(clientB, 'Client B', { [staffId]: 10 }, [[staffId, 'Staff']])],
  ]);
}

function startMatrix() {
  const users = new Map<string, User>();
  const byLocal = new Map<string, User>();
  const tokens = new Map<string, TokenRec>();
  const sessions = new Map<string, string>();
  let seq = 0;
  const add = (user: User, token?: string) => {
    users.set(user.userId, user);
    byLocal.set(user.localpart, user);
    if (token) tokens.set(token, { userId: user.userId, deviceId: 'SEED' });
  };
  const make = (localpart: string, password: string | null, extra: Partial<User> = {}): User => ({
    localpart, userId: `@${localpart}:${SERVER}`, password, locked: false, admin: false, displayname: null, account: {}, generation: 0, logins: 0, ...extra,
  });
  add(make('owner', null, { displayname: 'Owner' }), OWNER);
  add(make('admin', null, { displayname: 'Admin' }), ADMIN);
  add(make('staff', null, { displayname: 'Staff' }), STAFF);
  add(make('pasodrum', SYSTEM_PASSWORD, { displayname: 'Pasodrum', admin: true }));

  const rooms = roomEvents();
  const joined = (roomId: string, userId: string) =>
    (rooms.get(roomId) ?? []).some((e) => e.type === 'm.room.member' && e.state_key === userId && e.content?.membership === 'join');

  const readBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (!chunks.length) return {};
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  };
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const bearer = (req: IncomingMessage): TokenRec | null => {
    const m = req.headers.authorization?.match(/^Bearer (\S+)$/);
    return m ? tokens.get(m[1]!) ?? null : null;
  };
  const issue = (user: User, deviceId = 'DEV') => {
    if (user.locked) return null;
    const access = `placeholder-access-${++seq}`;
    tokens.set(access, { userId: user.userId, deviceId });
    user.logins += 1;
    return access;
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://matrix');
      const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
      const method = req.method ?? 'GET';
      if (parts[0] !== '_matrix') return send(res, 404, { errcode: 'M_UNRECOGNIZED' });

      if (method === 'GET' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'account' && parts[4] === 'whoami') {
        const tok = bearer(req);
        const user = tok && users.get(tok.userId);
        if (!tok || !user || user.locked) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        return send(res, 200, { user_id: user.userId, device_id: tok.deviceId });
      }

      if (method === 'GET' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'register' && parts[4] === 'available') {
        const username = url.searchParams.get('username') ?? '';
        if (!username || byLocal.has(username)) return send(res, 400, { errcode: 'M_USER_IN_USE' });
        return send(res, 200, { available: true });
      }

      if (method === 'POST' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'register' && parts.length === 4) {
        const body = await readBody(req);
        const username = typeof body.username === 'string' ? body.username : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!username || byLocal.has(username)) return send(res, 400, { errcode: 'M_USER_IN_USE' });
        const auth = body.auth;
        const authObj = auth && typeof auth === 'object' && !Array.isArray(auth) ? auth as Record<string, unknown> : null;
        if (!authObj) {
          const session = `placeholder-session-${++seq}`;
          sessions.set(session, username);
          return send(res, 401, { session, flows: [{ stages: ['m.login.registration_token'] }] });
        }
        const session = typeof authObj.session === 'string' ? authObj.session : '';
        if (sessions.get(session) !== username || authObj.type !== 'm.login.registration_token' || authObj.token !== REG_TOKEN) {
          return send(res, 401, { errcode: 'M_FORBIDDEN', session });
        }
        sessions.delete(session);
        const user = make(username, password);
        add(user);
        const access = issue(user, 'REG');
        return send(res, 200, { access_token: access, user_id: user.userId, device_id: 'REG' });
      }

      if (method === 'POST' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'login') {
        const body = await readBody(req);
        const ident = body.identifier;
        const identObj = ident && typeof ident === 'object' && !Array.isArray(ident) ? ident as Record<string, unknown> : null;
        const localpart = identObj && typeof identObj.user === 'string' ? identObj.user : '';
        const user = byLocal.get(localpart);
        if (!user || user.locked || user.password === null || body.password !== user.password || body.type !== 'm.login.password') {
          return send(res, 403, { errcode: 'M_FORBIDDEN' });
        }
        const device = typeof body.device_id === 'string' ? body.device_id : 'LOGIN';
        return send(res, 200, { access_token: issue(user, device), user_id: user.userId, device_id: device });
      }

      if (method === 'POST' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'account' && parts[4] === 'password') {
        // continuwuity change_password_route: the access token's user, after the password UIAA, stores new_password.
        const tok = bearer(req);
        const user = tok && users.get(tok.userId);
        const body = await readBody(req);
        const auth = body.auth;
        const authObj = auth && typeof auth === 'object' && !Array.isArray(auth) ? auth as Record<string, unknown> : null;
        const ident = authObj?.identifier;
        const identObj = ident && typeof ident === 'object' && !Array.isArray(ident) ? ident as Record<string, unknown> : null;
        const localpart = identObj && typeof identObj.user === 'string' ? identObj.user : '';
        if (!user || user.locked || !authObj || authObj.type !== 'm.login.password' || localpart !== user.localpart || authObj.password !== user.password) {
          return send(res, 401, { errcode: 'M_FORBIDDEN', flows: [{ stages: ['m.login.password'] }] });
        }
        if (typeof body.new_password !== 'string' || !body.new_password) return send(res, 400, { errcode: 'M_WEAK_PASSWORD' });
        user.password = body.new_password;
        user.generation += 1;
        if (body.logout_devices === true) {
          for (const [access, rec] of tokens) if (rec.userId === user.userId && access !== req.headers.authorization?.replace(/^Bearer /, '')) tokens.delete(access);
        }
        return send(res, 200, {});
      }

      if (method === 'POST' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'logout') {
        const header = req.headers.authorization?.replace(/^Bearer /, '');
        if (header) tokens.delete(header);
        return send(res, 200, {});
      }

      if (parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'rooms' && parts[5] === 'state' && parts.length === 6) {
        const tok = bearer(req);
        const roomId = parts[4]!;
        if (!tok || !joined(roomId, tok.userId)) return send(res, 403, { errcode: 'M_FORBIDDEN' });
        return send(res, 200, rooms.get(roomId) ?? []);
      }

      if (method === 'GET' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'rooms' && parts[5] === 'state' && parts[6] === 'm.room.member' && parts.length === 8) {
        const tok = bearer(req);
        const roomId = parts[4]!;
        if (!tok || !joined(roomId, tok.userId)) return send(res, 403, { errcode: 'M_FORBIDDEN' });
        const ev = (rooms.get(roomId) ?? []).find((e) => e.type === 'm.room.member' && e.state_key === parts[7]);
        if (!ev) return send(res, 404, { errcode: 'M_NOT_FOUND' });
        return send(res, 200, ev.content ?? {});
      }

      if (method === 'GET' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'directory' && parts[4] === 'room' && parts.length === 6) {
        if (!bearer(req)) return send(res, 401, { errcode: 'M_UNKNOWN_TOKEN' });
        if (parts[5] !== alias) return send(res, 404, { errcode: 'M_NOT_FOUND' });
        return send(res, 200, { room_id: ws });
      }

      if (parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'profile' && parts.length === 6 && parts[5] === 'displayname') {
        const user = users.get(parts[4]!);
        if (!user) return send(res, 404, { errcode: 'M_NOT_FOUND' });
        if (method === 'GET') return send(res, 200, user.displayname ? { displayname: user.displayname } : {});
        if (method === 'PUT') {
          const tok = bearer(req);
          if (!tok || tok.userId !== user.userId) return send(res, 403, { errcode: 'M_FORBIDDEN' });
          const body = await readBody(req);
          user.displayname = typeof body.displayname === 'string' ? body.displayname : null;
          return send(res, 200, {});
        }
      }

      if (method === 'PUT' && parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'profile' && parts.length === 6) {
        const tok = bearer(req);
        const user = users.get(parts[4]!);
        if (!tok || !user || tok.userId !== user.userId) return send(res, 403, { errcode: 'M_FORBIDDEN' });
        return send(res, 200, {});
      }

      if (parts[1] === 'client' && parts[2] === 'v3' && parts[3] === 'user' && parts[5] === 'account_data' && parts.length === 7) {
        const tok = bearer(req);
        const user = users.get(parts[4]!);
        if (!tok || !user || tok.userId !== user.userId) return send(res, 403, { errcode: 'M_FORBIDDEN' });
        const type = parts[6]!;
        if (method === 'GET') {
          const data = user.account[type];
          return data ? send(res, 200, data) : send(res, 404, { errcode: 'M_NOT_FOUND' });
        }
        if (method === 'PUT') {
          user.account[type] = await readBody(req);
          return send(res, 200, {});
        }
      }

      if (parts[1] === 'client' && parts[2] === 'v1' && parts[3] === 'admin' && parts[4] === 'lock' && parts.length === 6) {
        const tok = bearer(req);
        const caller = tok && users.get(tok.userId);
        if (!caller?.admin) return send(res, 403, { errcode: 'M_FORBIDDEN' });
        const user = users.get(parts[5]!);
        if (!user) return send(res, 404, { errcode: 'M_NOT_FOUND' });
        if (method === 'PUT') {
          const body = await readBody(req);
          if (body.locked === true) {
            user.locked = true;
            for (const [access, rec] of tokens) if (rec.userId === user.userId) tokens.delete(access);
          }
          return send(res, 200, { locked: user.locked });
        }
        if (method === 'GET') return send(res, 200, { locked: user.locked });
      }

      return send(res, 404, { errcode: 'M_UNRECOGNIZED', path: url.pathname });
    } catch (e) {
      send(res, 500, { errcode: 'M_UNKNOWN', error: (e as Error).message });
    }
  });

  const port = new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

  return {
    server,
    port,
    url: port.then((p) => `http://127.0.0.1:${p}`),
    finger(userId: string) {
      const user = users.get(userId);
      if (!user) return '';
      return JSON.stringify({
        generation: user.generation,
        logins: user.logins,
        displayname: user.displayname,
        spaces: user.account['work.pasodrum.spaces'] ?? null,
        invited: user.account['work.pasodrum.invited'] ?? null,
        settings: user.account['work.pasodrum.settings'] ?? null,
      });
    },
    invited(userId: string) {
      return users.get(userId)?.account['work.pasodrum.invited'] ?? null;
    },
  };
}

function disclosed(row: Record<string, unknown>): string | null {
  if (typeof row.code === 'string' && /^[A-Za-z0-9_-]{24}$/.test(row.code)) return row.code;
  const prefix = `${PUBLIC}/join/`;
  if (typeof row.link === 'string' && row.link.startsWith(prefix)) {
    const code = row.link.slice(prefix.length);
    return /^[A-Za-z0-9_-]{24}$/.test(code) ? code : null;
  }
  return null;
}

async function harness() {
  const matrix = startMatrix();
  const matrixUrl = await matrix.url;
  const store = openStore(':memory:');
  const app = createApp({
    cfg: { serverName: SERVER, publicUrl: PUBLIC, registrationToken: REG_TOKEN, workspaceAlias: alias, translate: null, translateDailyLimit: 0 },
    store,
    mx: matrixClient(matrixUrl),
    sendMail: async () => {},
    key: keyFrom('x'.repeat(64)),
    confirmKey: keyFrom('y'.repeat(64), 'pasodrum-confirm-keys/v1', 'CONFIRM_KEY_SECRET'),
    systemPassword: SYSTEM_PASSWORD,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let n = 0;
  const api = async (token: string | null, method: string, path: string, body?: unknown) => {
    const res = await fetch(base + '/api/invites' + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed };
  };
  const obj = (body: unknown) => (body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {});
  const create = async (token: string, role: 'staff' | 'external' | 'client', spaceId: string, channelIds: string[]) => {
    const email = `person${++n}@example.com`;
    const res = await api(token, 'POST', '', { email, name: 'Pending Person', role, spaceId, channelIds, locale: 'en' });
    const body = obj(res.body);
    expect(res.status, JSON.stringify(body.error ?? body)).toBe(201);
    const code = disclosed(body);
    expect(code).toBeTruthy();
    return { code: code!, userId: String(body.userId), email };
  };
  const listCode = async (token: string, roomId: string, userId: string) => {
    const res = await api(token, 'GET', `?roomId=${encodeURIComponent(roomId)}`);
    // Not a member, or a member who may not manage the invite: no code to copy.
    if (res.status === 403) return null;
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = Array.isArray(res.body) ? res.body as Record<string, unknown>[] : [];
    const row = rows.find((i) => i.userId === userId);
    return row ? disclosed(row) : null;
  };
  const removePasodrum = async (userId: string) => {
    const res = await api(OWNER, 'DELETE', `/person?userId=${encodeURIComponent(userId)}`);
    const body = obj(res.body);
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.locked).toBe(true);
  };
  const removeSpace = async (spaceId: string, userId: string) => {
    const res = await api(OWNER, 'DELETE', `?spaceId=${encodeURIComponent(spaceId)}&userId=${encodeURIComponent(userId)}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  };
  const signIn = async (userId: string) => {
    const localpart = userId.slice(1, userId.indexOf(':'));
    const res = await fetch(`${matrixUrl}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'm.login.password', identifier: { type: 'm.id.user', user: localpart }, password: CLAIM_PASSWORD }),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    const access = obj(parsed).access_token;
    return { status: res.status, hasToken: typeof access === 'string' && access.length > 0 };
  };
  /** Claim must not set a password, write the rooms the app auto-joins, or return a sign-in identifier. */
  const expectRefused = async (code: string, userId: string) => {
    const before = matrix.finger(userId);
    const res = await api(null, 'POST', `/${code}/claim`, { name: CLAIM_NAME, password: CLAIM_PASSWORD });
    const body = obj(res.body);
    const login = await signIn(userId);
    expect({
      claimOk: res.status < 300,
      hasIdentifier: typeof body.identifier === 'string',
      loginOk: login.status < 300 || login.hasToken,
      accountUnchanged: matrix.finger(userId) === before,
    }).toEqual({ claimOk: false, hasIdentifier: false, loginOk: false, accountUnchanged: true });
  };
  const expectClaimed = async (code: string, userId: string, rooms: string[]) => {
    const res = await api(null, 'POST', `/${code}/claim`, { name: CLAIM_NAME, password: CLAIM_PASSWORD });
    const body = obj(res.body);
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.identifier).toBe(userId.slice(1, userId.indexOf(':')));
    const login = await signIn(userId);
    expect(login.status).toBe(200);
    expect(login.hasToken).toBe(true);
    expect(matrix.invited(userId)).toEqual({ rooms });
  };
  return { matrix, store, server, create, listCode, removePasodrum, removeSpace, expectRefused, expectClaimed };
}

type Harness = Awaited<ReturnType<typeof harness>>;
const open: Harness[] = [];
afterEach(async () => {
  const h = open.splice(0);
  await Promise.all(h.map(async (x) => {
    await new Promise<void>((resolve) => x.server.close(() => resolve()));
    await new Promise<void>((resolve) => x.matrix.server.close(() => resolve()));
    x.store.close();
  }));
});
async function setup() {
  const h = await harness();
  open.push(h);
  return h;
}

describe('removal does not leave a claimable invite link', () => {
  it('a staff invite still claims and signs in when its inviter stays', async () => {
    const h = await setup();
    const invite = await h.create(OWNER, 'staff', ws, [general]);
    await h.expectClaimed(invite.code, invite.userId, [ws, general]);
  });

  it('remove from Pasodrum: a staff invite the removed admin created cannot be claimed', async () => {
    const h = await setup();
    const invite = await h.create(ADMIN, 'staff', ws, [general]);
    await h.removePasodrum(adminId);
    await h.expectRefused(invite.code, invite.userId);
  });

  it('remove from Pasodrum: an external invite the removed admin created cannot be claimed', async () => {
    const h = await setup();
    const invite = await h.create(ADMIN, 'external', ws, []);
    await h.removePasodrum(adminId);
    await h.expectRefused(invite.code, invite.userId);
  });

  it('remove from Pasodrum: client invites the removed staff member created in every space cannot be claimed', async () => {
    const h = await setup();
    const a = await h.create(STAFF, 'client', clientA, []);
    const b = await h.create(STAFF, 'client', clientB, []);
    await h.removePasodrum(staffId);
    await h.expectRefused(a.code, a.userId);
    await h.expectRefused(b.code, b.userId);
  });

  it('remove from Pasodrum: a staff invite the removed admin read from the list cannot be claimed', async () => {
    const h = await setup();
    const invite = await h.create(OWNER, 'staff', ws, [general]);
    expect(await h.listCode(ADMIN, ws, invite.userId)).toBe(invite.code);
    await h.removePasodrum(adminId);
    await h.expectRefused(invite.code, invite.userId);
  });

  it('remove from Pasodrum: a client invite the removed admin read from the list cannot be claimed', async () => {
    const h = await setup();
    const invite = await h.create(STAFF, 'client', clientA, []);
    expect(await h.listCode(ADMIN, clientA, invite.userId)).toBe(invite.code);
    await h.removePasodrum(adminId);
    await h.expectRefused(invite.code, invite.userId);
  });

  it('remove from Pasodrum leaves an invite the removed admin could not see and did not create', async () => {
    const h = await setup();
    const hidden = await h.create(STAFF, 'client', clientB, []);
    expect(await h.listCode(ADMIN, clientB, hidden.userId)).toBeNull();
    await h.removePasodrum(adminId);
    await h.expectClaimed(hidden.code, hidden.userId, [clientB]);
  });

  it('remove from Pasodrum leaves a staff invite the removed staff member could not see', async () => {
    const h = await setup();
    const hidden = await h.create(OWNER, 'staff', ws, [general]);
    expect(await h.listCode(STAFF, ws, hidden.userId)).toBeNull();
    await h.removePasodrum(staffId);
    await h.expectClaimed(hidden.code, hidden.userId, [ws, general]);
  });

  it('remove from one space: a client invite that person created there cannot be claimed, and one in another space can', async () => {
    const h = await setup();
    const here = await h.create(STAFF, 'client', clientA, []);
    const there = await h.create(STAFF, 'client', clientB, []);
    await h.removeSpace(clientA, staffId);
    await h.expectRefused(here.code, here.userId);
    await h.expectClaimed(there.code, there.userId, [clientB]);
  });

  it('remove from one space: a client invite an admin read from that space cannot be claimed, and a workspace invite can', async () => {
    const h = await setup();
    const seen = await h.create(STAFF, 'client', clientA, []);
    const workspace = await h.create(OWNER, 'staff', ws, [general]);
    expect(await h.listCode(ADMIN, clientA, seen.userId)).toBe(seen.code);
    await h.removeSpace(clientA, adminId);
    await h.expectRefused(seen.code, seen.userId);
    await h.expectClaimed(workspace.code, workspace.userId, [ws, general]);
  });

  it('remove from one space leaves a client invite there that the removed staff member could not see', async () => {
    const h = await setup();
    const hidden = await h.create(OWNER, 'client', clientA, []);
    expect(await h.listCode(STAFF, clientA, hidden.userId)).toBeNull();
    await h.removeSpace(clientA, staffId);
    await h.expectClaimed(hidden.code, hidden.userId, [clientA]);
  });
});
