import { DatabaseSync } from 'node:sqlite';
import type { Locale } from './email.ts';
import { normalizeRole, type Person, type Role, type SpaceKind } from './rules.ts';

export type Invite = {
  code: string;
  email: string;
  name: string | null;
  role: Role;
  userId: string;
  spaceId: string;
  spaceName: string;
  spaceKind: SpaceKind;
  inviterId: string;
  inviterName: string;
  team: Person[];
  rooms: string[];
  locale: Locale;
  secret: string | null;
  createdTs: number;
  expiresTs: number;
  claimedTs: number | null;
  revokedTs: number | null;
};

/** D-38: one emailed link, bound to the device that asked. */
export type ConfirmRequest = {
  code: string;
  userId: string;
  deviceId: string;
  deviceName: string | null;
  email: string;
  locale: Locale;
  tz: string | null;
  /** Who the help DM goes to, picked at start so a link holder with no session can ask too. */
  contacts: Person[];
  spaceId: string | null;
  spaceName: string | null;
  createdTs: number;
  expiresTs: number;
  confirmedTs: number | null;
  releasedTs: number | null;
  replacedTs: number | null;
  /** sha256 of the access token that asked: a later login reusing the device ID can't collect. */
  session: string;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL,
  userId TEXT NOT NULL,
  spaceId TEXT NOT NULL,
  spaceName TEXT NOT NULL,
  spaceKind TEXT NOT NULL,
  inviterId TEXT NOT NULL,
  inviterName TEXT NOT NULL,
  team TEXT NOT NULL,
  rooms TEXT NOT NULL,
  locale TEXT NOT NULL,
  secret TEXT,
  createdTs INTEGER NOT NULL,
  expiresTs INTEGER NOT NULL,
  claimedTs INTEGER,
  revokedTs INTEGER
);
CREATE INDEX IF NOT EXISTS invites_user ON invites(userId);
CREATE TABLE IF NOT EXISTS invite_seen (code TEXT NOT NULL, userId TEXT NOT NULL, PRIMARY KEY (code, userId));
CREATE INDEX IF NOT EXISTS invite_seen_user ON invite_seen(userId);
CREATE TABLE IF NOT EXISTS confirm_keys (
  userId TEXT PRIMARY KEY,
  sealed TEXT NOT NULL,
  keyId TEXT NOT NULL,
  updatedTs INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS confirm_requests (
  code TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  deviceId TEXT NOT NULL,
  deviceName TEXT,
  email TEXT NOT NULL,
  locale TEXT NOT NULL,
  tz TEXT,
  contacts TEXT NOT NULL,
  spaceId TEXT,
  spaceName TEXT,
  createdTs INTEGER NOT NULL,
  expiresTs INTEGER NOT NULL,
  confirmedTs INTEGER,
  releasedTs INTEGER,
  replacedTs INTEGER,
  session TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS confirm_requests_user ON confirm_requests(userId, createdTs);
CREATE TABLE IF NOT EXISTS help_rooms (contactId TEXT PRIMARY KEY, roomId TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS help_sent (userId TEXT PRIMARY KEY, ts INTEGER NOT NULL);
`;

export function openStore(path: string) {
  // The integration tests open this file from a second process; wait for it instead of failing with "database is locked".
  const db = new DatabaseSync(path, { timeout: 2000 });
  const exists = (table: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  const legacy = exists('invites') && !exists('invite_seen');
  // Nobody knows who read codes from the list before invite_seen existed: '*' means anyone, so any removal revokes them.
  db.exec(`BEGIN; ${SCHEMA} ${legacy ? `INSERT OR IGNORE INTO invite_seen SELECT code, inviterId FROM invites WHERE claimedTs IS NULL AND revokedTs IS NULL;
    INSERT OR IGNORE INTO invite_seen SELECT code, '*' FROM invites WHERE claimedTs IS NULL AND revokedTs IS NULL;` : ''} COMMIT;`);
  const toInvite = (r: unknown): Invite => {
    const row = r as Record<string, unknown>;
    // Rows from before D-36 say member/guest; they're read as staff/external, never rewritten.
    return { ...row, role: normalizeRole(row.role) ?? row.role, team: JSON.parse(String(row.team)), rooms: JSON.parse(String(row.rooms)) } as Invite;
  };
  const q = {
    insert: db.prepare(`INSERT INTO invites VALUES ($code, $email, $name, $role, $userId, $spaceId, $spaceName, $spaceKind,
      $inviterId, $inviterName, $team, $rooms, $locale, $secret, $createdTs, $expiresTs, $claimedTs, $revokedTs)`),
    get: db.prepare('SELECT * FROM invites WHERE code = ?'),
    // Latest code for an account this service created and nobody has claimed.
    dormantForUser: db.prepare(`SELECT * FROM invites i WHERE userId = ? AND secret IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM invites c WHERE c.userId = i.userId AND c.claimedTs IS NOT NULL) ORDER BY createdTs DESC`),
    pendingForRoom: db.prepare(`SELECT * FROM invites WHERE claimedTs IS NULL AND revokedTs IS NULL
      AND EXISTS (SELECT 1 FROM json_each(invites.rooms) WHERE value = ?) ORDER BY createdTs`),
    supersede: db.prepare('UPDATE invites SET revokedTs = coalesce(revokedTs, ?), secret = NULL WHERE userId = ? AND spaceId = ? AND claimedTs IS NULL'),
    claimedElsewhere: db.prepare('UPDATE invites SET revokedTs = coalesce(revokedTs, ?), secret = NULL WHERE userId = ? AND code != ? AND claimedTs IS NULL'),
    extend: db.prepare('UPDATE invites SET expiresTs = ? WHERE code = ?'),
    claim: db.prepare('UPDATE invites SET claimedTs = ?, secret = NULL WHERE code = ? AND claimedTs IS NULL'),
    revoke: db.prepare('UPDATE invites SET revokedTs = ? WHERE code = ? AND claimedTs IS NULL AND revokedTs IS NULL'),
    revokeForUser: db.prepare('UPDATE invites SET revokedTs = ? WHERE userId = ? AND spaceId = ? AND claimedTs IS NULL AND revokedTs IS NULL'),
    revokeForSpace: db.prepare('UPDATE invites SET revokedTs = ? WHERE spaceId = ? AND claimedTs IS NULL AND revokedTs IS NULL'),
    revokeAllForUser: db.prepare('UPDATE invites SET revokedTs = ? WHERE userId = ? AND claimedTs IS NULL AND revokedTs IS NULL'),
    seen: db.prepare('INSERT OR IGNORE INTO invite_seen VALUES (?, ?)'),
    revokeSeenIn: db.prepare(`UPDATE invites SET revokedTs = $ts WHERE claimedTs IS NULL AND revokedTs IS NULL
      AND code IN (SELECT code FROM invite_seen WHERE userId IN ($userId, '*'))
      AND (spaceId IN (SELECT value FROM json_each($rooms)) OR EXISTS (SELECT 1 FROM json_each(invites.rooms) WHERE value IN (SELECT value FROM json_each($rooms))))`),
    revokeAllSeen: db.prepare(`UPDATE invites SET revokedTs = ? WHERE claimedTs IS NULL AND revokedTs IS NULL
      AND code IN (SELECT code FROM invite_seen WHERE userId IN (?, '*'))`),
    latestClaimed: db.prepare('SELECT * FROM invites WHERE userId = ? AND claimedTs IS NOT NULL ORDER BY claimedTs DESC'),
    unclaimedAccount: db.prepare(`SELECT 1 FROM invites i WHERE userId = ?
      AND NOT EXISTS (SELECT 1 FROM invites c WHERE c.userId = i.userId AND c.claimedTs IS NOT NULL)`),
    clientAccount: db.prepare(`SELECT 1 FROM invites i WHERE userId = ?
      AND NOT EXISTS (SELECT 1 FROM invites o WHERE o.userId = i.userId AND o.role != 'client')`),
    clientOf: db.prepare(`SELECT 1 FROM invites i WHERE userId = ? AND spaceId = ? AND role = 'client' AND claimedTs IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM invites o WHERE o.userId = i.userId AND o.role != 'client')`),
    confirmKey: db.prepare('SELECT sealed, keyId FROM confirm_keys WHERE userId = ?'),
    putConfirmKey: db.prepare(`INSERT INTO confirm_keys VALUES (?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET sealed = excluded.sealed, keyId = excluded.keyId, updatedTs = excluded.updatedTs`),
    dropConfirmKey: db.prepare('DELETE FROM confirm_keys WHERE userId = ?'),
    replaceConfirms: db.prepare('UPDATE confirm_requests SET replacedTs = ? WHERE userId = ? AND replacedTs IS NULL'),
    insertConfirm: db.prepare(`INSERT INTO confirm_requests VALUES ($code, $userId, $deviceId, $deviceName, $email, $locale, $tz,
      $contacts, $spaceId, $spaceName, $createdTs, $expiresTs, $confirmedTs, $releasedTs, $replacedTs, $session)`),
    dropConfirm: db.prepare('DELETE FROM confirm_requests WHERE code = ?'),
    confirm: db.prepare('SELECT * FROM confirm_requests WHERE code = ?'),
    lastConfirmTs: db.prepare('SELECT max(createdTs) AS ts FROM confirm_requests WHERE userId = ?'),
    latestConfirmFor: db.prepare('SELECT * FROM confirm_requests WHERE userId = ? AND deviceId = ? AND session = ? ORDER BY createdTs DESC'),
    tap: db.prepare(`UPDATE confirm_requests SET confirmedTs = $now WHERE code = $code
      AND confirmedTs IS NULL AND replacedTs IS NULL AND expiresTs > $now`),
    release: db.prepare(`UPDATE confirm_requests SET releasedTs = $now WHERE code = $code
      AND releasedTs IS NULL AND replacedTs IS NULL AND confirmedTs IS NOT NULL AND confirmedTs > $since`),
    helpRoom: db.prepare('SELECT roomId FROM help_rooms WHERE contactId = ?'),
    setHelpRoom: db.prepare('INSERT INTO help_rooms VALUES (?, ?) ON CONFLICT(contactId) DO UPDATE SET roomId = excluded.roomId'),
    helpSent: db.prepare('SELECT ts FROM help_sent WHERE userId = ?'),
    claimHelp: db.prepare(`INSERT INTO help_sent VALUES ($userId, $now)
      ON CONFLICT(userId) DO UPDATE SET ts = excluded.ts WHERE help_sent.ts <= $before`),
    setHelpSent: db.prepare('UPDATE help_sent SET ts = ? WHERE userId = ?'),
    dropHelpSent: db.prepare('DELETE FROM help_sent WHERE userId = ?'),
  };
  const toConfirm = (r: unknown): ConfirmRequest => {
    const row = r as Record<string, unknown>;
    return { ...row, contacts: JSON.parse(String(row.contacts)) } as ConfirmRequest;
  };
  return {
    insert(i: Invite) {
      q.insert.run({ ...i, team: JSON.stringify(i.team), rooms: JSON.stringify(i.rooms) });
      q.seen.run(i.code, i.inviterId);
    },
    /** These codes were handed to this person; removing them revokes the codes. */
    seen(codes: string[], userId: string) {
      for (const code of codes) q.seen.run(code, userId);
    },
    get(code: string): Invite | undefined {
      const r = q.get.get(code);
      return r ? toInvite(r) : undefined;
    },
    dormantForUser(userId: string): Invite | undefined {
      const r = q.dormantForUser.get(userId);
      return r ? toInvite(r) : undefined;
    },
    pendingForRoom(roomId: string): Invite[] {
      return q.pendingForRoom.all(roomId).map(toInvite);
    },
    // A fresh code for an account in a space replaces its older codes there; codes for other spaces stay (D-28).
    supersede(userId: string, spaceId: string, ts: number) {
      q.supersede.run(ts, userId, spaceId);
    },
    extend(code: string, expiresTs: number) {
      q.extend.run(expiresTs, code);
    },
    // The account is claimed: its codes for other spaces die with it.
    claim(code: string, userId: string, ts: number) {
      q.claim.run(ts, code);
      q.claimedElsewhere.run(ts, userId, code);
    },
    revoke(code: string, ts: number) {
      q.revoke.run(ts, code);
    },
    /**
     * Every open code for this person in this space, and every one they created or read that is filed under or adds to
     * one of `rooms` (the space and its children: an External's code is filed under the workspace); returns how many.
     */
    revokeForUser(userId: string, spaceId: string, rooms: string[], ts: number): number {
      return Number(q.revokeForUser.run(ts, userId, spaceId).changes) + Number(q.revokeSeenIn.run({ ts, userId, rooms: JSON.stringify(rooms) }).changes);
    },
    /** Every open code in this space; returns how many. */
    revokeForSpace(spaceId: string, ts: number): number {
      return Number(q.revokeForSpace.run(ts, spaceId).changes);
    },
    /** Every open code for this person, and every one they created or read, in every space; returns how many. */
    revokeAllForUser(userId: string, ts: number): number {
      return Number(q.revokeAllForUser.run(ts, userId).changes) + Number(q.revokeAllSeen.run(ts, userId).changes);
    },
    /** This service made the account and nobody has claimed it: only its sealed temporary password signs in. */
    unclaimedAccount(userId: string): boolean {
      return !!q.unclaimedAccount.get(userId);
    },
    /** Every invite this service made for the account was a client invite. */
    clientAccount(userId: string): boolean {
      return !!q.clientAccount.get(userId);
    },
    /** D-53: invited to this space as a client, claimed, and never invited as anything else. */
    clientOf(userId: string, spaceId: string): boolean {
      return !!q.clientOf.get(userId, spaceId);
    },
    latestClaimed(userId: string): Invite | undefined {
      const r = q.latestClaimed.get(userId);
      return r ? toInvite(r) : undefined;
    },

    confirmKey(userId: string): { sealed: string; keyId: string } | undefined {
      return q.confirmKey.get(userId) as { sealed: string; keyId: string } | undefined;
    },
    putConfirmKey(userId: string, sealed: string, keyId: string, ts: number) {
      q.putConfirmKey.run(userId, sealed, keyId, ts);
    },
    dropConfirmKey(userId: string) {
      q.dropConfirmKey.run(userId);
    },
    /** The new link replaces every earlier one of this person. */
    startConfirm(r: ConfirmRequest) {
      q.replaceConfirms.run(r.createdTs, r.userId);
      q.insertConfirm.run({ ...r, contacts: JSON.stringify(r.contacts) });
    },
    dropConfirm(code: string) {
      q.dropConfirm.run(code);
    },
    confirmRequest(code: string): ConfirmRequest | undefined {
      const r = q.confirm.get(code);
      return r ? toConfirm(r) : undefined;
    },
    lastConfirmTs(userId: string): number | null {
      return ((q.lastConfirmTs.get(userId) as { ts: number | null } | undefined)?.ts) ?? null;
    },
    latestConfirmFor(userId: string, deviceId: string, session: string): ConfirmRequest | undefined {
      const r = q.latestConfirmFor.get(userId, deviceId, session);
      return r ? toConfirm(r) : undefined;
    },
    /** The tap: true only for the first one on an open, unexpired, unreplaced link. */
    tap(code: string, now: number): boolean {
      return Number(q.tap.run({ code, now }).changes) === 1;
    },
    /** The key goes out once: true only for the first release of a link tapped after `since`. */
    release(code: string, now: number, since: number): boolean {
      return Number(q.release.run({ code, now, since }).changes) === 1;
    },

    helpRoom(contactId: string): string | undefined {
      return (q.helpRoom.get(contactId) as { roomId: string } | undefined)?.roomId;
    },
    setHelpRoom(contactId: string, roomId: string) {
      q.setHelpRoom.run(contactId, roomId);
    },
    /** Takes this person's help slot (one per `windowMs`); returns an undo, or null when it's taken. */
    claimHelp(userId: string, now: number, windowMs: number): (() => void) | null {
      const prev = (q.helpSent.get(userId) as { ts: number } | undefined)?.ts;
      if (Number(q.claimHelp.run({ userId, now, before: now - windowMs }).changes) !== 1) return null;
      return () => (prev === undefined ? q.dropHelpSent.run(userId) : q.setHelpSent.run(prev, userId));
    },

    close: () => db.close(),
  };
}

export type Store = ReturnType<typeof openStore>;
