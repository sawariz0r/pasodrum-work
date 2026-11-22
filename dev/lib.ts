import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

export const BASE = process.env.MATRIX_BASE ?? 'http://localhost:8008';
export const SERVER = process.env.MATRIX_SERVER ?? 'pasodrum.localhost';
export const LOCAL = BASE.startsWith('http://localhost');
export const SEED_FILE = new URL(`./data/seed-${SERVER}.json`, import.meta.url);
// Test accounts on a reachable server get a random password, kept in the gitignored seed file.
export const PASSWORD: string = LOCAL
  ? 'pasodrum-dev-password'
  : existsSync(SEED_FILE)
    ? JSON.parse(readFileSync(SEED_FILE, 'utf8')).password
    : randomBytes(18).toString('base64url');
export const MAILPIT = process.env.MAILPIT_URL ?? (LOCAL ? 'http://localhost:8025' : null);

export type Res = { status: number; body: any };

export async function mx(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: parsed };
}

export async function ok(token: string | null, method: string, path: string, body?: unknown): Promise<any> {
  const r = await mx(token, method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export const userId = (localpart: string) => `@${localpart}:${SERVER}`;
export const enc = encodeURIComponent;

let txn = 0;
export const txnId = () => `pd${Date.now()}${txn++}`;

export async function register(localpart: string, token: string): Promise<string> {
  const first = await mx(null, 'POST', '/_matrix/client/v3/register', { username: localpart, password: PASSWORD });
  const session = first.body?.session;
  const r = await mx(null, 'POST', '/_matrix/client/v3/register', {
    username: localpart,
    password: PASSWORD,
    auth: { type: 'm.login.registration_token', token, session },
  });
  if (r.status >= 300) throw new Error(`register ${localpart} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.access_token;
}

export async function login(localpart: string, password = PASSWORD): Promise<string> {
  const b = await ok(null, 'POST', '/_matrix/client/v3/login', {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: localpart },
    password,
  });
  return b.access_token;
}

export function envToken(): string {
  if (process.env.REGISTRATION_TOKEN) return process.env.REGISTRATION_TOKEN;
  const env = readFileSync(new URL('./.env', import.meta.url), 'utf8');
  const m = env.match(/^REGISTRATION_TOKEN=(.+)$/m);
  if (!m?.[1]) throw new Error('REGISTRATION_TOKEN missing in dev/.env');
  return m[1].trim();
}

export function bootstrapToken(): string | null {
  if (process.env.BOOTSTRAP_TOKEN) return process.env.BOOTSTRAP_TOKEN;
  if (!LOCAL) return null;
  const logs = execSync('docker compose -f dev/docker-compose.yml --env-file dev/.env logs continuwuity', { encoding: 'utf8' });
  const plain = logs.replace(/\x1b\[[0-9;]*m/g, '');
  const m = plain.match(/using the registration token (\S+)/);
  return m?.[1] ?? null;
}

export async function send(token: string, roomId: string, content: object, type = 'm.room.message'): Promise<string> {
  const b = await ok(token, 'PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/send/${type}/${txnId()}`, content);
  return b.event_id;
}

export async function state(token: string, roomId: string, type: string, key: string, content: object) {
  return ok(token, 'PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/state/${type}/${enc(key)}`, content);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Asks on the terminal without echoing (passwords, tokens). */
export function askHidden(question: string): Promise<string> {
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
