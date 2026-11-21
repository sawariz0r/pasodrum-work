// Dev helper: creates the system sender "Pasodrum" (D-38). The invite service does this itself at startup. Safe to re-run.
// Local: set -a; . dev/.env; set +a; pnpm add:system
import { SERVER, enc, envToken, mx, ok, userId } from './lib.ts';

const LOCALPART = 'pasodrum';
const password = process.env.SYSTEM_PASSWORD;
if (!password) {
  console.error('SYSTEM_PASSWORD is not set (set -a; . dev/.env; set +a).');
  process.exit(1);
}

const available = await mx(null, 'GET', `/_matrix/client/v3/register/available?username=${LOCALPART}`);
let token: string;
if (available.body?.errcode === 'M_USER_IN_USE') {
  token = (await ok(null, 'POST', '/_matrix/client/v3/login', {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: LOCALPART },
    password,
  })).access_token;
} else {
  const first = await mx(null, 'POST', '/_matrix/client/v3/register', { username: LOCALPART, password });
  token = (await ok(null, 'POST', '/_matrix/client/v3/register', {
    username: LOCALPART,
    password,
    auth: { type: 'm.login.registration_token', token: envToken(), session: first.body?.session },
  })).access_token;
}
const id = userId(LOCALPART);
await ok(token, 'PUT', `/_matrix/client/v3/profile/${enc(id)}/displayname`, { displayname: 'Pasodrum' });
await mx(token, 'POST', '/_matrix/client/v3/logout', {});
console.log(`Pasodrum (@${LOCALPART}:${SERVER}) is ready.`);
