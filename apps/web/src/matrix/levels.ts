// D-27 power levels. No imports, so dev/seed.ts (and M5 client-space creation) can reuse it as is.

export const LEVEL = { owner: 100, admin: 50, staff: 10, member: 0 } as const;

export type SpaceKind = 'workspace' | 'client';

/**
 * Full m.room.power_levels content for a space or one of its channels. `users` holds explicit levels; in room
 * version 12 the creator outranks everyone and must not be listed.
 */
export function powerLevels(kind: SpaceKind, room: 'space' | 'channel', users: Record<string, number>) {
  const client = kind === 'client';
  const space = room === 'space';
  return {
    users,
    users_default: 0,
    // Nobody posts in a space itself.
    events_default: space ? LEVEL.admin : 0,
    state_default: LEVEL.admin,
    invite: client ? LEVEL.staff : space ? LEVEL.admin : 0,
    kick: LEVEL.admin,
    ban: LEVEL.admin,
    redact: LEVEL.admin,
    notifications: { room: LEVEL.admin },
    events: {
      'm.room.power_levels': LEVEL.admin,
      'm.space.child': space ? (client ? LEVEL.staff : 0) : LEVEL.admin,
      'm.room.history_visibility': LEVEL.owner,
      'm.room.encryption': LEVEL.owner,
      'm.room.server_acl': LEVEL.owner,
      'm.room.tombstone': LEVEL.owner,
    },
  };
}

/** A channel's users: everyone at staff level or above in its space keeps that level (space creators as Owners). */
export function channelUsers(spaceUsers: Record<string, unknown>, spaceCreators: string[], creator: string): Record<string, number> {
  const users: Record<string, number> = {};
  for (const [id, level] of Object.entries(spaceUsers)) if (typeof level === 'number' && level >= LEVEL.staff) users[id] = level;
  for (const id of spaceCreators) users[id] = LEVEL.owner;
  delete users[creator];
  return users;
}

/** The level a role means in a room: Members on a client space's team sit at staff level there (D-27). */
export function levelFor(role: 'owner' | 'admin' | 'member', kind: SpaceKind, onTeam: boolean): number {
  if (role !== 'member') return LEVEL[role];
  return kind === 'client' && onTeam ? LEVEL.staff : LEVEL.member;
}

const ARCHIVE_EVENTS = ['m.reaction', 'm.room.redaction'];

/** D-28: an archived channel is read-only below Admin; unarchiving restores the D-27 values. Everything else stays. */
export function archivedLevels(content: Record<string, unknown>, kind: SpaceKind, archived: boolean): Record<string, unknown> {
  const events = { ...((content.events as Record<string, number> | undefined) ?? {}) };
  for (const type of ARCHIVE_EVENTS) {
    if (archived) events[type] = LEVEL.admin;
    else delete events[type];
  }
  return { ...content, events_default: archived ? LEVEL.admin : powerLevels(kind, 'channel', {}).events_default, events };
}
