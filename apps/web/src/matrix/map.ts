import { escapeHtml, pillUser, urlsIn } from './html';
import type { AccessRole, Channel, ConnectionState, LinkPreview, Media, Person, Reaction, Role, Space } from './types';

export interface RoomFacts {
  id: string;
  name: string;
  joined: boolean;
  isSpace: boolean;
  /** Any room type other than a space (boards, docs…); such rooms are not channels. */
  otherType: boolean;
  clientSpace: boolean;
  /** M5. From `work.pasodrum.space`. */
  colour?: string;
  archived?: boolean;
  contacts?: string[];
  joinRule?: string;
  topic?: string;
  children: string[];
  /** The spaces this room names as its parents (`m.space.parent`). */
  parents: string[];
  unread: number;
  mentions: number;
  memberCount: number;
}

/** What the invite service left in account data about spaces I was added to but can't read (`work.pasodrum.spaces`). */
export type KnownSpaces = Record<string, { name: string; kind: Space['kind'] }>;

export function knownSpacesOf(content: unknown): KnownSpaces {
  const out: KnownSpaces = {};
  if (!content || typeof content !== 'object') return out;
  for (const [id, v] of Object.entries(content as Record<string, unknown>)) {
    const { name, kind } = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    if (typeof name === 'string' && name.trim()) out[id] = { name, kind: kind === 'client' ? 'client' : 'workspace' };
  }
  return out;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const isChannel = (r: RoomFacts | undefined): r is RoomFacts => !!r && r.joined && !r.isSpace && !r.otherType;

const channelOf = (r: RoomFacts, spaceId: string): Channel => ({
  id: r.id,
  spaceId,
  name: r.name,
  ...(r.topic ? { topic: r.topic } : {}),
  private: r.joinRule !== 'restricted' && r.joinRule !== 'public',
  unread: r.unread,
  mentions: r.mentions,
  memberCount: r.memberCount,
});

/**
 * Spaces I'm in with their joined channels. A guest (D-06) is in channels only: those are grouped under the space
 * they belong to, named from `known` (else after a channel, never an ID).
 */
export function workspaceOf(rooms: RoomFacts[], known: KnownSpaces = {}): { spaces: Space[]; channels: Record<string, Channel[]> } {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const joinedSpaces = rooms.filter((r) => r.joined && r.isSpace);
  const spaces: Space[] = joinedSpaces.map((r): Space => ({
    id: r.id,
    name: r.name,
    kind: r.clientSpace ? 'client' : 'workspace',
    ...(r.colour ? { colour: r.colour } : {}),
    ...(r.archived ? { archived: true } : {}),
    ...(r.contacts?.length ? { contacts: r.contacts } : {}),
  }));
  const channels: Record<string, Channel[]> = {};
  for (const space of joinedSpaces) channels[space.id] = space.children.map((id) => byId.get(id)).filter(isChannel).map((r) => channelOf(r, space.id));

  const mine = new Set(joinedSpaces.map((r) => r.id));
  const listed = new Set(joinedSpaces.flatMap((r) => r.children));
  const outside = new Map<string, RoomFacts[]>();
  for (const r of rooms) {
    if (!isChannel(r) || listed.has(r.id) || r.parents.some((id) => mine.has(id))) continue;
    const parent = r.parents[0] ?? rooms.find((sp) => sp.isSpace && !sp.joined && sp.children.includes(r.id))?.id;
    if (parent) outside.set(parent, [...(outside.get(parent) ?? []), r]);
  }
  for (const [id, list] of outside) {
    const sorted = [...list].sort(byName);
    const k = known[id];
    spaces.push({ id, name: k?.name ?? sorted[0]!.name, kind: k?.kind ?? (byId.get(id)?.clientSpace ? 'client' : 'workspace') });
    channels[id] = sorted.map((r) => channelOf(r, id));
  }

  for (const list of Object.values(channels)) list.sort(byName);
  spaces.sort((a, b) => (a.kind === b.kind ? Number(!!a.archived) - Number(!!b.archived) || byName(a, b) : a.kind === 'workspace' ? -1 : 1));
  return { spaces, channels };
}

/** Returns `prev` (or its unchanged parts) wherever `next` is structurally equal to it. */
export function share<T>(prev: T, next: T): T {
  if (Object.is(prev, next) || typeof prev !== 'object' || typeof next !== 'object' || !prev || !next) return next;
  if (Array.isArray(prev) !== Array.isArray(next)) return next;
  const p = prev as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  const out = (Array.isArray(next) ? [] : {}) as Record<string, unknown>;
  let same = Object.keys(p).length === Object.keys(n).length;
  for (const key of Object.keys(n)) {
    out[key] = share(p[key], n[key]);
    if (out[key] !== p[key]) same = false;
  }
  return same ? prev : (out as T);
}

export type LoginIdentifier =
  | { type: 'm.id.user'; user: string }
  | { type: 'm.id.thirdparty'; medium: 'email'; address: string };

/** D-19: a username, or an email tried as bound email, then own-server local part, then the D-07 deterministic ID. */
export function loginCandidates(identifier: string): LoginIdentifier[] {
  const id = identifier.trim();
  const at = id.lastIndexOf('@');
  if (at <= 0) return [{ type: 'm.id.user', user: id.toLowerCase() }];
  const email = id.toLowerCase();
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return [
    { type: 'm.id.thirdparty', medium: 'email', address: email },
    { type: 'm.id.user', user: `@${local}:${domain}` },
    { type: 'm.id.user', user: `${local}_${domain}` },
  ];
}

export function connectionOf(syncState: string | null, synced: boolean): ConnectionState {
  if (syncState === 'ERROR' || syncState === 'STOPPED') return 'offline';
  if (!synced) return 'starting';
  if (syncState === 'RECONNECTING' || syncState === 'CATCHUP') return 'reconnecting';
  return 'online';
}

export const FIRST_RUN_HOLD_MS = 15_000;

/** A fresh account whose listed invites are still being accepted: hold the start screen (capped) so it lands on a channel. */
export function arriving(f: { synced: boolean; sinceSyncMs: number; hasChannel: boolean; listedInvite: boolean }): boolean {
  return f.synced && !f.hasChannel && f.listedInvite && f.sinceSyncMs < FIRST_RUN_HOLD_MS;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const MEDIA = new Set(['m.image', 'm.video', 'm.audio', 'm.file']);

/** m.image/m.video/m.audio/m.file (and m.sticker) content → Media plus the caption ('' when the body is just the file name). */
export function mediaOf(content: Record<string, unknown>, sticker = false): { media: Media; caption: string } | null {
  // Encrypted media (M6) carries its URL inside `file` / `thumbnail_file`.
  const urlOf = (v: unknown) => str((v as { url?: unknown } | null | undefined)?.url);
  const ref = str(content.url) ?? urlOf(content.file);
  if (!ref || (!sticker && !MEDIA.has(String(content.msgtype)))) return null;
  const body = str(content.body) ?? '';
  const filename = str(content.filename);
  const info = (typeof content.info === 'object' && content.info ? content.info : {}) as Record<string, unknown>;
  const media: Media = { ref, name: filename ?? body };
  const fields: Partial<Media> = {
    mimetype: str(info.mimetype),
    size: num(info.size),
    width: num(info.w),
    height: num(info.h),
    thumbnailRef: str(info.thumbnail_url) ?? urlOf(info.thumbnail_file),
    durationMs: num(info.duration),
  };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) (media as unknown as Record<string, unknown>)[k] = v;
  return { media, caption: filename && filename !== body && !sticker ? body : '' };
}

/**
 * M7. Message.links: http(s) URLs in body order, each once. From the formatted body when there is one (`htmlLinks`:
 * outside code, pills left out), else the plain body without its code. None in encrypted conversations (D-33).
 */
export function linksOf(body: string, htmlLinks: string[] | null, encrypted: boolean): string[] {
  if (encrypted) return [];
  const all = htmlLinks ?? urlsIn(body.replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')).filter((u) => !pillUser(u));
  return [...new Set(all)];
}

/** M7. Event ids in `m.room.pinned_events`, newest pin first (pins are appended). */
export function pinnedIdsOf(content: unknown): string[] {
  const list = (content as { pinned?: unknown } | null | undefined)?.pinned;
  return Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === 'string' && id.startsWith('$')))].reverse() : [];
}

/** M7. A preview_url response → LinkPreview; null without a title or description (the server answers 200 {} for a 404 page). `site` is the URL's host. */
export function linkPreviewOf(url: string, og: Record<string, unknown>): LinkPreview | null {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const title = text(og['og:title']);
  const description = text(og['og:description']);
  if (!title && !description) return null;
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch { /* not a URL */ }
  // Always the real host: a page's og:site_name could claim to be someone else.
  const site = host || undefined;
  const image = text(og['og:image']);
  return {
    url,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(site ? { site } : {}),
    ...(image?.startsWith('mxc://') ? { image } : {}),
  };
}

/** Splits an Element-style reply fallback ("> <@user:server> quoted\n> more\n\nreply") off a plain body. */
export function stripReplyFallback(body: string): { body: string; quote?: { senderId?: string; body: string } } {
  if (!body.startsWith('> ')) return { body };
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i]!.startsWith('>')) i++;
  const quoted = lines.slice(0, i).map((l) => l.replace(/^> ?/, ''));
  const sender = /^(?:\* )?<(@[^>]+)> ?/.exec(quoted[0] ?? '');
  if (sender) quoted[0] = quoted[0]!.slice(sender[0].length);
  if (lines[i] === '') i++;
  return { body: lines.slice(i).join('\n'), quote: { ...(sender ? { senderId: sender[1] } : {}), body: quoted.join('\n') } };
}

/** The Element-style fallback we prepend when replying, so standard clients show the quote. */
export function replyFallback(original: { roomId: string; eventId: string; senderId: string; body: string; html?: string }): { body: string; html: string } {
  const lines = (original.body || ' ').split('\n');
  const body = [`> <${original.senderId}> ${lines[0]}`, ...lines.slice(1).map((l) => `> ${l}`)].join('\n') + '\n\n';
  const link = (path: string) => escapeHtml(`https://matrix.to/#/${path}`);
  const html =
    `<mx-reply><blockquote><a href="${link(`${original.roomId}/${original.eventId}`)}">In reply to</a> ` +
    `<a href="${link(original.senderId)}">${escapeHtml(original.senderId)}</a><br>${original.html ?? escapeHtml(original.body)}</blockquote></mx-reply>`;
  return { body, html };
}

/** Annotations → reactions grouped by key in first-reacted order; one per sender per key. */
export function reactionsOf(annotations: { key: string; sender: Person; ts: number }[], meId: string): Reaction[] {
  const byKey = new Map<string, Person[]>();
  for (const a of [...annotations].sort((x, y) => x.ts - y.ts)) {
    const senders = byKey.get(a.key) ?? [];
    if (!senders.some((p) => p.id === a.sender.id)) senders.push(a.sender);
    byKey.set(a.key, senders);
  }
  return [...byKey].map(([key, senders]) => ({ key, count: senders.length, mine: senders.some((p) => p.id === meId), senders }));
}

/** A run of membership changes → who joined and who left (net per person); profile changes and invites drop out. */
export function membershipSummary(changes: { person: Person; prev?: string; next: string }[]): { joined: Person[]; left: Person[] } | null {
  const first = new Map<string, string | undefined>();
  const last = new Map<string, { person: Person; next: string }>();
  for (const c of changes) {
    if (!first.has(c.person.id)) first.set(c.person.id, c.prev);
    last.set(c.person.id, { person: c.person, next: c.next });
  }
  const joined: Person[] = [];
  const left: Person[] = [];
  for (const [id, { person, next }] of last) {
    const was = first.get(id) === 'join';
    if (!was && next === 'join') joined.push(person);
    if (was && next !== 'join') left.push(person);
  }
  return joined.length || left.length ? { joined, left } : null;
}

const domainOf = (userId: string) => userId.slice(userId.indexOf(':') + 1);
const localOf = (userId: string) => userId.slice(1, userId.includes(':') ? userId.indexOf(':') : undefined);

/** D-07 deterministic IDs (`henrik_nordlys.no`) → the email they came from; a plain local part → local@server. */
export function emailFromId(userId: string): string {
  const local = localOf(userId);
  const cut = local.lastIndexOf('_');
  const domain = cut > 0 ? local.slice(cut + 1) : '';
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') ? `${local.slice(0, cut)}@${domain}` : `${local}@${domainOf(userId)}`;
}

/** Without the workspace member list: an ID made from an outside email (D-07) is someone from outside. */
export const looksExternal = (userId: string) => emailFromId(userId) !== `${localOf(userId)}@${domainOf(userId)}`;

export interface ThreadReply {
  id: string;
  ts: number;
  sender: string;
}

/**
 * Thread summary from what we know: the server's bundled summary on the root (a snapshot) plus replies seen since
 * (sync) or fetched (relations). Participants: most recent first.
 */
export function threadStats(
  bundled: { count: number; latest?: ThreadReply } | undefined,
  replies: ThreadReply[],
  complete: boolean,
): { count: number; lastTs: number; latest?: ThreadReply; participants: string[] } | null {
  const known = new Map(replies.map((r) => [r.id, r]));
  const all = [...known.values()];
  if (bundled?.latest && !known.has(bundled.latest.id)) all.push(bundled.latest);
  all.sort((a, b) => b.ts - a.ts);
  const newer = bundled?.latest ? replies.filter((r) => r.ts > bundled.latest!.ts).length : replies.length;
  const count = complete || !bundled ? known.size : Math.max(known.size, bundled.count + (bundled.latest ? newer : 0));
  if (!count || !all.length) return null;
  return { count, lastTs: all[0]!.ts, latest: all[0], participants: [...new Set(all.map((r) => r.sender))] };
}

export const sameMembers = (a: string[], b: string[]) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((id) => y.has(id));
};

export interface PowerFacts {
  /** Room version 12+ ("hydra"): the creator(s) outrank everyone and aren't listed in `users`. */
  creators: string[];
  users?: Record<string, unknown>;
  usersDefault?: unknown;
}

export const hydra = (version: unknown) => typeof version === 'string' && (Number(version) >= 12 || version.includes('hydra'));

export function powerLevel(f: PowerFacts, userId: string): number {
  if (f.creators.includes(userId)) return Infinity;
  const level = f.users?.[userId];
  if (typeof level === 'number') return level;
  return typeof f.usersDefault === 'number' ? f.usersDefault : 0;
}

/** D-06: Owner/Admin from the workspace power level; otherwise which space the person is in. */
export function roleOf(level: number, home: 'workspace' | 'client' | 'none'): Role {
  if (level >= 100) return 'owner';
  if (level >= 50) return 'admin';
  return home === 'workspace' ? 'staff' : home === 'client' ? 'client' : 'external';
}

/** D-25: Owners make or remove Owners; Owners and Admins move people between Staff and Admin. Matrix adds: nobody changes someone at or above their own level, except themselves. */
export function mayChangeRole(mine: number, theirs: number, role: 'owner' | 'admin' | 'staff', self: boolean): boolean {
  if (!self && theirs >= mine) return false;
  return role === 'owner' || theirs >= 100 ? mine >= 100 : mine >= 50;
}

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.startsWith('!')))] : []);

/** D-36. `work.pasodrum.access_role` content; empty content (a deleted role) or no name = absent. */
export function accessRoleOf(id: string, content: unknown): AccessRole | null {
  const c = (content && typeof content === 'object' ? content : {}) as Record<string, unknown>;
  if (typeof c.name !== 'string' || !c.name.trim()) return null;
  return { id, name: c.name, colour: typeof c.colour === 'string' ? c.colour : '', channels: ids(c.channels), spaces: ids(c.spaces) };
}

export type ExternalRecord = { roles: string[]; channels: string[] };

/** D-36. `work.pasodrum.external` content; empty content (removed) = absent. */
export function externalRecordOf(content: unknown): ExternalRecord | null {
  if (!content || typeof content !== 'object' || !Object.keys(content).length) return null;
  const c = content as Record<string, unknown>;
  const roles = Array.isArray(c.roles) ? [...new Set(c.roles.filter((x): x is string => typeof x === 'string' && !!x))] : [];
  return { roles, channels: ids(c.channels) };
}
