import type { StateEvent } from './rules.ts';

type Json = Record<string, unknown>;
type Res = { status: number; body: Json };

export class MatrixError extends Error {
  status: number;
  errcode: string;
  constructor(what: string, res: Res) {
    const errcode = typeof res.body.errcode === 'string' ? res.body.errcode : '';
    super(`${what} → ${res.status} ${errcode}`);
    this.status = res.status;
    this.errcode = errcode;
  }
}

const enc = encodeURIComponent;

export function matrixClient(base: string) {
  async function call(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: Json = {};
    try { parsed = JSON.parse(text) as Json; } catch { /* empty or not JSON */ }
    return { status: res.status, body: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed } };
  }

  async function ok(what: string, token: string | null, method: string, path: string, body?: unknown): Promise<Json> {
    const r = await call(token, method, path, body);
    if (r.status >= 300) throw new MatrixError(what, r);
    return r.body;
  }

  const passwordAuth = (localpart: string, password: string) => ({
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: localpart },
    password,
  });

  return {
    async whoami(token: string): Promise<string | null> {
      const r = await call(token, 'GET', '/_matrix/client/v3/account/whoami');
      if (r.status === 401 || r.status === 403) return null;
      if (r.status >= 300) throw new MatrixError('whoami', r);
      return typeof r.body.user_id === 'string' ? r.body.user_id : null;
    },

    // null when the caller can't read the room (not a member).
    async roomState(token: string, roomId: string): Promise<StateEvent[] | null> {
      const r = await call(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state`);
      if (r.status === 403 || r.status === 404 || r.status === 400) return null;
      if (r.status >= 300) throw new MatrixError('state', r);
      return Array.isArray(r.body.value) ? (r.body.value as StateEvent[]) : null;
    },

    async resolveAlias(token: string, alias: string): Promise<string | null> {
      const r = await call(token, 'GET', `/_matrix/client/v3/directory/room/${enc(alias)}`);
      return r.status === 200 && typeof r.body.room_id === 'string' ? r.body.room_id : null;
    },

    async membership(token: string, roomId: string, userId: string): Promise<string | null> {
      const r = await call(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.member/${enc(userId)}`);
      return r.status === 200 && typeof r.body.membership === 'string' ? r.body.membership : null;
    },

    async availability(localpart: string): Promise<'available' | 'taken' | 'invalid'> {
      const r = await call(null, 'GET', `/_matrix/client/v3/register/available?username=${enc(localpart)}`);
      if (r.status === 200 && r.body.available === true) return 'available';
      if (r.body.errcode === 'M_USER_IN_USE' || r.body.errcode === 'M_EXCLUSIVE') return 'taken';
      if (r.body.errcode === 'M_INVALID_USERNAME') return 'invalid';
      throw new MatrixError('available', r);
    },

    async register(localpart: string, password: string, registrationToken: string): Promise<string> {
      const req = { username: localpart, password, initial_device_display_name: 'Pasodrum invite' };
      const first = await call(null, 'POST', '/_matrix/client/v3/register', req);
      if (first.status !== 401) throw new MatrixError('register', first);
      const b = await ok('register', null, 'POST', '/_matrix/client/v3/register', {
        ...req,
        auth: { type: 'm.login.registration_token', token: registrationToken, session: first.body.session },
      });
      return String(b.access_token);
    },

    async login(localpart: string, password: string): Promise<string> {
      const b = await ok('login', null, 'POST', '/_matrix/client/v3/login', {
        ...passwordAuth(localpart, password),
        initial_device_display_name: 'Pasodrum invite',
      });
      return String(b.access_token);
    },

    async setDisplayName(token: string, userId: string, name: string): Promise<void> {
      await ok('displayname', token, 'PUT', `/_matrix/client/v3/profile/${enc(userId)}/displayname`, { displayname: name });
    },

    async setProfileField(token: string, userId: string, key: string, value: string): Promise<void> {
      await ok('profile field', token, 'PUT', `/_matrix/client/v3/profile/${enc(userId)}/${enc(key)}`, { [key]: value });
    },

    async changePassword(token: string, localpart: string, oldPassword: string, newPassword: string): Promise<void> {
      await ok('password', token, 'POST', '/_matrix/client/v3/account/password', {
        new_password: newPassword,
        logout_devices: true,
        auth: passwordAuth(localpart, oldPassword),
      });
    },

    /** Rewrites the user's account data of `type` from what's there (read, then write; `{}` when unset). */
    async updateAccountData(token: string, userId: string, type: string, update: (prev: Json) => Json): Promise<void> {
      const path = `/_matrix/client/v3/user/${enc(userId)}/account_data/${enc(type)}`;
      const r = await call(token, 'GET', path);
      if (r.status >= 300 && r.status !== 404) throw new MatrixError('account data', r);
      await ok('account data', token, 'PUT', path, update(r.status === 200 ? r.body : {}));
    },

    async logout(token: string): Promise<void> {
      await call(token, 'POST', '/_matrix/client/v3/logout', {});
    },
  };
}

export type Matrix = ReturnType<typeof matrixClient>;
