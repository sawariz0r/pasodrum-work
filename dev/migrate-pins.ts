// M7 (D-33): lets anyone pin in existing channels and DMs: m.room.pinned_events at 0 (Admin while archived, D-28).
// Also D-27: a channel's users keep at least their level in its space (Owners/Admins/team added after the channel was made).
// Runs as the owner account sofia, changes only rooms sofia may change, and is safe to run again.
// Local: pnpm migrate:pins · Production (only when the CEO asks): set -a; . dev/.env.production; set +a; pnpm migrate:pins
import { enc, login, mx, ok, userId } from './lib.ts';
import { PINS, channelUsers, withPins } from '../apps/web/src/matrix/levels.ts';

type StateEvent = { type: string; state_key: string; sender: string; content: Record<string, any> };

const me = userId('sofia');
const token = await login('sofia');
const direct = await mx(token, 'GET', `/_matrix/client/v3/user/${enc(me)}/account_data/m.direct`);
const dms = new Set(direct.status === 200 ? Object.values(direct.body as Record<string, string[]>).flat() : []);
const { joined_rooms: rooms } = (await ok(token, 'GET', '/_matrix/client/v3/joined_rooms')) as { joined_rooms: string[] };
const tally = { updated: 0, already: 0, notAllowed: 0, skipped: 0 };
const spaceFacts = new Map<string, { users: Record<string, unknown>; creators: string[] }>();
const factsOf = async (spaceId: string) => {
  if (!spaceFacts.has(spaceId)) {
    const st = (await ok(token, 'GET', `/_matrix/client/v3/rooms/${enc(spaceId)}/state`)) as StateEvent[];
    const c = st.find((e) => e.type === 'm.room.create');
    const pl = st.find((e) => e.type === 'm.room.power_levels')?.content ?? {};
    const creators = c && Number(c.content.room_version) >= 12 ? [c.sender, ...(c.content.additional_creators ?? [])] : [];
    spaceFacts.set(spaceId, { users: pl.users ?? {}, creators });
  }
  return spaceFacts.get(spaceId)!;
};

for (const roomId of rooms) {
  const state = (await ok(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state`)) as StateEvent[];
  const get = (type: string) => state.find((e) => e.type === type && e.state_key === '');
  const create = get('m.room.create');
  const channel = state.some((e) => e.type === 'm.space.parent');
  // Spaces, boards/docs and anything that's neither a channel nor one of my DMs stay as they are.
  if (!create || create.content.type || (!channel && !dms.has(roomId))) {
    tally.skipped++;
    continue;
  }
  const label = channel ? `#${get('m.room.name')?.content.name ?? roomId}` : `DM ${roomId}`;
  const levels = get('m.room.power_levels')?.content ?? {};
  const next = withPins(levels);
  const parent = state.find((e) => e.type === 'm.space.parent')?.state_key;
  const raised: string[] = [];
  if (parent) {
    const f = await factsOf(parent);
    const users = { ...((levels.users as Record<string, number> | undefined) ?? {}) };
    for (const [id, level] of Object.entries(channelUsers(f.users, f.creators, create.sender))) {
      if ((users[id] ?? levels.users_default ?? 0) >= level) continue;
      users[id] = level;
      raised.push(id.split(':')[0]!);
    }
    next.users = users;
  }
  if (levels.events?.[PINS] === (next.events as Record<string, number>)[PINS] && !raised.length) {
    tally.already++;
    continue;
  }
  // Room version 12+: the creator outranks every level; otherwise my level must reach the one for changing levels.
  const creator = Number(create.content.room_version) >= 12 && (create.sender === me || (create.content.additional_creators ?? []).includes(me));
  const need = levels.events?.['m.room.power_levels'] ?? levels.state_default ?? 50;
  if (!creator && (levels.users?.[me] ?? levels.users_default ?? 0) < need) {
    console.log(`  ${label}: not allowed`);
    tally.notAllowed++;
    continue;
  }
  const put = await mx(token, 'PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.power_levels/`, next);
  if (put.status >= 300) {
    console.log(`  ${label}: ${put.status} ${put.body?.errcode ?? ''}`);
    tally.notAllowed++;
    continue;
  }
  console.log(`  ${label}: anyone can pin${raised.length ? `; raised ${raised.join(', ')}` : ''}`);
  tally.updated++;
}

console.log(`Pins: ${tally.updated} updated, ${tally.already} already done, ${tally.notAllowed} not allowed, ${tally.skipped} skipped.`);
