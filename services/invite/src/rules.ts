export type Role = 'member' | 'guest' | 'client';
export type SpaceKind = 'workspace' | 'client';
export type InviteState = 'open' | 'used' | 'expired' | 'revoked';
export type Person = { id: string; name: string };
export type StateEvent = { type: string; state_key?: string; sender?: string; content?: Record<string, unknown> };

export const ROLES: readonly Role[] = ['member', 'guest', 'client'];
export const ADMIN_LEVEL = 50;
export const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SpaceInfo = {
  name: string;
  kind: SpaceKind;
  joined: Map<string, string>;
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
  for (const e of events) {
    if (e.type !== 'm.room.member' || !e.state_key || e.content?.membership !== 'join') continue;
    const name = e.content.displayname;
    joined.set(e.state_key, typeof name === 'string' && name ? name : e.state_key.slice(1, e.state_key.indexOf(':')));
  }
  const name = find('m.room.name').name;
  return {
    name: typeof name === 'string' ? name : '',
    kind: find('work.pasodrum.space').kind === 'client' ? 'client' : 'workspace',
    joined,
    powerOf: (userId) => (creators.includes(userId) ? Infinity : users[userId] ?? usersDefault),
  };
}

// D-25 / D-06: Owner/Admin add Members to the workspace; any workspace member adds guests;
// in a client space the team (who hold invite rights there, PL 50) add clients.
export function canInvite(role: Role, space: SpaceInfo, caller: string): boolean {
  if (!space.joined.has(caller)) return false;
  const level = space.powerOf(caller);
  switch (role) {
    case 'member': return space.kind === 'workspace' && level >= ADMIN_LEVEL;
    case 'guest': return space.kind === 'workspace';
    case 'client': return space.kind === 'client' && level >= ADMIN_LEVEL;
  }
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
