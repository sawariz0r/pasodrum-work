import type { Channel, ConnectionState, Space } from './types';

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
