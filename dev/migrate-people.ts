// D-36 people and access: Members become Staff (10 in the workspace and its channels), guests become Externals (a
// record with their channels as one-offs, level 1 there), workspace channels let only Staff and up add people (invite
// 10), the workspace gets the access state at Admin and m.space.child at 10. Client spaces don't change.
// Runs as the Owner account sofia, compares before every write (a second run makes 0 writes), --dry-run writes nothing.
// Local: pnpm migrate:people [--dry-run] · Production (only when the CEO asks): set -a; . dev/.env.production; set +a; pnpm migrate:people --dry-run
import { SERVER, enc, login, mx, ok, userId } from './lib.ts';
import { EXTERNAL, LEVEL, externalKey, withLevel, workspaceLevels } from '../apps/web/src/matrix/levels.ts';

type StateEvent = { type: string; state_key: string; sender: string; content: Record<string, any> };

const dry = process.argv.includes('--dry-run');
const me = userId('sofia');
const token = await login('sofia');
const R = (roomId: string) => `/_matrix/client/v3/rooms/${enc(roomId)}`;
const stateOf = async (roomId: string) => (await ok(token, 'GET', `${R(roomId)}/state`)) as StateEvent[];
const find = (st: StateEvent[], type: string, key = '') => st.find((e) => e.type === type && e.state_key === key)?.content ?? {};
const creatorsOf = (st: StateEvent[]) => {
  const c = st.find((e) => e.type === 'm.room.create');
  return c && Number(c.content.room_version) >= 12 ? [c.sender, ...(c.content.additional_creators ?? [])] : [];
};
const membersOf = (st: StateEvent[], ...states: string[]) => st.filter((e) => e.type === 'm.room.member' && states.includes(e.content.membership)).map((e) => e.state_key);
const short = (id: string) => id.slice(1, id.indexOf(':'));
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
// Room version 12+: creators outrank every level; otherwise my level must reach the one for changing levels.
const mayEditLevels = (st: StateEvent[], pl: Record<string, any>) =>
  creatorsOf(st).includes(me) || (pl.users?.[me] ?? pl.users_default ?? 0) >= (pl.events?.['m.room.power_levels'] ?? pl.state_default ?? 50);

const tally = { writes: 0, done: 0, notAllowed: 0, unreached: 0 };
async function write(roomId: string, type: string, key: string, content: object): Promise<boolean> {
  tally.writes++;
  if (dry) return true;
  const r = await mx(token, 'PUT', `${R(roomId)}/state/${type}/${enc(key)}`, content);
  if (r.status < 300) return true;
  tally.writes--;
  tally.notAllowed++;
  console.log(`    refused: ${r.status} ${r.body?.errcode ?? ''}`);
  return false;
}
/** What changed in a power levels event, in words. */
function changes(before: Record<string, any>, after: Record<string, any>) {
  const out: string[] = [];
  const lifted = Object.entries(after.users ?? {}).filter(([id, l]) => l === LEVEL.staff && (before.users?.[id] ?? before.users_default ?? 0) < LEVEL.staff);
  const marked = Object.entries(after.users ?? {}).filter(([id, l]) => l === LEVEL.external && (before.users?.[id] ?? before.users_default ?? 0) < LEVEL.external);
  if (lifted.length) out.push(`Staff 10: ${lifted.map(([id]) => short(id)).join(', ')}`);
  if (marked.length) out.push(`External 1: ${marked.map(([id]) => short(id)).join(', ')}`);
  if (before.invite !== after.invite) out.push(`invite ${before.invite ?? 0} → ${after.invite}`);
  for (const [type, level] of Object.entries(after.events ?? {})) if (before.events?.[type] !== level) out.push(`${type} ${before.events?.[type] ?? '–'} → ${level}`);
  return out.join('; ');
}

const prefix = dry ? '[dry run] ' : '';
const alias = await mx(token, 'GET', `/_matrix/client/v3/directory/room/${enc(`#workspace:${SERVER}`)}`);
if (alias.status !== 200) throw new Error(`#workspace:${SERVER} not found`);
const workspace: string = alias.body.room_id;
const { joined_rooms: joined } = (await ok(token, 'GET', '/_matrix/client/v3/joined_rooms')) as { joined_rooms: string[] };
const mine = new Set(joined);
if (!mine.has(workspace)) throw new Error('sofia is not in the workspace');

// 1. The workspace space.
const wsState = await stateOf(workspace);
const wsName = find(wsState, 'm.room.name').name ?? 'workspace';
const wsCreators = creatorsOf(wsState);
const staff = membersOf(wsState, 'join').filter((id) => !wsCreators.includes(id));
const inWorkspace = new Set(membersOf(wsState, 'join', 'invite'));
console.log(`${prefix}Migrating ${wsName} on ${SERVER} as ${short(me)}.`);
const wsPl = find(wsState, 'm.room.power_levels');
const wsNext = workspaceLevels(wsPl, staff, 'space');
if (same(wsPl, wsNext)) {
  tally.done++;
  console.log(`  ${wsName} (workspace): already done`);
} else if (!mayEditLevels(wsState, wsPl)) {
  tally.notAllowed++;
  console.log(`  ${wsName} (workspace): not allowed to change levels`);
} else if (await write(workspace, 'm.room.power_levels', '', wsNext)) console.log(`  ${wsName} (workspace): ${changes(wsPl, wsNext)}`);

// Clients (level 0 in a client space I'm in, no External record) are left as they are: no mark, no record.
const recorded = new Set(wsState.filter((e) => e.type === EXTERNAL && Array.isArray(e.content.roles)).map((e) => `@${e.state_key}`));
const clients = new Set<string>();
for (const id of joined) {
  const kind = await mx(token, 'GET', `${R(id)}/state/work.pasodrum.space/`);
  if (kind.status !== 200 || kind.body?.kind !== 'client') continue;
  const st = await stateOf(id);
  const pl = find(st, 'm.room.power_levels');
  const creators = creatorsOf(st);
  for (const u of membersOf(st, 'join', 'invite'))
    if (!inWorkspace.has(u) && !recorded.has(u) && !creators.includes(u) && (pl.users?.[u] ?? pl.users_default ?? 0) < LEVEL.external) clients.add(u);
}

// 2. Each workspace channel I'm in. Everyone else in it from outside the workspace gets the External mark.
const names = new Map<string, string>();
for (const r of ((await mx(token, 'GET', `/_matrix/client/v1/rooms/${enc(workspace)}/hierarchy?max_depth=1&limit=100`)).body?.rooms ?? []) as { room_id: string; name?: string }[])
  if (r.name) names.set(r.room_id, r.name);
const children = wsState.filter((e) => e.type === 'm.space.child' && e.content.via?.length).map((e) => e.state_key);
const outsiders = new Map<string, string[]>();
const skipped = new Map<string, string[]>();
const unreached: string[] = [];
for (const id of children) {
  if (!mine.has(id)) {
    unreached.push(id);
    continue;
  }
  const st = await stateOf(id);
  if (find(st, 'm.room.create').type) continue;
  const label = `#${find(st, 'm.room.name').name ?? names.get(id) ?? id}`;
  const creators = creatorsOf(st);
  const outside = membersOf(st, 'join', 'invite').filter((u) => !inWorkspace.has(u) && !creators.includes(u) && !clients.has(u));
  for (const u of outside) outsiders.set(u, [...(outsiders.get(u) ?? []), id]);
  for (const u of membersOf(st, 'join', 'invite')) if (clients.has(u)) skipped.set(u, [...(skipped.get(u) ?? []), label]);
  const pl = find(st, 'm.room.power_levels');
  const next = withLevel(workspaceLevels(pl, staff.filter((u) => !creators.includes(u)), 'channel'), outside, LEVEL.external);
  if (same(pl, next)) {
    tally.done++;
    console.log(`  ${label}: already done`);
  } else if (!mayEditLevels(st, pl)) {
    tally.notAllowed++;
    console.log(`  ${label}: not allowed to change levels; fix by hand (invite stays ${pl.invite ?? 0} there)`);
  } else if (await write(id, 'm.room.power_levels', '', next)) console.log(`  ${label}: ${changes(pl, next)}`);
}
for (const id of unreached) {
  tally.unreached++;
  console.log(`  #${names.get(id) ?? id}: ${short(me)} isn't in it; fix by hand (invite stays 0 there)`);
}

for (const [u, labels] of skipped) console.log(`  ${short(u)}: skipped, a client (in ${labels.join(', ')}; no External mark, no record)`);

// 3. External records for the people marked in step 2.
for (const [u, channels] of outsiders) {
  const cur = await mx(token, 'GET', `${R(workspace)}/state/${EXTERNAL}/${enc(externalKey(u))}`);
  const content: Record<string, any> = cur.status === 200 && cur.body && typeof cur.body === 'object' ? cur.body : {};
  // Never shrink: roles stay, one-off channels only grow.
  const next = { ...content, roles: Array.isArray(content.roles) ? content.roles : [], channels: [...new Set([...(Array.isArray(content.channels) ? content.channels : []), ...channels])] };
  if (same(content, next)) {
    tally.done++;
    console.log(`  ${short(u)}: External record already done`);
  } else if (await write(workspace, EXTERNAL, externalKey(u), next)) console.log(`  ${short(u)}: External record, one-off channels ${next.channels.map((c) => `#${names.get(c) ?? c}`).join(', ')}`);
}

console.log(
  `${prefix}${tally.writes ? `${tally.writes} write${tally.writes === 1 ? '' : 's'}${dry ? ' would be made' : ''}` : '0 writes: already migrated'}; ` +
    `${tally.done} already done, ${tally.notAllowed} not allowed, ${tally.unreached} not reachable.`,
);
