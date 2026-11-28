// Shared by *.integration.ts (pnpm test:matrix) against the seeded local server.
import { Window } from 'happy-dom';
import { afterAll, beforeAll, expect } from 'vitest';
import { createWorkspaceStore, signIn, type WorkspaceSnapshot, type WorkspaceStore } from './index';

export const BASE = process.env.MATRIX_BASE ?? 'http://localhost:8008';
export const PASSWORD = 'pasodrum-dev-password';
export const stores: WorkspaceStore[] = [];
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** What the emailed join link for `code` carries after "#" (Staff and Externals claim only with it, D-57). */
export async function joinProof(email: string, code: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json())) as { messages?: { ID: string }[] };
    for (const m of list.messages ?? []) {
      const full = (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then((r) => r.json())) as { Text?: string };
      const hit = full.Text?.match(new RegExp(`/join/${code}#([A-Za-z0-9_-]+)`));
      if (hit) return hit[1]!;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no join link for ${code} in mail to ${email}`);
}

/** Browser globals the store relies on, then sign every store out at the end. */
export function setupIntegration() {
  beforeAll(() => {
    const data = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as Storage;
    globalThis.DOMParser = new Window().DOMParser as unknown as typeof DOMParser;
  });
  afterAll(() => Promise.all(stores.map((s) => s.signOut())));
}

export function until<T>(store: WorkspaceStore, pick: (s: WorkspaceSnapshot) => T | undefined | false, ms = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const v = pick(store.getSnapshot());
      if (v === undefined || v === false) return false;
      unsubscribe();
      clearTimeout(timer);
      resolve(v);
      return true;
    };
    const unsubscribe = store.subscribe(check);
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out; snapshot: ${JSON.stringify(store.getSnapshot()).slice(0, 2000)}`));
    }, ms);
    check();
  });
}

export async function open(identifier: string) {
  const session = await signIn(BASE, identifier, PASSWORD);
  const store = createWorkspaceStore(session);
  stores.push(store);
  expect(store.getSnapshot().connection).toBe('starting');
  await until(store, (s) => s.connection === 'online' && s.spaces.length > 0);
  return { session, store };
}

export const channel = (s: WorkspaceSnapshot, space: string, name: string) => {
  const spaceId = s.spaces.find((x) => x.name === space)?.id;
  return spaceId ? s.channels[spaceId]?.find((c) => c.name === name) : undefined;
};
export const names = (s: WorkspaceSnapshot, space: string) => s.channels[s.spaces.find((x) => x.name === space)?.id ?? '']?.map((c) => c.name);

export async function mx(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

let txn = 0;
/** Sends a raw event as another client would. */
export async function sendRaw(token: string, roomId: string, content: Record<string, unknown>, type = 'm.room.message') {
  const { body } = await mx(token, 'PUT', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/${type}/raw${Date.now()}-${txn++}`, content);
  return body.event_id as string;
}
