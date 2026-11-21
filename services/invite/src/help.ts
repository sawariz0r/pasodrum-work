// D-38: the system sender "Pasodrum" (the service makes sure it exists at startup) tells a client's contact that they need help.
import { MatrixError, type Matrix } from './matrix.ts';
import type { Store } from './store.ts';

export const SYSTEM_LOCALPART = 'pasodrum';
const DEVICE_ID = 'PASODRUM';

export type HelpReason = 'email-missing' | 'stuck' | 'link-broken';
export const HELP_REASONS: readonly HelpReason[] = ['email-missing', 'stuck', 'link-broken'];

const REASON: Record<HelpReason, string> = {
  'email-missing': 'The email to confirm their new device didn’t arrive.',
  stuck: 'They’re stuck confirming a new device.',
  'link-broken': 'The confirm link didn’t work for them.',
};

export type Help = {
  userId: string;
  name: string;
  email: string;
  reason: HelpReason;
  spaceId: string | null;
  spaceName: string | null;
  /** "07:12" on their clock, with the zone it came from. */
  localTime: string | null;
  tz: string | null;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Full plain body for every client (D-05); our fields ride along. Never a code, key or link.
export function helpMessage(h: Help): Record<string, unknown> {
  const lines = [
    `${h.name} needs your help`,
    REASON[h.reason],
    [h.spaceName, h.email, h.localTime && `their time ${h.localTime}`].filter(Boolean).join(' · '),
  ];
  return {
    msgtype: 'm.text',
    body: lines.join('\n'),
    format: 'org.matrix.custom.html',
    formatted_body: lines.map(esc).join('<br>'),
    'work.pasodrum.help': {
      user_id: h.userId,
      name: h.name,
      ...(h.spaceId ? { space_id: h.spaceId } : {}),
      ...(h.spaceName ? { space_name: h.spaceName } : {}),
      reason: h.reason,
      email: h.email,
      ...(h.localTime ? { local_time: h.localTime } : {}),
      ...(h.tz ? { tz: h.tz } : {}),
    },
  };
}

export function systemAccount(mx: Matrix, store: Store, serverName: string, password: string | undefined, registrationToken: string) {
  const id = `@${SYSTEM_LOCALPART}:${serverName}`;
  let token: string | null = null;

  // Log in, or register with the token we already hold if the account doesn't exist yet; safe to repeat.
  // On a fresh server registration waits for the first (admin) account, so this one never becomes the admin.
  async function ensure(pw: string): Promise<string> {
    let t: string;
    try {
      t = await mx.login(SYSTEM_LOCALPART, pw, DEVICE_ID);
    } catch (e) {
      if (!(e instanceof MatrixError) || (await mx.availability(SYSTEM_LOCALPART)) !== 'available') throw e;
      await mx.register(SYSTEM_LOCALPART, pw, registrationToken);
      t = await mx.login(SYSTEM_LOCALPART, pw, DEVICE_ID);
    }
    if ((await mx.displayName(t, id)) !== 'Pasodrum') await mx.setDisplayName(t, id, 'Pasodrum');
    return t;
  }

  if (password) {
    let wait = 2_000;
    const attempt = () =>
      ensure(password).then(
        (t) => {
          token = t;
          console.log(`system sender ${id} ready`);
        },
        (e: unknown) => {
          console.error(`system sender not ready (retry in ${wait / 1000}s): ${(e as Error).message}`);
          setTimeout(attempt, wait).unref();
          wait = Math.min(wait * 2, 300_000);
        },
      );
    void attempt();
  }

  async function signedIn<T>(fn: (token: string) => Promise<T>): Promise<T> {
    if (!password) throw new Error('SYSTEM_PASSWORD is not set');
    token ??= await ensure(password);
    try {
      return await fn(token);
    } catch (e) {
      if (!(e instanceof MatrixError && e.status === 401)) throw e;
      token = await mx.login(SYSTEM_LOCALPART, password, DEVICE_ID);
      return fn(token);
    }
  }

  // One read-only, unencrypted DM per contact: only the system account may post, invite or change anything.
  async function roomFor(t: string, contactId: string): Promise<string> {
    const known = store.helpRoom(contactId);
    if (known && (await mx.membership(t, known, id)) === 'join') {
      const theirs = await mx.membership(t, known, contactId);
      if (theirs === 'join' || theirs === 'invite') return known;
      if (theirs === 'leave') {
        await mx.invite(t, known, contactId);
        return known;
      }
    }
    const roomId = await mx.createRoom(t, {
      preset: 'private_chat',
      is_direct: true,
      invite: [contactId],
      power_level_content_override: { events_default: 100, state_default: 100, invite: 100, kick: 100, ban: 100, redact: 100 },
    });
    store.setHelpRoom(contactId, roomId);
    return roomId;
  }

  return {
    id,
    nameOf: (userId: string) => signedIn((t) => mx.displayName(t, userId)),
    send: (contactId: string, content: Record<string, unknown>) =>
      signedIn(async (t) => mx.send(t, await roomFor(t, contactId), content)),
  };
}

export type SystemAccount = ReturnType<typeof systemAccount>;
