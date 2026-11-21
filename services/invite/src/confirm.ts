// D-38: clients and Externals confirm a new device by email. Routes under /api/invites/confirm.
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Reply, fail, readJson, type Config } from './app.ts';
import { clock, renderConfirm, validZone } from './email.ts';
import { HELP_REASONS, helpMessage, type HelpReason, type SystemAccount } from './help.ts';
import { emailFor, isCode, localpartOf, newCode } from './ids.ts';
import type { SendMail } from './mail.ts';
import type { Matrix } from './matrix.ts';
import { ADMIN_LEVEL, rateLimiter, spaceInfo, type Person, type SpaceInfo } from './rules.ts';
import { seal, unseal } from './secret.ts';
import type { ConfirmRequest, Store } from './store.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const LINK_TTL = 15 * MINUTE;
const RESEND_AFTER = MINUTE;
const COLLECT_WITHIN = 5 * MINUTE;
const HELP_EVERY = 10 * MINUTE;
const HELP_BY_LINK_FOR = 24 * HOUR;

export type ConfirmDeps = {
  cfg: Config;
  store: Store;
  mx: Matrix;
  sendMail: SendMail;
  /** From CONFIRM_KEY_SECRET; seals the held recovery keys, bound to their account. */
  key: Buffer;
  system: SystemAccount;
  now: () => number;
};

type Caller = { token: string; userId: string; deviceId: string; session: string };

export function confirmRoutes({ cfg, store, mx, sendMail, key, system, now }: ConfirmDeps) {
  const allow = rateLimiter();
  const host = new URL(cfg.publicUrl).host;

  function limit(k: string, max: number, windowMs: number) {
    if (!allow(k, max, windowMs)) throw fail(429, 'rate-limited');
  }

  // Only people outside the workspace (clients, Externals) may hand their key over; fails closed.
  async function caller(req: IncomingMessage): Promise<Caller> {
    const m = req.headers.authorization?.match(/^Bearer (\S+)$/);
    const who = m ? await mx.session(m[1]!) : null;
    if (!m || !who?.deviceId) throw fail(401, 'unauthorized');
    limit(`confirm:${who.userId}`, 120, MINUTE);
    const workspaceId = await mx.resolveAlias(m[1]!, cfg.workspaceAlias);
    if (!workspaceId) throw fail(502, 'server');
    if ((await mx.membership(m[1]!, workspaceId, who.userId)) === 'join') {
      store.dropConfirmKey(who.userId);
      throw fail(403, 'staff');
    }
    return { token: m[1]!, userId: who.userId, deviceId: who.deviceId, session: createHash('sha256').update(m[1]!).digest('hex') };
  }

  // Never the profile (anyone can write their own): the invite they claimed, else the address the ID was made from.
  function emailOf(userId: string): string {
    const email = store.latestClaimed(userId)?.email ?? emailFor(localpartOf(userId), cfg.serverName);
    if (!email) throw fail(409, 'no-email');
    return email;
  }

  const admins = (space: SpaceInfo, except: string): Person[] =>
    [...space.joined]
      .filter(([id]) => id !== except && id !== system.id && space.powerOf(id) >= ADMIN_LEVEL)
      .sort(([a], [b]) => space.powerOf(b) - space.powerOf(a))
      .slice(0, 5)
      .map(([id, name]) => ({ id, name }));

  /** Who added them (if still there), else that space's Owners and Admins; with no invite on record, the space the app names. */
  async function contactsOf(c: Caller, spaceHint: unknown): Promise<{ contacts: Person[]; spaceId: string | null; spaceName: string | null }> {
    const invite = store.latestClaimed(c.userId);
    if (invite) {
      const state = await mx.roomState(c.token, invite.spaceId);
      const space = state && spaceInfo(state);
      const named = { spaceId: invite.spaceId, spaceName: space?.name || invite.spaceName };
      if (!space) return { ...named, contacts: [{ id: invite.inviterId, name: invite.inviterName }] };
      const inviter = space.joined.get(invite.inviterId);
      return { ...named, contacts: inviter ? [{ id: invite.inviterId, name: inviter }] : admins(space, c.userId) };
    }
    if (typeof spaceHint === 'string' && spaceHint.startsWith('!')) {
      const state = await mx.roomState(c.token, spaceHint);
      const space = state && spaceInfo(state);
      if (space?.joined.has(c.userId)) return { spaceId: spaceHint, spaceName: space.name || null, contacts: admins(space, c.userId) };
    }
    return { spaceId: null, spaceName: null, contacts: [] };
  }

  async function sendHelp(h: { userId: string; email: string; reason: HelpReason; spaceId: string | null; spaceName: string | null; tz: string | null; contact: Person }) {
    const t = now();
    const undo = store.claimHelp(h.userId, t, HELP_EVERY);
    if (!undo) return false;
    try {
      const name = (await system.nameOf(h.userId)) ?? localpartOf(h.userId);
      await system.send(h.contact.id, helpMessage({ ...h, name, localTime: h.tz ? clock(t, h.tz) : null }));
      return true;
    } catch (e) {
      undo();
      console.error(`help failed: ${(e as Error).message}`);
      throw fail(502, 'failed');
    }
  }

  const isOpen = (r: ConfirmRequest, t: number) => !r.confirmedTs && !r.replacedTs && r.expiresTs > t;
  const collectable = (r: ConfirmRequest, t: number) =>
    !!r.confirmedTs && !r.replacedTs && !r.releasedTs && r.confirmedTs > t - COLLECT_WITHIN;

  async function me(req: IncomingMessage, spaceHint: string | null) {
    const c = await caller(req);
    const { contacts } = await contactsOf(c, spaceHint);
    return new Reply(200, { email: emailOf(c.userId), keyId: store.confirmKey(c.userId)?.keyId ?? null, contact: contacts[0] ?? null });
  }

  async function putKey(req: IncomingMessage) {
    const c = await caller(req);
    const { key: recoveryKey, keyId } = await readJson(req);
    if (typeof recoveryKey !== 'string' || !recoveryKey || recoveryKey.length > 512 || typeof keyId !== 'string' || !keyId || keyId.length > 256) {
      throw fail(400, 'bad-request');
    }
    store.putConfirmKey(c.userId, seal(key, recoveryKey, c.userId), keyId, now());
    return new Reply(204);
  }

  async function start(req: IncomingMessage) {
    const c = await caller(req);
    const body = await readJson(req);
    if (body.locale !== 'en' && body.locale !== 'ja') throw fail(400, 'bad-request');
    if (!store.confirmKey(c.userId)) throw fail(409, 'no-key');
    const last = store.lastConfirmTs(c.userId);
    const t = now();
    if (last !== null && last + RESEND_AFTER > t) throw new Reply(429, { error: 'rate-limited', canResendAt: last + RESEND_AFTER });
    const email = emailOf(c.userId);
    const tz = validZone(body.tz);
    const r: ConfirmRequest = {
      code: newCode(),
      userId: c.userId,
      deviceId: c.deviceId,
      deviceName: await mx.deviceName(c.token, c.deviceId),
      email,
      locale: body.locale,
      tz,
      ...(await contactsOf(c, body.spaceId)),
      createdTs: t,
      expiresTs: t + LINK_TTL,
      confirmedTs: null,
      releasedTs: null,
      replacedTs: null,
      session: c.session,
    };
    store.startConfirm(r);
    try {
      await sendMail({
        to: email,
        ...renderConfirm({ locale: r.locale, device: r.deviceName, requestedTs: t, tz, link: `${cfg.publicUrl}/confirm/${r.code}`, host }),
      });
    } catch (e) {
      store.dropConfirm(r.code);
      console.error(`confirm mail failed: ${(e as Error).message}`);
      throw fail(502, 'mail-failed');
    }
    return new Reply(200, { email, canResendAt: t + RESEND_AFTER, expiresTs: r.expiresTs });
  }

  async function status(req: IncomingMessage) {
    const c = await caller(req);
    const r = store.latestConfirmFor(c.userId, c.deviceId, c.session);
    const t = now();
    return new Reply(200, { state: !r ? 'none' : collectable(r, t) ? 'confirmed' : isOpen(r, t) ? 'pending' : 'none' });
  }

  // Only the device that asked, only after the tap, only once.
  async function collect(req: IncomingMessage) {
    const c = await caller(req);
    const r = store.latestConfirmFor(c.userId, c.deviceId, c.session);
    const t = now();
    if (r && isOpen(r, t)) throw fail(409, 'not-confirmed');
    if (!r || !collectable(r, t) || !store.release(r.code, t, t - COLLECT_WITHIN)) throw fail(410, 'gone');
    const held = store.confirmKey(c.userId);
    if (!held) throw fail(410, 'gone');
    return new Reply(200, { key: unseal(key, held.sealed, c.userId) });
  }

  async function help(req: IncomingMessage) {
    const c = await caller(req);
    const body = await readJson(req);
    if (!HELP_REASONS.includes(body.reason as HelpReason)) throw fail(400, 'bad-request');
    const { contacts, spaceId, spaceName } = await contactsOf(c, body.spaceId);
    const contact = contacts[0];
    if (!contact) throw fail(409, 'no-contact');
    const sent = await sendHelp({ userId: c.userId, email: emailOf(c.userId), reason: body.reason as HelpReason, spaceId, spaceName, tz: validZone(body.tz), contact });
    return new Reply(200, { contact, sent });
  }

  // Opening the link never writes: mail scanners open links too.
  function preview(code: string) {
    const r = isCode(code) ? store.confirmRequest(code) : undefined;
    const t = now();
    if (!r) return new Reply(200, { state: 'gone' });
    const first = r.contacts[0];
    const contact = first ? { contact: first.name, contactId: first.id } : {};
    if (!isOpen(r, t)) return new Reply(200, { state: 'gone', ...(r.createdTs > t - HELP_BY_LINK_FOR ? contact : {}) });
    return new Reply(200, { state: 'open', device: r.deviceName ?? undefined, requestedTs: r.createdTs, tz: r.tz ?? undefined, ...contact });
  }

  function tap(code: string) {
    const r = isCode(code) ? store.confirmRequest(code) : undefined;
    if (!r || !store.tap(code, now())) throw fail(410, 'gone');
    return new Reply(200, { device: r.deviceName ?? undefined });
  }

  async function helpByLink(req: IncomingMessage, code: string) {
    const body = await readJson(req);
    const r = isCode(code) ? store.confirmRequest(code) : undefined;
    const t = now();
    if (!r || r.createdTs <= t - HELP_BY_LINK_FOR) throw fail(410, 'gone');
    const contact = r.contacts[0];
    if (!contact) throw fail(409, 'no-contact');
    const sent = await sendHelp({
      userId: r.userId,
      email: r.email,
      reason: isOpen(r, t) ? 'stuck' : 'link-broken',
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      tz: validZone(body.tz) ?? r.tz,
      contact,
    });
    return new Reply(200, { contact: { name: contact.name }, sent });
  }

  return async function route(req: IncomingMessage, url: URL, parts: string[], meta: { name: string }, ip: string): Promise<Reply> {
    const [first, action] = parts;
    const m = req.method;
    const is = (name: string) => ((meta.name = `confirm-${name}`), true);
    if (parts.length === 1) {
      if (first === 'me' && m === 'GET' && is('me')) return me(req, url.searchParams.get('spaceId'));
      if (first === 'key' && m === 'POST' && is('key')) return putKey(req);
      if (first === 'start' && m === 'POST' && is('start')) return start(req);
      if (first === 'status' && m === 'GET' && is('status')) return status(req);
      if (first === 'collect' && m === 'POST' && is('collect')) return collect(req);
      if (first === 'help' && m === 'POST' && is('help')) return help(req);
      if (m === 'GET' && is('preview')) {
        limit(`confirm-preview:${ip}`, 60, MINUTE);
        return preview(first!);
      }
      if (m === 'POST' && is('tap')) {
        limit(`confirm-tap:${ip}`, 30, HOUR);
        return tap(first!);
      }
    } else if (parts.length === 2 && action === 'help' && m === 'POST' && is('help-link')) {
      limit(`confirm-help:${ip}`, 30, HOUR);
      return helpByLink(req, first!);
    }
    return fail(404, 'not-found');
  };
}
