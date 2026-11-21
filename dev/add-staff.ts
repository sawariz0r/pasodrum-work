// Adds a team account to the workspace (no email needed): pnpm add:staff <username> "<Display name>" [admin|member]
// Production: set -a; . dev/.env.production; set +a; pnpm add:staff shiori "Shiori" admin
// The password is asked for and never echoed.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { SEED_FILE, SERVER, enc, envToken, login, mx, ok, userId } from './lib.ts';

const [localpart, name, role = 'member'] = process.argv.slice(2);
if (!localpart || !name || !['admin', 'member'].includes(role)) {
  console.error('Usage: pnpm add:staff <username> "<Display name>" [admin|member]');
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const rl = createInterface({ input: stdin });
    return new Promise((resolve) => rl.once('line', (a) => (rl.close(), process.stdout.write('\n'), resolve(a))));
  }
  return new Promise((resolve) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const password = await askHidden(`Password for ${localpart}: `);
if (password.length < 8) throw new Error('Use at least 8 characters.');

const regToken = envToken();
const first = await mx(null, 'POST', '/_matrix/client/v3/register', { username: localpart, password });
const reg = await mx(null, 'POST', '/_matrix/client/v3/register', {
  username: localpart,
  password,
  auth: { type: 'm.login.registration_token', token: regToken, session: first.body?.session },
});
if (reg.status >= 300) throw new Error(`register → ${reg.status} ${JSON.stringify(reg.body)}`);
const me: string = reg.body.access_token;
const id = userId(localpart);
await ok(me, 'PUT', `/_matrix/client/v3/profile/${enc(id)}/displayname`, { displayname: name });

const seeded = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { rooms: { workspace: string } };
const workspace = seeded.rooms.workspace;
const owner = await login('sofia');

const setLevel = async (roomId: string) => {
  const pl = await ok(owner, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.power_levels/`);
  await ok(owner, 'PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.power_levels/`, { ...pl, users: { ...pl.users, [id]: 50 } });
};

await ok(owner, 'POST', `/_matrix/client/v3/rooms/${enc(workspace)}/invite`, { user_id: id });
await ok(me, 'POST', `/_matrix/client/v3/join/${enc(workspace)}`, {});
if (role === 'admin') await setLevel(workspace);

// Join every channel of the workspace that's open to its members (restricted to the space).
const hierarchy = await ok(me, 'GET', `/_matrix/client/v1/rooms/${enc(workspace)}/hierarchy?max_depth=1`);
for (const room of hierarchy.rooms as { room_id: string; join_rule?: string; name?: string }[]) {
  if (room.room_id === workspace || room.join_rule !== 'restricted') continue;
  await ok(me, 'POST', `/_matrix/client/v3/join/${enc(room.room_id)}`, {});
  if (role === 'admin') await setLevel(room.room_id).catch(() => console.warn(`  couldn't set Admin in #${room.name}`));
  console.log(`  joined #${room.name}`);
}
console.log(`${name} (@${localpart}:${SERVER}) is in the workspace as ${role === 'admin' ? 'Admin' : 'Member'}. Sign in with "${localpart}".`);
