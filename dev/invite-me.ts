// Adds a real account to the seeded workspace and client space (as Owner/Admin sofia). Run: node dev/invite-me.ts <localpart>
import { readFileSync } from 'node:fs';
import { SEED_FILE, enc, mx, state, userId } from './lib.ts';

const who = process.argv[2];
if (!who) throw new Error('usage: node dev/invite-me.ts <localpart>');
const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
const sofia = seed.tokens.sofia;
const r = seed.rooms;
for (const key of ['workspace', 'general', 'design', 'lead', 'nordlys', 'projectUpdates', 'questions']) {
  const res = await mx(sofia, 'POST', `/_matrix/client/v3/rooms/${enc(r[key])}/invite`, { user_id: userId(who) });
  console.log(key, res.status === 200 ? 'invited' : `${res.status} ${res.body?.errcode ?? ''}`);
}
for (const key of ['workspace', 'nordlys']) {
  const pl = (await mx(sofia, 'GET', `/_matrix/client/v3/rooms/${enc(r[key])}/state/m.room.power_levels/`)).body;
  pl.users = { ...pl.users, [userId(who)]: 100 };
  await state(sofia, r[key], 'm.room.power_levels', '', pl);
}
console.log(`${userId(who)} is Owner of both spaces once they accept.`);
