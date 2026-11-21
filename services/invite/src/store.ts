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
`;

export function openStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
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
    revokeAllForUser: db.prepare('UPDATE invites SET revokedTs = ? WHERE userId = ? AND claimedTs IS NULL AND revokedTs IS NULL'),
  };
  return {
    insert(i: Invite) {
      q.insert.run({ ...i, team: JSON.stringify(i.team), rooms: JSON.stringify(i.rooms) });
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
    /** Every open code for this person in this space; returns how many. */
    revokeForUser(userId: string, spaceId: string, ts: number): number {
      return Number(q.revokeForUser.run(ts, userId, spaceId).changes);
    },
    /** Every open code for this person, in every space; returns how many. */
    revokeAllForUser(userId: string, ts: number): number {
      return Number(q.revokeAllForUser.run(ts, userId).changes);
    },
    close: () => db.close(),
  };
}

export type Store = ReturnType<typeof openStore>;
