// Seeds a fresh server with the workspace from the design canvas.
// Local: pnpm dev:seed. Other server: MATRIX_BASE=https://… MATRIX_SERVER=… REGISTRATION_TOKEN=… BOOTSTRAP_TOKEN=… pnpm dev:seed
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { PASSWORD, SEED_FILE, SERVER, bootstrapToken, envToken, login, ok, register, send, state, userId } from './lib.ts';
import { channelUsers, powerLevels, type SpaceKind } from '../apps/web/src/matrix/levels.ts';

if (existsSync(SEED_FILE)) {
  console.log(`Already seeded (${SEED_FILE.pathname}). For a clean local server run pnpm dev:server:reset.`);
  process.exit(0);
}

const people = {
  sofia: { name: 'Sofia Olsen' },            // first account → server admin, workspace Owner
  ingrid: { name: 'Ingrid Holm' },           // workspace Admin, assigned to Nordlys
  jonas: { name: 'Jonas Berg' },             // Member
  tanaka: { name: '田中 由紀' },               // Member with a Japanese name
  'henrik_nordlys.no': { name: 'Henrik Dahl' }, // Client (henrik@nordlys.no → deterministic ID, D-07)
  'lea_freelance.dev': { name: 'Lea Fischer' }, // Guest
} as const;
type Who = keyof typeof people;

const tokens = {} as Record<Who, string>;
const boot = bootstrapToken();
const regToken = envToken();

for (const who of Object.keys(people) as Who[]) {
  try {
    tokens[who] = await register(who, who === 'sofia' && boot ? boot : regToken);
  } catch (e) {
    if (String(e).includes('M_USER_IN_USE')) tokens[who] = await login(who);
    else throw e;
  }
  await ok(tokens[who], 'PUT', `/_matrix/client/v3/profile/${encodeURIComponent(userId(who))}/displayname`, { displayname: people[who].name });
}
const t = tokens;
const via = { via: [SERVER] };

// D-27 levels; Sofia creates everything, so (room version 12) she outranks everyone and isn't listed.
const spaceUsers = { [userId('ingrid')]: 50 };
const kinds = new Map<string, SpaceKind>();

async function space(name: string, kind: SpaceKind, extraState: object[] = []): Promise<string> {
  const b = await ok(t.sofia, 'POST', '/_matrix/client/v3/createRoom', {
    name,
    preset: 'private_chat',
    creation_content: { type: 'm.space' },
    power_level_content_override: powerLevels(kind, 'space', spaceUsers),
    initial_state: extraState,
  });
  kinds.set(b.room_id, kind);
  return b.room_id;
}

async function channel(parent: string, name: string, opts: { restricted?: boolean; encrypted?: boolean; topic?: string } = {}): Promise<string> {
  const initial_state: object[] = [
    { type: 'm.space.parent', state_key: parent, content: { ...via, canonical: true } },
    { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'shared' } },
  ];
  if (opts.restricted) initial_state.push({ type: 'm.room.join_rules', state_key: '', content: { join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: parent }] } });
  if (opts.encrypted) initial_state.push({ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } });
  const b = await ok(t.sofia, 'POST', '/_matrix/client/v3/createRoom', {
    name,
    topic: opts.topic,
    preset: 'private_chat',
    power_level_content_override: powerLevels(kinds.get(parent)!, 'channel', channelUsers(spaceUsers, [userId('sofia')], userId('sofia'))),
    initial_state,
  });
  await state(t.sofia, parent, 'm.space.child', b.room_id, { ...via, suggested: true });
  return b.room_id;
}

async function addTo(roomId: string, who: Who[]) {
  for (const w of who) {
    await ok(t.sofia, 'POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, { user_id: userId(w) });
    await ok(t[w], 'POST', `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {});
  }
}
const joinRestricted = (roomId: string, who: Who[]) =>
  Promise.all(who.map((w) => ok(t[w], 'POST', `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {})));

// Workspace "Pasodrum"
const workspace = await space('Pasodrum', 'workspace');
await addTo(workspace, ['ingrid', 'jonas', 'tanaka']);
const general = await channel(workspace, 'general', { restricted: true });
const design = await channel(workspace, 'design', { restricted: true });
const lead = await channel(workspace, 'lead', { encrypted: true });
await joinRestricted(general, ['ingrid', 'jonas', 'tanaka']);
await joinRestricted(design, ['ingrid', 'jonas', 'tanaka']);
await addTo(lead, ['ingrid']);
await addTo(design, ['lea_freelance.dev']); // guest: invited to one channel, not in the workspace

// Client space "Nordlys"
const nordlys = await space('Nordlys', 'client', [{ type: 'work.pasodrum.space', state_key: '', content: { kind: 'client' } }]);
await addTo(nordlys, ['ingrid', 'henrik_nordlys.no']);
const projectUpdates = await channel(nordlys, 'project-updates', { restricted: true });
const questions = await channel(nordlys, 'questions', { restricted: true });
await joinRestricted(projectUpdates, ['ingrid', 'henrik_nordlys.no']);
await joinRestricted(questions, ['ingrid', 'henrik_nordlys.no']);

await send(t.jonas, general, { msgtype: 'm.text', body: 'Nordlys review moved to Thursday 14:00.' });
await send(t.tanaka, general, { msgtype: 'm.text', body: 'これはテストです。木曜日のレビューに参加します。' });
await send(t.ingrid, projectUpdates, { msgtype: 'm.text', body: 'Welcome to your project space, Henrik.' });

mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
writeFileSync(SEED_FILE, JSON.stringify({ password: PASSWORD, tokens, rooms: { workspace, general, design, lead, nordlys, projectUpdates, questions } }, null, 2));
console.log(`Seeded ${SERVER}: ${Object.keys(people).join(', ')}. Password in ${SEED_FILE.pathname}`);
