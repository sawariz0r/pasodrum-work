import { escapeHtml } from './html';
import type { Channel, ConnectionState, Media, Person, Reaction, Space } from './types';

export interface RoomFacts {
  id: string;
  name: string;
  joined: boolean;
  isSpace: boolean;
  /** Any room type other than a space (boards, docs…); such rooms are not channels. */
  otherType: boolean;
  clientSpace: boolean;
  joinRule?: string;
  topic?: string;
  children: string[];
  unread: number;
  mentions: number;
  memberCount: number;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function workspaceOf(rooms: RoomFacts[]): { spaces: Space[]; channels: Record<string, Channel[]> } {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const joinedSpaces = rooms.filter((r) => r.joined && r.isSpace);
  const spaces: Space[] = joinedSpaces
    .map((r): Space => ({ id: r.id, name: r.name, kind: r.clientSpace ? 'client' : 'workspace' }))
    .sort((a, b) => (a.kind === b.kind ? byName(a, b) : a.kind === 'workspace' ? -1 : 1));
  const channels: Record<string, Channel[]> = {};
  for (const space of joinedSpaces) {
    channels[space.id] = space.children
      .map((id) => byId.get(id))
      .filter((r): r is RoomFacts => !!r && r.joined && !r.isSpace && !r.otherType)
      .map((r): Channel => ({
        id: r.id,
        spaceId: space.id,
        name: r.name,
        ...(r.topic ? { topic: r.topic } : {}),
        private: r.joinRule !== 'restricted' && r.joinRule !== 'public',
        unread: r.unread,
        mentions: r.mentions,
        memberCount: r.memberCount,
      }))
      .sort(byName);
  }
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

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const MEDIA = new Set(['m.image', 'm.video', 'm.audio', 'm.file']);

/** m.image/m.video/m.audio/m.file (and m.sticker) content → Media plus the caption ('' when the body is just the file name). */
export function mediaOf(content: Record<string, unknown>, sticker = false): { media: Media; caption: string } | null {
  const ref = str(content.url);
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
    thumbnailRef: str(info.thumbnail_url),
    durationMs: num(info.duration),
  };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) (media as unknown as Record<string, unknown>)[k] = v;
  return { media, caption: filename && filename !== body && !sticker ? body : '' };
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
