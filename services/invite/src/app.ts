import type { IncomingMessage, ServerResponse } from 'node:http';
import { confirmRoutes } from './confirm.ts';
import { renderInvite, type Locale } from './email.ts';
import { SYSTEM_LOCALPART, systemAccount } from './help.ts';
import { isCode, localpartFor, localpartOf, newCode, newPassword, normalizeEmail } from './ids.ts';
import type { SendMail } from './mail.ts';
import { MatrixError, type Matrix } from './matrix.ts';
import { createPresence } from './presence.ts';
import { ADMIN_LEVEL, OWNER_LEVEL, TTL_MS, canDelete, canInvite, canManage, isGenuine, normalizeRole, rateLimiter, spaceInfo, stateOf, teamOf, type SpaceInfo } from './rules.ts';
import { seal, unseal } from './secret.ts';
import type { Invite, Store } from './store.ts';
import { parseRequest, translate as callTranslate, type TranslateConfig } from './translate.ts';

export type Config = {
  serverName: string;
  publicUrl: string;
  registrationToken: string;
  workspaceAlias: string;
  translate: TranslateConfig | null;
  translateDailyLimit: number;
};
export type Deps = { cfg: Config; store: Store; mx: Matrix; sendMail: SendMail; key: Buffer; confirmKey: Buffer; systemPassword?: string; now?: () => number };

export class Reply {
  status: number;
  body: unknown;
  constructor(status: number, body?: unknown) {
    this.status = status;
    this.body = body;
  }
}
export const fail = (status: number, error: string) => new Reply(status, { error });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MAX_BODY = 16 * 1024;
const TRANSLATE_PER_USER_DAY = 150;
const EXTERNAL = 'work.pasodrum.external';

export function createApp({ cfg, store, mx, sendMail, key, confirmKey, systemPassword, now = Date.now }: Deps) {
  const system = systemAccount(mx, store, cfg.serverName, systemPassword, cfg.registrationToken);
  const confirm = confirmRoutes({ cfg, store, mx, sendMail, key: confirmKey, system, now });
  const allow = rateLimiter();
  const presence = createPresence({ mx, now });
  const claiming = new Set<string>();
  const host = new URL(cfg.publicUrl).host;
  const linkFor = (code: string) => `${cfg.publicUrl}/join/${code}`;
  // Calls that reached OpenAI and came back, per UTC day: for everyone (TRANSLATE_DAILY_LIMIT) and per person (150).
  const budget = { day: '', used: 0, perUser: new Map<string, number>() };

  function limit(k: string, max: number, windowMs: number) {
    if (!allow(k, max, windowMs)) throw fail(429, 'rate-limited');
  }

  async function caller(req: IncomingMessage): Promise<{ token: string; userId: string }> {
    const m = req.headers.authorization?.match(/^Bearer (\S+)$/);
    const userId = m ? await mx.whoami(m[1]!) : null;
    if (!m || !userId) throw fail(401, 'unauthorized');
    limit(`caller:${userId}`, 120, MINUTE);
    return { token: m[1]!, userId };
  }

  async function deliver(i: Invite) {
    const mail = renderInvite({
      locale: i.locale,
      inviter: i.inviterName,
      spaceName: i.spaceName,
      spaceId: i.spaceId,
      spaceKind: i.spaceKind,
      link: linkFor(i.code),
      expiresTs: i.expiresTs,
      host,
    });
    await sendMail({ to: i.email, ...mail });
  }

  async function manages(i: Invite, c: { token: string; userId: string }) {
    if (c.userId === i.inviterId) return true;
    const state = await mx.roomState(c.token, i.spaceId);
    return canManage(i.inviterId, c.userId, state && spaceInfo(state));
  }

  async function mayManage(i: Invite, c: { token: string; userId: string }) {
    if (!(await manages(i, c))) throw fail(403, 'not-allowed');
  }

  async function genuine(token: string, spaceId: string, space: SpaceInfo) {
    const workspaceId = await mx.resolveAlias(token, cfg.workspaceAlias);
    if (space.kind === 'workspace' || !workspaceId) return isGenuine(spaceId, space, workspaceId, null);
    const state = await mx.roomState(token, workspaceId);
    return isGenuine(spaceId, space, workspaceId, state && spaceInfo(state));
  }

  /**
   * D-36: an External's invite is filed under the workspace and its `channelIds` may name workspace channels, client
   * spaces and their channels. Each must be one the caller is in, and a child of the workspace, a genuine client space,
   * or a child of one.
   */
  async function mayGrant(token: string, userId: string, roomIds: string[], workspaceId: string, workspace: SpaceInfo) {
    const infos = new Map<string, SpaceInfo | null>();
    const info = async (id: string) => {
      if (!infos.has(id)) infos.set(id, await mx.roomState(token, id).then((s) => s && spaceInfo(s)));
      return infos.get(id)!;
    };
    const clientSpace = async (id: string) => {
      const s = await info(id);
      return !!s && s.kind === 'client' && isGenuine(id, s, workspaceId, workspace);
    };
    for (const id of roomIds) {
      const room = await info(id);
      if (!room?.joined.has(userId)) return false;
      if (workspace.children.has(id) || (await clientSpace(id))) continue;
      let inClientSpace = false;
      for (const p of room.parents) {
        if ((await info(p))?.children.has(id) && (await clientSpace(p))) {
          inClientSpace = true;
          break;
        }
      }
      if (!inClientSpace) return false;
    }
    return true;
  }

  function invite(code: string): Invite {
    const i = isCode(code) ? store.get(code) : undefined;
    if (!i) throw fail(404, 'not-found');
    return i;
  }

  async function create(req: IncomingMessage, body: Record<string, unknown>) {
    const c = await caller(req);
    limit(`create:${c.userId}`, 60, HOUR);
    const { spaceId, channelIds = [], locale = 'en', name } = body;
    const role = normalizeRole(body.role);
    if (
      !role ||
      typeof spaceId !== 'string' || !spaceId.startsWith('!') ||
      !Array.isArray(channelIds) || channelIds.length > 100 || !channelIds.every((id) => typeof id === 'string' && id.startsWith('!')) ||
      (locale !== 'en' && locale !== 'ja') ||
      (name !== undefined && name !== null && (typeof name !== 'string' || name.trim().length > 100))
    ) throw fail(400, 'bad-request');
    const email = normalizeEmail(body.email);
    if (!email) throw fail(400, 'invalid-email');

    const state = await mx.roomState(c.token, spaceId);
    const space = state && spaceInfo(state);
    if (!space || !canInvite(role, space, c.userId) || !(await genuine(c.token, spaceId, space))) throw fail(403, 'not-allowed');
    // genuine() above: an External's space is the workspace.
    if (role === 'external' && !(await mayGrant(c.token, c.userId, channelIds as string[], spaceId, space))) throw fail(403, 'not-allowed');

    const localpart = localpartFor(email, cfg.serverName);
    if (localpart === SYSTEM_LOCALPART) throw fail(400, 'invalid-email');
    const userId = `@${localpart}:${cfg.serverName}`;
    let rooms = [spaceId, ...(channelIds as string[])];
    const displayName = typeof name === 'string' && name.trim() ? name.trim() : null;
    // An account this service created and nobody claimed gets a fresh code, but only from someone who may manage its
    // latest invite: the code claims the account. For anyone else it already exists (the app just adds them).
    const existing = async () => {
      const dormant = store.dormantForUser(userId);
      if (!dormant?.secret || !(await manages(dormant, c))) return null;
      if (dormant.spaceId === spaceId && !dormant.revokedTs && stateOf(dormant, now()) === 'open') rooms = [...dormant.rooms, ...rooms];
      return dormant.secret;
    };
    const availability = await mx.availability(localpart);
    if (availability === 'invalid') throw fail(400, 'invalid-email');
    let secret = availability === 'taken' ? await existing() : undefined;
    if (secret === null) return new Reply(409, { error: 'exists', userId });

    if (secret === undefined) {
      const password = newPassword();
      let token: string | null = null;
      try {
        token = await mx.register(localpart, password, cfg.registrationToken);
      } catch (e) {
        if (!(e instanceof MatrixError && e.errcode === 'M_USER_IN_USE')) throw e;
      }
      if (token) {
        await mx.setDisplayName(token, userId, displayName ?? email);
        await mx.setProfileField(token, userId, 'work.pasodrum.email', email).catch(() => {});
        await mx.logout(token);
        secret = seal(key, password);
      } else {
        secret = await existing();
        if (!secret) return new Reply(409, { error: 'exists', userId });
      }
    }

    const ts = now();
    const i: Invite = {
      code: newCode(),
      email,
      name: displayName,
      role,
      userId,
      spaceId,
      spaceName: space.name,
      spaceKind: space.kind,
      inviterId: c.userId,
      inviterName: space.joined.get(c.userId) ?? localpartOf(c.userId),
      team: teamOf(space, c.userId),
      rooms: [...new Set(rooms)],
      locale: locale as Locale,
      secret,
      createdTs: ts,
      expiresTs: ts + TTL_MS,
      claimedTs: null,
      revokedTs: null,
    };
    store.supersede(userId, spaceId, ts);
    store.insert(i);
    const emailed = await deliver(i).then(() => true, (e: unknown) => {
      console.error(`invite mail failed: ${(e as Error).message}`);
      return false;
    });
    return new Reply(201, { code: i.code, userId, link: linkFor(i.code), emailed });
  }

  function preview(code: string) {
    const i = invite(code);
    return new Reply(200, {
      email: i.email,
      name: i.name ?? undefined,
      userId: i.userId,
      spaceName: i.spaceName,
      spaceKind: i.spaceKind,
      inviter: i.inviterName,
      team: i.team,
      state: stateOf(i, now()),
    });
  }

  async function claim(code: string, body: Record<string, unknown>) {
    const i = invite(code);
    const state = stateOf(i, now());
    if (state !== 'open' || !i.secret) throw fail(410, state === 'open' ? 'used' : state);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) throw fail(400, 'invalid-name');
    const password = body.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw fail(400, 'weak-password');
    if (claiming.has(code)) throw fail(409, 'busy');
    claiming.add(code);
    try {
      const localpart = localpartOf(i.userId);
      const temp = unseal(key, i.secret);
      const token = await mx.login(localpart, temp);
      await mx.setDisplayName(token, i.userId, name);
      // An External never joins the workspace, so the app takes its name from here.
      await mx.updateAccountData(token, i.userId, 'work.pasodrum.spaces', (prev) => ({ ...prev, [i.spaceId]: { name: i.spaceName, kind: i.spaceKind } }))
        .catch((e: unknown) => console.error(`spaces account data failed: ${(e as Error).message}`));
      // `work.pasodrum.invited` = { rooms: string[] }: the only rooms a fresh account auto-accepts (D-36), since anyone who
      // knows its ID could invite it before it was claimed. Externals never join the workspace, so it isn't listed.
      const invited = i.role === 'external' ? i.rooms.filter((r) => r !== i.spaceId) : i.rooms;
      await mx.updateAccountData(token, i.userId, 'work.pasodrum.invited', (prev) => {
        const had = Array.isArray(prev.rooms) ? prev.rooms.filter((r): r is string => typeof r === 'string') : [];
        return { ...prev, rooms: [...new Set([...had, ...invited])] };
      }).catch((e: unknown) => console.error(`invited account data failed: ${(e as Error).message}`));
      await mx.changePassword(token, localpart, temp, password);
      await mx.logout(token);
      store.claim(code, i.userId, now());
      return new Reply(200, { userId: i.userId, identifier: localpart });
    } finally {
      claiming.delete(code);
    }
  }

  async function resend(req: IncomingMessage, code: string) {
    const c = await caller(req);
    limit(`resend:${c.userId}`, 30, HOUR);
    const i = invite(code);
    if (i.claimedTs) throw fail(410, 'used');
    if (i.revokedTs) throw fail(410, 'revoked');
    await mayManage(i, c);
    const expiresTs = now() + TTL_MS;
    store.extend(code, expiresTs);
    try {
      await deliver({ ...i, expiresTs });
    } catch (e) {
      console.error(`invite mail failed: ${(e as Error).message}`);
      throw fail(502, 'mail-failed');
    }
    return new Reply(204);
  }

  async function revoke(req: IncomingMessage, code: string) {
    const c = await caller(req);
    const i = invite(code);
    if (i.claimedTs) throw fail(410, 'used');
    if (i.revokedTs) return new Reply(204);
    await mayManage(i, c);
    // Only the code dies; the account stays dormant so the same email can be invited again (D-26 amendment).
    store.revoke(code, now());
    return new Reply(204);
  }

  // Remove from space (D-28): the person's open codes for that space stop working. Admins of the space only.
  async function revokePerson(req: IncomingMessage, spaceId: string | null, userId: string | null) {
    const c = await caller(req);
    if (!spaceId?.startsWith('!') || !userId?.startsWith('@')) throw fail(400, 'bad-request');
    const state = await mx.roomState(c.token, spaceId);
    const space = state && spaceInfo(state);
    if (!space || !space.joined.has(c.userId) || space.powerOf(c.userId) < ADMIN_LEVEL) throw fail(403, 'not-allowed');
    return new Reply(200, { revoked: store.revokeForUser(userId, spaceId, now()) });
  }

  /**
   * SIDE-08 remove from Pasodrum: an Owner or Admin of the workspace removes Staff or an External ranked below them. The
   * account is locked (signed out everywhere, sign-in refused), then their codes and held key go. The app takes them
   * out of the rooms.
   */
  async function removePerson(req: IncomingMessage, userId: string | null) {
    const c = await caller(req);
    if (!userId?.startsWith('@')) throw fail(400, 'bad-request');
    const workspaceId = await mx.resolveAlias(c.token, cfg.workspaceAlias);
    const state = workspaceId ? await mx.roomState(c.token, workspaceId) : null;
    const workspace = state && spaceInfo(state);
    if (!state || !workspace?.joined.has(c.userId)) throw fail(403, 'not-allowed');
    const level = workspace.powerOf(c.userId);
    const member = state.some((e) => e.type === 'm.room.member' && e.state_key === userId && ['join', 'invite'].includes(e.content?.membership as string));
    // D-36 record: state key is the ID without "@"; empty content means removed.
    const external = state.some((e) => e.type === EXTERNAL && e.state_key === userId.slice(1) && Object.keys(e.content ?? {}).length > 0);
    if (level < ADMIN_LEVEL || userId === c.userId || userId === system.id || workspace.powerOf(userId) >= level || !(member || external) || store.clientAccount(userId)) {
      throw fail(403, 'not-allowed');
    }
    // The workspace record and membership above are writable by any Admin; the service's own invites say who is a client.
    // An account nobody claimed signs in only with the sealed temporary password; locking it would break a later re-invite.
    let locked = false;
    if (!store.unclaimedAccount(userId)) {
      if (!system.configured) throw fail(503, 'not-configured');
      try {
        locked = await system.lock(userId);
      } catch (e) {
        if (e instanceof MatrixError && e.status === 403) throw fail(503, 'not-configured');
        throw e;
      }
    }
    const revoked = store.revokeAllForUser(userId, now());
    store.dropConfirmKey(userId);
    presence.closeUser(userId);
    return new Reply(200, { revoked, locked });
  }

  // DES-05 delete a client space: every open code for it stops working. Owners of the workspace who are Owners there.
  async function revokeSpace(req: IncomingMessage, spaceId: string | null) {
    const c = await caller(req);
    if (!spaceId?.startsWith('!')) throw fail(400, 'bad-request');
    const state = await mx.roomState(c.token, spaceId);
    const space = state && spaceInfo(state);
    if (!space || !canDelete(space, c.userId)) throw fail(403, 'not-allowed');
    // A v12 creator outranks everyone in the space itself, so the Owner check is on the workspace.
    const workspaceId = await mx.resolveAlias(c.token, cfg.workspaceAlias);
    const wsState = workspaceId && workspaceId !== spaceId && (await mx.roomState(c.token, workspaceId));
    const workspace = wsState && spaceInfo(wsState);
    if (!workspace || !workspace.joined.has(c.userId) || workspace.powerOf(c.userId) < OWNER_LEVEL) throw fail(403, 'not-allowed');
    return new Reply(200, { revoked: store.revokeForSpace(spaceId, now()) });
  }

  async function list(req: IncomingMessage, roomId: string | null) {
    const c = await caller(req);
    if (!roomId) throw fail(400, 'bad-request');
    if ((await mx.membership(c.token, roomId, c.userId)) !== 'join') throw fail(403, 'not-allowed');
    const t = now();
    // Codes claim accounts, so only the inviter and Admins of the space see them.
    const spaces = new Map<string, SpaceInfo | null>();
    const visible: Invite[] = [];
    for (const i of store.pendingForRoom(roomId)) {
      if (!spaces.has(i.spaceId)) spaces.set(i.spaceId, await mx.roomState(c.token, i.spaceId).then((s) => s && spaceInfo(s)));
      if (canManage(i.inviterId, c.userId, spaces.get(i.spaceId)!)) visible.push(i);
    }
    return new Reply(200, visible.map((i) => ({
      code: i.code,
      email: i.email,
      name: i.name ?? undefined,
      userId: i.userId,
      role: i.role,
      createdTs: i.createdTs,
      expiresTs: i.expiresTs,
      state: stateOf(i, t),
      link: linkFor(i.code),
    })));
  }

  // Team only: clients and guests never join the workspace space (D-06).
  async function translate(req: IncomingMessage, body: Record<string, unknown>) {
    const c = await caller(req);
    const workspaceId = await mx.resolveAlias(c.token, cfg.workspaceAlias);
    if (!workspaceId || (await mx.membership(c.token, workspaceId, c.userId)) !== 'join') throw fail(403, 'not-allowed');
    if (!cfg.translate) throw fail(503, 'not-configured');
    const input = parseRequest(body);
    if (!input) throw fail(400, 'bad-request');
    limit(`translate:${c.userId}`, 30, MINUTE);
    const day = new Date(now()).toISOString().slice(0, 10);
    if (budget.day !== day) Object.assign(budget, { day, used: 0, perUser: new Map() });
    const mine = budget.perUser.get(c.userId) ?? 0;
    if (mine >= TRANSLATE_PER_USER_DAY) throw fail(429, 'rate-limited');
    if (budget.used >= cfg.translateDailyLimit) throw fail(503, 'daily-limit');
    // Reserved before the call so parallel requests can't overshoot; handed back when the call fails.
    budget.used += 1;
    budget.perUser.set(c.userId, mine + 1);
    try {
      return new Reply(200, { segments: await callTranslate(cfg.translate, input.segments, input.to) });
    } catch (e) {
      if (budget.day === day) {
        budget.used -= 1;
        budget.perUser.set(c.userId, (budget.perUser.get(c.userId) ?? 1) - 1);
      }
      console.error(`translate failed: ${(e as Error).message}`);
      throw fail(502, 'upstream');
    }
  }

  async function route(req: IncomingMessage, url: URL, meta: { name: string }): Promise<Reply> {
    const ip = clientIp(req);
    limit(`ip:${ip}`, 300, MINUTE);
    const parts = url.pathname.replace(/\/+$/, '').split('/').slice(1);
    if (parts[0] === 'api' && parts[1] === 'translate' && parts.length === 2) {
      if (req.method !== 'POST') return fail(405, 'method-not-allowed');
      meta.name = 'translate';
      return translate(req, await readJson(req));
    }
    if (parts[0] === 'api' && parts[1] === 'invites' && parts[2] === 'confirm') return confirm(req, url, parts.slice(3), meta, ip);
    if (parts[0] !== 'api' || parts[1] !== 'invites' || parts.length > 4) return fail(404, 'not-found');
    const [, , code, action] = parts;
    const m = req.method;
    const is = (name: string) => ((meta.name = name), true);
    if (!code) {
      if (m === 'POST' && is('create')) return create(req, await readJson(req));
      if (m === 'GET' && is('list')) return list(req, url.searchParams.get('roomId'));
      if (m === 'DELETE' && is('revoke-person')) return revokePerson(req, url.searchParams.get('spaceId'), url.searchParams.get('userId'));
    } else if (!action) {
      if (code === 'person' && m === 'DELETE' && is('remove-person')) return removePerson(req, url.searchParams.get('userId'));
      if (code === 'space' && m === 'DELETE' && is('revoke-space')) return revokeSpace(req, url.searchParams.get('spaceId'));
      if (m === 'GET' && is('preview')) {
        limit(`preview:${ip}`, 60, MINUTE);
        return preview(code);
      }
      if (m === 'DELETE' && is('revoke')) return revoke(req, code);
    } else if (action === 'claim' && m === 'POST' && is('claim')) {
      limit(`claim:${ip}`, 20, HOUR);
      return claim(code, await readJson(req));
    } else if (action === 'resend' && m === 'POST' && is('resend')) {
      return resend(req, code);
    }
    return fail(405, 'method-not-allowed');
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const started = Date.now();
    const meta = { name: '?' };
    let reply: Reply;
    try {
      reply = await route(req, new URL(req.url ?? '/', 'http://invite'), meta);
    } catch (e) {
      if (e instanceof Reply) reply = e;
      else {
        console.error(`${req.method} ${meta.name}: ${(e as Error).message}`);
        reply = fail(502, 'server');
      }
    }
    res.writeHead(reply.status, reply.body === undefined ? {} : { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(reply.body === undefined ? undefined : JSON.stringify(reply.body));
    // Paths carry codes, so only the route name is logged.
    console.log(`${req.method} ${meta.name} ${reply.status} ${Date.now() - started}ms`);
  }
  return Object.assign(handle, { upgrade: presence.upgrade, closeSockets: presence.close });
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || '?';
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw fail(413, 'too-large');
    chunks.push(chunk);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch { /* fall through */ }
  throw fail(400, 'bad-request');
}
