export type Role = 'staff' | 'external' | 'client';
export type SpaceKind = 'workspace' | 'client';
export type InviteState = 'open' | 'used' | 'expired' | 'revoked';
export type Person = { id: string; name: string };
export type StateEvent = { type: string; state_key?: string; sender?: string; content?: Record<string, unknown> };

export const ROLES: readonly Role[] = ['staff', 'external', 'client'];
export const OWNER_LEVEL = 100;
export const ADMIN_LEVEL = 50;
export const STAFF_LEVEL = 10;

// D-36: Members became Staff and guests Externals; old request bodies and stored rows keep the old names.
const LEGACY: Record<string, Role> = { member: 'staff', guest: 'external' };
export function normalizeRole(role: unknown): Role | null {
  if (typeof role !== 'string') return null;
  return ROLES.includes(role as Role) ? (role as Role) : LEGACY[role] ?? null;
}
export const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SpaceInfo = {
  name: string;
  kind: SpaceKind;
  /** Who set `work.pasodrum.space` (what makes a room a client space). */
  kindSender?: string;
  /** SIDE-05: the client space's main contacts (`work.pasodrum.space` `contacts`), in marking order. */
  contacts: string[];
  joined: Map<string, string>;
  /** Rooms this space lists as children (`m.space.child` with a `via`). */
  children: Set<string>;
  /** Spaces this room names as its parents (`m.space.parent`); claimed by the room, so check the parent's children. */
  parents: string[];
  powerOf: (userId: string) => number;
};

export function spaceInfo(events: StateEvent[]): SpaceInfo {
  const find = (type: string, key = '') => events.find((e) => e.type === type && (e.state_key ?? '') === key)?.content ?? {};
  const pl = find('m.room.power_levels');
  // Room version 12+ ("hydra"): creators outrank everyone and aren't listed in `users` (same rule as matrix/map.ts).
  const createEvent = events.find((e) => e.type === 'm.room.create');
  const version = createEvent?.content?.room_version;
  const extra = createEvent?.content?.additional_creators;
  const creators = typeof version === 'string' && (Number(version) >= 12 || version.includes('hydra'))
    ? [createEvent?.sender, ...(Array.isArray(extra) ? extra : [])]
    : [];
  const users = (pl.users ?? {}) as Record<string, number>;
  const usersDefault = typeof pl.users_default === 'number' ? pl.users_default : 0;
  const joined = new Map<string, string>();
  const children = new Set<string>();
  const parents: string[] = [];
  for (const e of events) {
    if (!e.state_key) continue;
    if (e.type === 'm.space.child' && Array.isArray(e.content?.via) && e.content.via.length) children.add(e.state_key);
    if (e.type === 'm.space.parent' && Array.isArray(e.content?.via) && e.content.via.length) parents.push(e.state_key);
    if (e.type !== 'm.room.member' || e.content?.membership !== 'join') continue;
    const name = e.content.displayname;
    joined.set(e.state_key, typeof name === 'string' && name ? name : e.state_key.slice(1, e.state_key.indexOf(':')));
  }
  const name = find('m.room.name').name;
  const kindEvent = events.find((e) => e.type === 'work.pasodrum.space' && (e.state_key ?? '') === '');
  const contacts = kindEvent?.content?.contacts;
  return {
    name: typeof name === 'string' ? name : '',
    kind: kindEvent?.content?.kind === 'client' ? 'client' : 'workspace',
    ...(kindEvent?.sender ? { kindSender: kindEvent.sender } : {}),
    contacts: Array.isArray(contacts) ? contacts.filter((id): id is string => typeof id === 'string') : [],
    joined,
    children,
    parents,
    powerOf: (userId) => (creators.includes(userId) ? Infinity : users[userId] ?? usersDefault),
  };
}

// D-36: Owner/Admin of the workspace add Staff and Externals (both filed under the workspace); Staff and up on a
// client space add its clients.
export function canInvite(role: Role, space: SpaceInfo, caller: string): boolean {
  if (!space.joined.has(caller)) return false;
  const level = space.powerOf(caller);
  switch (role) {
    case 'staff':
    case 'external': return space.kind === 'workspace' && level >= ADMIN_LEVEL;
    case 'client': return space.kind === 'client' && level >= STAFF_LEVEL;
  }
}

/**
 * D-06: anyone can make a room and call it a space, so only real ones count: the workspace is the room its alias points
 * at; a client space is one whose `work.pasodrum.space` was set by an Owner/Admin of the workspace.
 */
export function isGenuine(spaceId: string, space: SpaceInfo, workspaceId: string | null, workspace: SpaceInfo | null): boolean {
  if (!workspaceId) return false;
  if (space.kind === 'workspace') return spaceId === workspaceId;
  const by = space.kindSender;
  return !!by && !!workspace && workspace.joined.has(by) && workspace.powerOf(by) >= ADMIN_LEVEL;
}

/** DES-05: deleting a client space (its open codes die first) is for Owners of it; the workspace is never deleted. */
export function canDelete(space: SpaceInfo, caller: string): boolean {
  return space.kind === 'client' && space.joined.has(caller) && space.powerOf(caller) >= OWNER_LEVEL;
}

export function canManage(inviterId: string, caller: string, space: SpaceInfo | null): boolean {
  return caller === inviterId || (!!space && space.joined.has(caller) && space.powerOf(caller) >= ADMIN_LEVEL);
}

// Inviter first, then by rank; the join page shows a few faces.
export function teamOf(space: SpaceInfo, inviter: string, max = 8): Person[] {
  return [...space.joined]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => Number(b.id === inviter) - Number(a.id === inviter) || space.powerOf(b.id) - space.powerOf(a.id))
    .slice(0, max);
}

export function stateOf(i: { claimedTs: number | null; revokedTs: number | null; expiresTs: number }, now: number): InviteState {
  if (i.claimedTs) return 'used';
  if (i.revokedTs) return 'revoked';
  if (i.expiresTs <= now) return 'expired';
  return 'open';
}

export function rateLimiter() {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string, max: number, windowMs: number, now = Date.now()): boolean => {
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    const h = hits.get(key);
    if (!h || h.reset <= now) {
      hits.set(key, { n: 1, reset: now + windowMs });
      return true;
    }
    h.n += 1;
    return h.n <= max;
  };
}
