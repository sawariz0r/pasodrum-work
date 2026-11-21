// D-27/D-36 power levels. No imports, so dev/seed.ts (and M5 client-space creation) can reuse it as is.

export const LEVEL = { owner: 100, admin: 50, staff: 10, external: 1, client: 0 } as const;

/** D-36. Workspace state only Owners and Admins write: access roles (state key = role id) and External records (state key = externalKey). */
export const ACCESS_ROLE = 'work.pasodrum.access_role';
export const EXTERNAL = 'work.pasodrum.external';
/** A state key starting with "@" may only be set by that user (Matrix auth rules), so the record's key is the ID without it. */
export const externalKey = (userId: string) => userId.replace(/^@/, '');

export type SpaceKind = 'workspace' | 'client';

/** M7 (D-33): anyone in a conversation may pin. */
export const PINS = 'm.room.pinned_events';
/** D-37: a space's page tree (state key = page room id); everyone in the space may change it. */
export const PAGES = 'work.pasodrum.docs.page';

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
    // D-36: Staff and up add people in channels; Externals (1) add nobody.
    invite: client ? LEVEL.staff : space ? LEVEL.admin : LEVEL.staff,
    kick: LEVEL.admin,
    ban: LEVEL.admin,
    redact: LEVEL.admin,
    notifications: { room: LEVEL.admin },
    events: {
      'm.room.power_levels': LEVEL.admin,
      'm.space.child': space ? LEVEL.staff : LEVEL.admin,
      'm.room.history_visibility': LEVEL.owner,
      'm.room.encryption': LEVEL.owner,
      'm.room.server_acl': LEVEL.owner,
      'm.room.tombstone': LEVEL.owner,
      ...(space ? { [PAGES]: LEVEL.client } : { [PINS]: LEVEL.client }),
      ...(space && !client ? { [ACCESS_ROLE]: LEVEL.admin, [EXTERNAL]: LEVEL.admin } : {}),
    },
  };
}

/**
 * M7. Level override for a new DM: the server defaults plus anyone may pin. `events` replaces the server's defaults
 * wholesale (Continuwuity), so they're restated; it fills in the tombstone level itself.
 */
export function dmLevels() {
  return {
    events: {
      'm.room.power_levels': LEVEL.owner,
      'm.room.history_visibility': LEVEL.owner,
      'm.room.encryption': LEVEL.owner,
      'm.room.server_acl': LEVEL.owner,
      [PINS]: LEVEL.client,
    },
  };
}

/** M7 migration: pins open to everyone, or Admin and up while the channel is archived (events_default raised, D-28). */
export function withPins(content: Record<string, unknown>): Record<string, unknown> {
  const archived = typeof content.events_default === 'number' && content.events_default >= LEVEL.admin;
  return { ...content, events: { ...((content.events as Record<string, number> | undefined) ?? {}), [PINS]: archived ? LEVEL.admin : LEVEL.client } };
}

/** A channel's users: everyone with a level in its space keeps it (Externals their mark, D-36; space creators as Owners). */
export function channelUsers(spaceUsers: Record<string, unknown>, spaceCreators: string[], creator: string): Record<string, number> {
  const users: Record<string, number> = {};
  for (const [id, level] of Object.entries(spaceUsers)) if (typeof level === 'number' && level >= LEVEL.external) users[id] = level;
  for (const id of spaceCreators) users[id] = LEVEL.owner;
  delete users[creator];
  return users;
}

/** D-36. The workspace space and its channels: Staff and up keep at least staff level; `m.space.child` at 10; the access state at Admin. */
export function workspaceLevels(content: Record<string, unknown>, staff: string[], room: 'space' | 'channel'): Record<string, unknown> {
  const events = { ...((content.events as Record<string, number> | undefined) ?? {}) };
  if (room === 'space') Object.assign(events, { 'm.space.child': LEVEL.staff, [ACCESS_ROLE]: LEVEL.admin, [EXTERNAL]: LEVEL.admin });
  return { ...withLevel(content, staff, LEVEL.staff), events, ...(room === 'channel' ? { invite: LEVEL.staff } : {}) };
}

/** Lifts these people to at least `level` (never lowers anyone). */
export function withLevel(content: Record<string, unknown>, ids: string[], level: number): Record<string, unknown> {
  const users = { ...((content.users as Record<string, number> | undefined) ?? {}) };
  const base = typeof content.users_default === 'number' ? content.users_default : 0;
  for (const id of ids) if ((users[id] ?? base) < level) users[id] = level;
  return { ...content, users };
}

const ARCHIVE_EVENTS = ['m.reaction', 'm.room.redaction'];

/** D-28: an archived channel is read-only below Admin (pins too, M7); unarchiving restores the D-27 values. Everything else stays. */
export function archivedLevels(content: Record<string, unknown>, kind: SpaceKind, archived: boolean): Record<string, unknown> {
  const events = { ...((content.events as Record<string, number> | undefined) ?? {}) };
  for (const type of ARCHIVE_EVENTS) {
    if (archived) events[type] = LEVEL.admin;
    else delete events[type];
  }
  events[PINS] = archived ? LEVEL.admin : LEVEL.client;
  return { ...content, events_default: archived ? LEVEL.admin : powerLevels(kind, 'channel', {}).events_default, events };
}
