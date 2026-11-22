// Makes the invite service's system account @pasodrum a server admin, so it can lock removed people (SIDE-08).
// Run once per server, after the invite service logs "system sender … ready": pnpm add:system-admin [admin username]
// Production: set -a; . dev/.env.production; set +a; pnpm add:system-admin
// Asks for the server admin's password (default oscar) and never echoes it. Safe to re-run.
import { fileURLToPath } from 'node:url';
import { SERVER, askHidden, enc, login, mx, ok, send, sleep, userId } from './lib.ts';

const SYSTEM = userId('pasodrum');

/** Posts the admin command as a server admin and returns the admin bot's reply (null if none came in time). */
export async function makeSystemAdmin(token: string): Promise<string | null> {
  if ((await mx(null, 'GET', '/_matrix/client/v3/register/available?username=pasodrum')).status === 200) {
    throw new Error(`${SYSTEM} doesn't exist yet: start the invite service with SYSTEM_PASSWORD set, then run this again.`);
  }
  const me: string = (await ok(token, 'GET', '/_matrix/client/v3/account/whoami')).user_id;
  const room: string = (await ok(token, 'GET', `/_matrix/client/v3/directory/room/${enc(`#admins:${SERVER}`)}`)).room_id;
  const sent = await send(token, room, { msgtype: 'm.text', body: `!admin users make-user-admin ${SYSTEM}` });
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const page = await ok(token, 'GET', `/_matrix/client/v3/rooms/${enc(room)}/messages?dir=b&limit=10`);
    const chunk = page.chunk as { event_id: string; sender: string; type: string; content: { body?: string } }[];
    const newer = chunk.slice(0, chunk.findIndex((e) => e.event_id === sent));
    const reply = newer.find((e) => e.type === 'm.room.message' && e.sender !== me);
    if (reply) return reply.content.body ?? '';
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const admin = process.argv[2] ?? 'oscar';
  const token = await login(admin, await askHidden(`Password for ${admin} (server admin): `));
  try {
    const reply = await makeSystemAdmin(token);
    console.log(reply ?? `No reply from the admin bot yet; check #admins:${SERVER}.`);
  } finally {
    await mx(token, 'POST', '/_matrix/client/v3/logout', {});
  }
}
