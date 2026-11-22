// Adds a team account to the workspace (no email needed): pnpm add:staff <username> "<Display name>" [admin|staff]
// Production: set -a; . dev/.env.production; set +a; pnpm add:staff shiori "Shiori" admin
// The passwords (the new account's, then the Owner's) are asked for and never echoed. OWNER=<username> if not oscar.
import { SERVER, askHidden, enc, envToken, login, mx, ok, userId } from './lib.ts';

const [localpart, name, role = 'staff'] = process.argv.slice(2);
if (!localpart || !name || !['admin', 'staff'].includes(role)) {
  console.error('Usage: pnpm add:staff <username> "<Display name>" [admin|staff]');
  process.exit(1);
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

// The workspace is the room #workspace points at (D-06); an Owner or Admin of it adds the new account.
const workspace: string = (await ok(me, 'GET', `/_matrix/client/v3/directory/room/${enc(`#workspace:${SERVER}`)}`)).room_id;
const ownerName = process.env.OWNER ?? 'oscar';
const owner = await login(ownerName, await askHidden(`Password for ${ownerName} (adds them): `));

// D-36: Staff 10, Admin 50, in the workspace and each of its channels.
const level = role === 'admin' ? 50 : 10;
const setLevel = async (roomId: string) => {
  const pl = await ok(owner, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.power_levels/`);
  await ok(owner, 'PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.power_levels/`, { ...pl, users: { ...pl.users, [id]: level } });
};

await ok(owner, 'POST', `/_matrix/client/v3/rooms/${enc(workspace)}/invite`, { user_id: id });
await ok(me, 'POST', `/_matrix/client/v3/join/${enc(workspace)}`, {});
await setLevel(workspace);

// Join every channel of the workspace that's open to its members (restricted to the space).
const hierarchy = await ok(me, 'GET', `/_matrix/client/v1/rooms/${enc(workspace)}/hierarchy?max_depth=1`);
for (const room of hierarchy.rooms as { room_id: string; join_rule?: string; name?: string }[]) {
  if (room.room_id === workspace || room.join_rule !== 'restricted') continue;
  await ok(me, 'POST', `/_matrix/client/v3/join/${enc(room.room_id)}`, {});
  await setLevel(room.room_id).catch(() => console.warn(`  couldn't set ${role === 'admin' ? 'Admin' : 'Staff'} in #${room.name}`));
  console.log(`  joined #${room.name}`);
}
console.log(`${name} (@${localpart}:${SERVER}) is in the workspace as ${role === 'admin' ? 'Admin' : 'Staff'}. Sign in with "${localpart}".`);
