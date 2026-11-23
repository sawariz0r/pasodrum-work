// D-53: marks a client space as covered by the terms, or ask first, for the Assistant: pnpm assistant:cover <space> terms|ask [--dry-run]
// <space> is the client space's id or its exact name. Written with your own sign-in (an Owner or Admin of the workspace);
// the homeserver refuses anyone else. Production: never without the CEO's yes, and dry-run first.
// set -a; . dev/.env.production; set +a; OWNER=oscar pnpm assistant:cover "Test Client" ask --dry-run
import { LOCAL, PASSWORD, SERVER, askHidden, enc, login, mx, ok, userId } from './lib.ts';

const MARK = 'work.pasodrum.ai';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [space, cover] = args.filter((a) => a !== '--dry-run');
if (!space || (cover !== 'terms' && cover !== 'ask')) {
  console.error('Usage: pnpm assistant:cover <space id or name> terms|ask [--dry-run]');
  process.exit(1);
}

const me = process.env.OWNER ?? (LOCAL ? 'sofia' : 'oscar');
const token = await login(me, LOCAL ? PASSWORD : await askHidden(`Password for ${me}: `));
const workspace: string = (await ok(token, 'GET', `/_matrix/client/v3/directory/room/${enc(`#workspace:${SERVER}`)}`)).room_id;
const stateOf = (room: string, type: string, key = '') => mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(room)}/state/${type}/${enc(key)}`);

async function findSpace(): Promise<{ id: string; name: string }> {
  const joined: string[] = (await ok(token, 'GET', '/_matrix/client/v3/joined_rooms')).joined_rooms;
  const ids = space!.startsWith('!') ? joined.filter((id) => id === space) : joined;
  const found: { id: string; name: string }[] = [];
  for (const id of ids) {
    if (id === workspace || (await stateOf(id, 'work.pasodrum.space')).body?.kind !== 'client') continue;
    const name = String((await stateOf(id, 'm.room.name')).body?.name ?? '');
    if (id === space || name === space) found.push({ id, name });
  }
  if (found.length !== 1) throw new Error(found.length ? `${found.length} client spaces are called "${space}"; use its id.` : `You are in no client space "${space}".`);
  return found[0]!;
}

const target = await findSpace();
const before = await stateOf(workspace, MARK, target.id);
const now = before.status === 200 && before.body?.cover ? before.body.cover : 'no mark';
console.log(`${target.name} (${target.id}): ${now} → ${cover}, written to the workspace (${workspace}) as ${userId(me)}.`);
if (dryRun) {
  console.log(`Dry run: would write ${MARK} / ${target.id} = ${JSON.stringify({ cover })}. Nothing written.`);
  process.exit(0);
}
const put = await mx(token, 'PUT', `/_matrix/client/v3/rooms/${enc(workspace)}/state/${MARK}/${enc(target.id)}`, { cover });
if (put.status === 403) throw new Error('Refused: only Owners and Admins of the workspace can write the mark.');
if (put.status >= 300) throw new Error(`Not written (${put.status}).`);
console.log('Written. It applies from the next ask.');
