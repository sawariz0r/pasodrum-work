// D-37 (build plan 0.1): lets everyone in a space keep its page tree: work.pasodrum.docs.page at 0 in every space's levels.
// Spaces made after DB-01 already have it (levels.ts). Runs as the owner account sofia, changes only spaces sofia may
// change, and is safe to run again. Dry run unless --apply.
// Local: node dev/migrate-docs.ts [--apply] · Production (only when the CEO asks): set -a; . dev/.env.production; set +a; node dev/migrate-docs.ts --apply
import { enc, login, ok, mx, userId } from './lib.ts';
import { PAGES } from '../apps/web/src/matrix/levels.ts';

type StateEvent = { type: string; state_key: string; sender: string; content: Record<string, any> };

const apply = process.argv.includes('--apply');
const me = userId('sofia');
const token = await login('sofia');
const { joined_rooms: rooms } = (await ok(token, 'GET', '/_matrix/client/v3/joined_rooms')) as { joined_rooms: string[] };
const tally = { updated: 0, already: 0, notAllowed: 0, skipped: 0 };

for (const roomId of rooms) {
  const state = (await ok(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state`)) as StateEvent[];
  const get = (type: string) => state.find((e) => e.type === type && e.state_key === '');
  const create = get('m.room.create');
  if (create?.content.type !== 'm.space') {
    tally.skipped++;
    continue;
  }
  const label = get('m.room.name')?.content.name ?? roomId;
  const levels = get('m.room.power_levels')?.content ?? {};
  if (levels.events?.[PAGES] === 0) {
    tally.already++;
    continue;
  }
  const creator = Number(create.content.room_version) >= 12 && (create.sender === me || (create.content.additional_creators ?? []).includes(me));
  const need = levels.events?.['m.room.power_levels'] ?? levels.state_default ?? 50;
  if (!creator && (levels.users?.[me] ?? levels.users_default ?? 0) < need) {
    console.log(`  ${label}: not allowed`);
    tally.notAllowed++;
    continue;
  }
  if (!apply) {
    console.log(`  ${label}: would open pages to everyone`);
    tally.updated++;
    continue;
  }
  const put = await mx(token, 'PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.power_levels/`, { ...levels, events: { ...(levels.events ?? {}), [PAGES]: 0 } });
  if (put.status >= 300) {
    console.log(`  ${label}: ${put.status} ${put.body?.errcode ?? ''}`);
    tally.notAllowed++;
    continue;
  }
  console.log(`  ${label}: pages open to everyone`);
  tally.updated++;
}

console.log(`Docs${apply ? '' : ' (dry run, --apply to write)'}: ${tally.updated} ${apply ? 'updated' : 'to update'}, ${tally.already} already done, ${tally.notAllowed} not allowed, ${tally.skipped} skipped.`);
