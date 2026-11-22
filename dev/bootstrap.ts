// A fresh server's first account and the empty workspace "Pasodrum" with #general; the first account is its Owner
// (room version 12 creator) and the server admin. Nothing else: add people from the app or with pnpm add:staff.
// Production after a wipe: set -a; . dev/.env.production; set +a; pnpm bootstrap <username> "<Display name>"
// Asks for the one-time token the server logs on its first start ("using the registration token …") and the new password.
import { SERVER, askHidden, enc, mx, ok, userId } from './lib.ts';
import { powerLevels } from '../apps/web/src/matrix/levels.ts';

const [localpart, name] = process.argv.slice(2);
if (!localpart || !name) {
  console.error('Usage: pnpm bootstrap <username> "<Display name>"');
  process.exit(1);
}
const aliasPath = `/_matrix/client/v3/directory/room/${enc(`#workspace:${SERVER}`)}`;

const token = await askHidden('One-time registration token from the server log: ');
const password = await askHidden(`New password for ${localpart}: `);
if (password.length < 8) throw new Error('Use at least 8 characters.');
if ((await askHidden('Again: ')) !== password) throw new Error("The passwords don't match.");

const first = await mx(null, 'POST', '/_matrix/client/v3/register', { username: localpart, password });
const reg = await mx(null, 'POST', '/_matrix/client/v3/register', {
  username: localpart,
  password,
  initial_device_display_name: 'bootstrap',
  auth: { type: 'm.login.registration_token', token, session: first.body?.session },
});
if (reg.status >= 300) throw new Error(`register → ${reg.status} ${JSON.stringify(reg.body)}`);
const me: string = reg.body.access_token;
await ok(me, 'PUT', `/_matrix/client/v3/profile/${enc(userId(localpart))}/displayname`, { displayname: name });

if ((await mx(me, 'GET', aliasPath)).status === 200) {
  console.log(`#workspace:${SERVER} already exists; only the account was made.`);
} else {
  const via = { via: [SERVER] };
  const { room_id: workspace } = await ok(me, 'POST', '/_matrix/client/v3/createRoom', {
    name: 'Pasodrum',
    preset: 'private_chat',
    creation_content: { type: 'm.space' },
    power_level_content_override: powerLevels('workspace', 'space', {}),
  });
  await ok(me, 'PUT', aliasPath, { room_id: workspace });
  const { room_id: general } = await ok(me, 'POST', '/_matrix/client/v3/createRoom', {
    name: 'general',
    preset: 'private_chat',
    power_level_content_override: powerLevels('workspace', 'channel', {}),
    initial_state: [
      { type: 'm.space.parent', state_key: workspace, content: { ...via, canonical: true } },
      { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'shared' } },
      { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: workspace }] } },
    ],
  });
  await ok(me, 'PUT', `/_matrix/client/v3/rooms/${enc(workspace)}/state/m.space.child/${enc(general)}`, { ...via, suggested: true });
  console.log(`Workspace "Pasodrum" ${workspace} with #general ${general}.`);
}
await mx(me, 'POST', '/_matrix/client/v3/logout', {});
console.log(`${name} (@${localpart}:${SERVER}) is the server admin. Sign in with "${localpart}" in the app.`);
