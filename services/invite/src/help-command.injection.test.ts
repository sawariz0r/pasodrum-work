// Spec for the help-message command injection. The product tests fail while a client-controlled
// display name is the first line of a message @pasodrum sends, and pass once that body is no
// longer an escaped Continuwuity admin command.
//
// Homeserver behavior is Continuwuity v26.9.4 (docs/DECISIONS.md; image tag is :latest),
// commit dda4bdc36768ac272bc7fecc08981f34d3990436:
//   src/service/rooms/timeline/build.rs:143-159   local sends call is_admin_command(..., true)
//   src/service/rooms/timeline/mod.rs:53-56       only the plain body is read
//   src/service/admin/mod.rs:542-615              \!admin outside #admins from a local admin
//   src/service/admin/mod.rs:84-89                an escaped command is not a restricted source
//   src/admin/processor.rs:171-250                first non-empty line; a leading \ is stripped
//   src/admin/admin.rs:71-108                     users, appservices, token, oidc, and query bail
//   src/admin/room/moderation.rs:49-160           ban-room does not bail
//   src/admin/room/commands.rs:9-19               rooms list does not bail
//   src/admin/server/commands.rs:30-134           reload-config, admin-notice, and restart do not bail
//   src/admin/debug/commands.rs:87-90             debug echo does not bail
//   src/core/config/mod.rs:2138-2145              admin_escape_commands defaults to true
//   src/core/config/mod.rs:2212-2217              admins_from_room defaults to true
//   src/service/users/profile.rs:210-211          a display name is stored as given
// deploy/docker-compose.yml and dev/continuwuity.toml never turn the escape flag off.
// @pasodrum is a server admin in the setup this service is built for (dev/system-admin.ts).
// The help DM is a new private room (help.ts roomFor), not #admins.
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type Config } from './app.ts';
import { newCode } from './ids.ts';
import type { Matrix } from './matrix.ts';
import { keyFrom, seal } from './secret.ts';
import { openStore, type ConfirmRequest, type Invite } from './store.ts';

const SERVER = 'pasodrum.work';
const SYSTEM = `@pasodrum:${SERVER}`;
const WORKSPACE = `!workspace:${SERVER}`;
const STAFF = `@staff:${SERVER}`;
const INVITE_KEY = keyFrom('placeholder-invite-secret-placeholder-placeholder');
const CONFIRM_KEY = keyFrom('placeholder-confirm-secret-placeholder-placeholder');

type Outcome = 'not-a-command' | 'refused-restricted' | 'executed';

/**
 * Continuwuity v26.9.4 decision for a plain body sent locally by a local server admin
 * in a room that is not #admins, with admin_escape_commands left at its default.
 */
export function escapedCommand(body: string): { outcome: Outcome; command: string | null } {
  const trimmed = body.trimStart();
  const escaped = trimmed.startsWith('\\') && trimmed.replace(/^\\+/, '').startsWith('!admin');
  if (!escaped) return { outcome: 'not-a-command', command: null };

  const commandLine = rustLines(body).find((line) => line.trim().length > 0);
  if (!commandLine) return { outcome: 'not-a-command', command: null };
  const argv = splitWhitespace(commandLine);
  if (argv.length > 0 && argv[0]!.endsWith('admin')) argv[0] = argv[0]!.replace(/^\\+/, '');
  const words = argv.slice(1);
  const command = words.join(' ');
  if (words.length === 0 || argv[0] !== '!admin') return { outcome: 'not-a-command', command: null };

  const group = words[0];
  if (group === 'users' || group === 'appservices' || group === 'token' || group === 'oidc' || group === 'query') {
    if (!knownRestricted(words)) return { outcome: 'not-a-command', command: null };
    return { outcome: 'refused-restricted', command };
  }
  if (runs(words)) return { outcome: 'executed', command };
  return { outcome: 'not-a-command', command: null };
}

function knownRestricted(words: string[]): boolean {
  return words[0] === 'users' && words[1] === 'make-user-admin' && words.length === 3 && /^@[^:]+:[^:]+$/.test(words[2]!);
}

function runs(words: string[]): boolean {
  const [group, sub, action, arg] = words;
  if (group === 'rooms' && sub === 'moderation' && action === 'ban-room' && words.length === 4 && /^[!#][^:]+:[^:]+$/.test(arg!)) {
    return true;
  }
  if (group === 'rooms' && sub === 'list' && words.length === 2) return true;
  if (group === 'server' && sub === 'restart' && (words.length === 2 || (words.length === 3 && (action === '--force' || action === '-f')))) {
    return true;
  }
  if (group === 'server' && sub === 'reload-config' && (words.length === 2 || words.length === 3)) return true;
  if (group === 'server' && sub === 'admin-notice' && words.length >= 3) return true;
  if (group === 'server' && sub === 'clear-caches' && words.length === 2) return true;
  if (group === 'debug' && sub === 'echo') return true;
  return false;
}

function rustLines(s: string): string[] {
  if (s === '') return [];
  const end = s.endsWith('\r\n') ? -2 : s.endsWith('\n') ? -1 : 0;
  const body = end === 0 ? s : s.slice(0, end);
  if (body === '') return [];
  return body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

function splitWhitespace(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

describe('Continuwuity v26.9.4 escaped commands', () => {
  it('runs ban-room, restart, and admin-notice when the first line is the command', () => {
    expect(escapedCommand('\\!admin rooms moderation ban-room #general:pasodrum.work\n needs your help').outcome).toBe('executed');
    expect(escapedCommand('\\!admin server restart\n needs your help').outcome).toBe('executed');
    expect(escapedCommand('\\!admin server admin-notice ping needs your help').outcome).toBe('executed');
    expect(escapedCommand('\\!admin server reload-config\n needs your help').outcome).toBe('executed');
  });

  it('refuses users make-user-admin from an escaped command before the handler', () => {
    expect(escapedCommand('\\!admin users make-user-admin @ada:pasodrum.work\n needs your help')).toEqual({
      outcome: 'refused-restricted',
      command: 'users make-user-admin @ada:pasodrum.work',
    });
  });

  it('does not treat a fixed first line, or a normal name, as a command', () => {
    expect(escapedCommand('Help request:\n\\!admin server restart').outcome).toBe('not-a-command');
    expect(escapedCommand('Mina needs your help').outcome).toBe('not-a-command');
    expect(escapedCommand('\\!admin rooms moderation ban-room #general:pasodrum.work needs your help').outcome).toBe('not-a-command');
  });
});

type Sent = { roomId: string; content: Record<string, unknown> };

function harness() {
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'help-injection-')), 'invite.sqlite'));
  const profiles = new Map<string, string>();
  const sessions = new Map<string, string>();
  const sent: Sent[] = [];
  const mx = {
    async login(localpart: string) {
      return `mx-${localpart}`;
    },
    async session(token: string) {
      const userId = sessions.get(token);
      return userId ? { userId, deviceId: 'DEVICE' } : null;
    },
    async resolveAlias() {
      return WORKSPACE;
    },
    async membership() {
      return null;
    },
    async roomState() {
      return null;
    },
    async displayName(_token: string, userId: string) {
      if (userId === SYSTEM) return 'Pasodrum';
      const name = profiles.get(userId);
      return name ? name : null;
    },
    async setDisplayName(_token: string, userId: string, name: string) {
      profiles.set(userId, name);
    },
    async isServerAdmin() {
      return true;
    },
    async availability() {
      return 'taken' as const;
    },
    async createRoom() {
      return `!help:${SERVER}`;
    },
    async send(_token: string, roomId: string, content: Record<string, unknown>) {
      sent.push({ roomId, content });
    },
    async deviceName() {
      return 'Phone';
    },
    async updateAccountData(_token: string, _userId: string, _type: string, update: (prev: Record<string, unknown>) => Record<string, unknown>) {
      update({});
    },
    async changePassword() {},
    async logout() {},
    async register() {
      return 'unused';
    },
    async invite() {},
    async whoami() {
      return null;
    },
    async setProfileField() {},
    async lock() {
      return false;
    },
  } as Matrix;
  const cfg: Config = {
    serverName: SERVER,
    publicUrl: `https://${SERVER}`,
    registrationToken: 'registration-token-placeholder',
    workspaceAlias: `#workspace:${SERVER}`,
    translate: null,
    translateDailyLimit: 2000,
  };
  const handler = createApp({
    cfg,
    store,
    mx,
    sendMail: async () => {},
    key: INVITE_KEY,
    confirmKey: CONFIRM_KEY,
    systemPassword: 'system-password-placeholder',
  });
  return { store, profiles, sessions, sent, server: createServer(handler) };
}

let live: Server | undefined;

afterEach(async () => {
  const server = live;
  live = undefined;
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function listen(server: Server): Promise<number> {
  live = server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return address.port;
}

async function post(port: number, path: string, body: unknown, token?: string): Promise<{ status: number; json: { sent?: boolean; error?: string } }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) as { sent?: boolean; error?: string } : {} };
}

function claimedInvite(userId: string): Invite {
  const now = Date.now();
  return {
    code: newCode(),
    email: 'ada@example.com',
    name: null,
    role: 'client',
    userId,
    spaceId: `!client:${SERVER}`,
    spaceName: 'Example',
    spaceKind: 'client',
    inviterId: STAFF,
    inviterName: 'Staff',
    team: [{ id: STAFF, name: 'Staff' }],
    rooms: [`!client:${SERVER}`],
    locale: 'en',
    secret: null,
    createdTs: now,
    expiresTs: now + 86_400_000,
    claimedTs: now,
    revokedTs: null,
  };
}

function openInvite(userId: string): Invite {
  return {
    ...claimedInvite(userId),
    code: newCode(),
    secret: seal(INVITE_KEY, 'temp-password-placeholder'),
    claimedTs: null,
  };
}

function confirmRow(userId: string, code: string): ConfirmRequest {
  const now = Date.now();
  return {
    code,
    userId,
    deviceId: 'DEVICE',
    deviceName: 'Phone',
    email: 'ada@example.com',
    locale: 'en',
    tz: null,
    contacts: [{ id: STAFF, name: 'Staff' }],
    spaceId: `!client:${SERVER}`,
    spaceName: 'Example',
    createdTs: now,
    expiresTs: now + 86_400_000,
    confirmedTs: null,
    releasedTs: null,
    replacedTs: null,
    session: 'session-placeholder',
  };
}

function postedBody(sent: Sent[]): string {
  expect(sent).toHaveLength(1);
  const content = sent[0]!.content;
  expect(content.msgtype).toBe('m.text');
  expect(typeof content.body).toBe('string');
  return content.body as string;
}

function expectNotACommand(body: string) {
  expect(escapedCommand(body), body).toEqual({ outcome: 'not-a-command', command: null });
}

describe('help messages posted as @pasodrum', () => {
  it('does not post a profile display name that bans a room', async () => {
    const h = harness();
    const userId = `@ban:${SERVER}`;
    const token = 'client-ban';
    h.sessions.set(token, userId);
    h.profiles.set(userId, '\\!admin rooms moderation ban-room #general:pasodrum.work\n');
    h.store.insert(claimedInvite(userId));
    const port = await listen(h.server);
    const res = await post(port, '/api/invites/confirm/help', { reason: 'stuck' }, token);
    expect(res.status).toBe(200);
    expect(res.json.sent).toBe(true);
    expectNotACommand(postedBody(h.sent));
  });

  it('does not post a profile display name that restarts the server', async () => {
    const h = harness();
    const userId = `@restart:${SERVER}`;
    const token = 'client-restart';
    h.sessions.set(token, userId);
    h.profiles.set(userId, '\\!admin server restart\n');
    h.store.insert(claimedInvite(userId));
    const port = await listen(h.server);
    const res = await post(port, '/api/invites/confirm/help', { reason: 'stuck' }, token);
    expect(res.status).toBe(200);
    expectNotACommand(postedBody(h.sent));
  });

  it('does not post a profile display name that reloads server config', async () => {
    const h = harness();
    const userId = `@reload:${SERVER}`;
    const token = 'client-reload';
    h.sessions.set(token, userId);
    h.profiles.set(userId, '\\!admin server reload-config\n');
    h.store.insert(claimedInvite(userId));
    const port = await listen(h.server);
    const res = await post(port, '/api/invites/confirm/help', { reason: 'email-missing' }, token);
    expect(res.status).toBe(200);
    expectNotACommand(postedBody(h.sent));
  });

  it('does not post a one-line display name that still runs admin-notice', async () => {
    const h = harness();
    const userId = `@notice:${SERVER}`;
    const token = 'client-notice';
    h.sessions.set(token, userId);
    h.profiles.set(userId, '\\!admin server admin-notice ping');
    h.store.insert(claimedInvite(userId));
    const port = await listen(h.server);
    const res = await post(port, '/api/invites/confirm/help', { reason: 'stuck' }, token);
    expect(res.status).toBe(200);
    expectNotACommand(postedBody(h.sent));
  });

  it('does not post a one-line display name that echoes through the admin parser', async () => {
    const h = harness();
    const userId = `@echo:${SERVER}`;
    const token = 'client-echo';
    h.sessions.set(token, userId);
    h.profiles.set(userId, '\\!admin debug echo owned');
    h.store.insert(claimedInvite(userId));
    const port = await listen(h.server);
    const res = await post(port, '/api/invites/confirm/help', { reason: 'link-broken' }, token);
    expect(res.status).toBe(200);
    expectNotACommand(postedBody(h.sent));
  });

  it('does not post a make-user-admin display name as an escaped command', async () => {
    const h = harness();
    const userId = `@grant:${SERVER}`;
    const token = 'client-grant';
    h.sessions.set(token, userId);
    h.profiles.set(userId, '\\!admin users make-user-admin @grant:pasodrum.work\n');
    h.store.insert(claimedInvite(userId));
    const port = await listen(h.server);
    const res = await post(port, '/api/invites/confirm/help', { reason: 'stuck' }, token);
    expect(res.status).toBe(200);
    expectNotACommand(postedBody(h.sent));
  });

  it('does not post the same command from the confirm-link help route', async () => {
    const h = harness();
    const userId = `@link:${SERVER}`;
    const code = newCode();
    h.profiles.set(userId, '\\!admin rooms moderation ban-room #general:pasodrum.work\n');
    h.store.startConfirm(confirmRow(userId, code));
    const port = await listen(h.server);
    const res = await post(port, `/api/invites/confirm/${code}/help`, {});
    expect(res.status).toBe(200);
    expect(res.json.sent).toBe(true);
    expectNotACommand(postedBody(h.sent));
  });

  it('keeps an interior newline from claim and then posts that command', async () => {
    const h = harness();
    const userId = `@ada_example.com:${SERVER}`;
    const token = 'client-claim';
    h.sessions.set(token, userId);
    const invite = openInvite(userId);
    h.store.insert(invite);
    const name = '\\!admin server restart\nx';
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.trim()).toBe(name);
    const port = await listen(h.server);
    const claimed = await post(port, `/api/invites/${invite.code}/claim`, { name, password: 'placeholder-password' });
    expect(claimed.status).toBe(200);
    expect(h.profiles.get(userId)).toBe(name);
    const res = await post(port, '/api/invites/confirm/help', { reason: 'stuck' }, token);
    expect(res.status).toBe(200);
    expectNotACommand(postedBody(h.sent));
  });

  it('posts an ordinary name as text the homeserver does not run', async () => {
    const h = harness();
    const userId = `@mina:${SERVER}`;
    const token = 'client-mina';
    h.sessions.set(token, userId);
    h.profiles.set(userId, 'Mina');
    h.store.insert(claimedInvite(userId));
    const port = await listen(h.server);
    const res = await post(port, '/api/invites/confirm/help', { reason: 'stuck' }, token);
    expect(res.status).toBe(200);
    const body = postedBody(h.sent);
    expect(body.startsWith('Mina needs your help')).toBe(true);
    expectNotACommand(body);
  });
});
