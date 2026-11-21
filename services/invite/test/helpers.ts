// Shared by the integration tests. INVITE_URL points them at another service (default: the stack's, behind Caddy);
// INVITE_DB at its database file when it runs outside the container.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BASE } from '../../../dev/lib.ts';

export const INVITE = (process.env.INVITE_URL ?? `${BASE}/api/invites`).replace(/\/+$/, '');
export const MAILPIT = 'http://localhost:8025';

export type Res = { status: number; body: any };
export async function api(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const res = await fetch(`${INVITE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export const freshEmail = (domain = 'example.com') => `t${randomBytes(4).toString('hex')}@${domain}`;
export const localpartOf = (userId: string) => userId.slice(1, userId.indexOf(':'));

const local = process.env.INVITE_DB ? new DatabaseSync(process.env.INVITE_DB) : null;
const run = (s: { get: (...p: string[]) => unknown; run: (...p: string[]) => unknown }, sql: string, params: string[]) =>
  /^select/i.test(sql) ? s.get(...params) ?? null : s.run(...params);

// Without INVITE_DB it runs inside the invite container, which has node:sqlite and the database.
export function db(sql: string, ...params: string[]): any {
  if (local) return JSON.parse(JSON.stringify(run(local.prepare(sql), sql, params), (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
  const script = `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/invites.db');
    const s=d.prepare(process.argv[1]);const p=JSON.parse(process.argv[2]);
    console.log(JSON.stringify(/^select/i.test(process.argv[1])?s.get(...p)??null:s.run(...p)));`;
  const out = execFileSync('docker', ['compose', '-f', 'dev/docker-compose.yml', '--env-file', 'dev/.env', 'exec', '-T', 'invite',
    'node', '-e', script, sql, JSON.stringify(params)], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  return JSON.parse(out.trim().split('\n').pop()!);
}

export async function mailTo(email: string): Promise<{ Subject: string; HTML: string; Text: string; From: { Address: string } }> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((x) => x.json()) as any;
    if (r.messages?.length) return fetch(`${MAILPIT}/api/v1/message/${r.messages[0].ID}`).then((x) => x.json()) as any;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`no mail to ${email}`);
}
