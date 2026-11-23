// The Assistant's transport (SIDE-14, spec §2.3, §5.2): one socket per ask to /api/assistant/ask, and the status endpoint.
// The browser finds, the server reads: what the browser sends back is refs, never message text. The token goes in the
// first message, never the URL.
import { CLOSE, FIND_MS, LIMITS, WIRE_VERSION, type Answer, type AskError, type ClientMessage, type Ref, type ServerMessage, type Status } from './assistantWire';
import type { DocsBoardsSnapshot, PageNode } from './docsBoardsTypes';
import type { AssistantRequest, AssistantStatusLine, SearchHit, WorkspaceSnapshot, WorkspaceStore } from './types';

const abortError = () => new DOMException('Aborted', 'AbortError');
const REASONS = new Set<string>(['day-limit', 'month-limit', 'not-allowed', 'unavailable', 'failed'] satisfies AskError[]);
/** Local searches at a time when a find is limited to places. */
const FIND_ROOMS = 4;

/** Conversations whose messages never leave the browser before slice 4 (AST-14). */
export function encryptedRooms(s: WorkspaceSnapshot): Set<string> {
  const out = new Set<string>();
  for (const c of Object.values(s.channels).flat()) if (c.encrypted) out.add(c.id);
  for (const d of s.dms) if (d.encrypted) out.add(d.id);
  return out;
}

/** Search hits → refs: newest first, each message once, at most `limit`. No text, and nothing from an encrypted conversation. */
export function refsOfHits(hits: readonly SearchHit[], encrypted: (room: string) => boolean, limit: number = LIMITS.hits): Ref[] {
  const seen = new Set<string>();
  const out: Ref[] = [];
  for (const { message: m } of [...hits].sort((a, b) => b.message.ts - a.message.ts)) {
    if (out.length >= limit) break;
    if (encrypted(m.channelId) || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({ k: 'message', room: m.channelId, event: m.id });
  }
  return out;
}

/** The conversations a find is limited to; null = everywhere. Refs that are not chat (projects, pages, people) limit to nothing. */
export function roomsOf(within: readonly Ref[] | null, s: WorkspaceSnapshot): string[] | null {
  if (!within) return null;
  const rooms = new Set<string>();
  for (const r of within) {
    if (r.k === 'place' || r.k === 'thread' || r.k === 'message') rooms.add(r.room);
    else if (r.k === 'space') for (const c of s.channels[r.space] ?? []) rooms.add(c.id);
  }
  return [...rooms];
}

/** One bounded pass of the local search (spec §5.2) within FIND_MS; whatever was found by then, as refs. */
export async function findRefs(search: WorkspaceStore['search'], snapshot: WorkspaceSnapshot, query: string, within: readonly Ref[] | null, signal?: AbortSignal): Promise<Ref[]> {
  const encrypted = encryptedRooms(snapshot);
  const rooms = roomsOf(within, snapshot)?.filter((r) => !encrypted.has(r));
  if (rooms && !rooms.length) return [];
  const hits: SearchHit[] = [];
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(stop, FIND_MS);
  const onHits = (h: SearchHit[]) => void hits.push(...h);
  const one = (channelId?: string) => search(query, { ...(channelId ? { channelId } : {}), signal: ctl.signal, onHits }).catch(() => {});
  try {
    if (!rooms) await one();
    else {
      const queue = [...rooms];
      const worker = async () => {
        for (let id = queue.shift(); id && !ctl.signal.aborted; id = queue.shift()) await one(id);
      };
      await Promise.all(Array.from({ length: Math.min(FIND_ROOMS, queue.length) }, worker));
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
  if (signal?.aborted) throw abortError();
  return refsOfHits(hits, (room) => encrypted.has(room));
}

/** The person's joined channels, projects and pages for `list`; encrypted conversations left out. */
export function placesOf(s: WorkspaceSnapshot, db: DocsBoardsSnapshot): Ref[] {
  const out: Ref[] = [];
  for (const c of Object.values(s.channels).flat()) if (!c.encrypted) out.push({ k: 'place', room: c.id });
  for (const p of Object.values(db.projects).flat()) if (!p.loading) out.push({ k: 'project', project: p.id });
  const walk = (n: PageNode) => {
    if (!n.pending) out.push({ k: 'page', page: n.id });
    n.children.forEach(walk);
  };
  for (const sp of Object.values(db.pages)) sp.roots.forEach(walk);
  return out.slice(0, LIMITS.places);
}

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

function parse(text: unknown): ServerMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(String(text));
  } catch {
    return null;
  }
  if (!isObject(m)) return null;
  switch (m.t) {
    case 'status':
      return (m.stage === 'looking' || m.stage === 'closer') && Array.isArray(m.places) ? (m as ServerMessage) : null;
    case 'find':
      return typeof m.id === 'number' && typeof m.query === 'string' && (m.in === null || Array.isArray(m.in)) ? (m as ServerMessage) : null;
    case 'list':
      return typeof m.id === 'number' ? (m as ServerMessage) : null;
    case 'answer':
      return isObject(m.answer) && Array.isArray(m.answer.parts) && Array.isArray(m.answer.looked) ? (m as ServerMessage) : null;
    case 'error':
      return { t: 'error', reason: REASONS.has(String(m.reason)) ? (m.reason as AskError) : 'failed' };
    default:
      return null;
  }
}

function closeReason(code: number, opened: boolean): AskError {
  if (code === CLOSE.unauthorized || code === CLOSE.notAllowed) return 'not-allowed';
  if (code === CLOSE.tooMany || !opened) return 'unavailable';
  return 'failed';
}

export interface AskDeps {
  /** Origin serving /api/assistant (the app's own). */
  base: string;
  token: string;
  find(query: string, within: Ref[] | null, signal: AbortSignal): Promise<Ref[]>;
  places(): Ref[];
}

/** One ask (spec §2.3): auth, hello, answer find and list, resolve with the answer. Rejects Error(AskError); abort rejects AbortError. */
export function askAssistant(d: AskDeps, request: AssistantRequest, { signal, onStatus }: { signal: AbortSignal; onStatus?: (status: AssistantStatusLine) => void }): Promise<Answer> {
  return new Promise<Answer>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const sock = new WebSocket(`${d.base.replace(/^http/, 'ws')}/api/assistant/ask`);
    const finds = new AbortController();
    let opened = false;
    let settled = false;
    const send = (m: ClientMessage) => {
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(m));
    };
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      finds.abort();
      signal.removeEventListener('abort', onAbort);
      if (sock.readyState === WebSocket.CONNECTING || sock.readyState === WebSocket.OPEN) sock.close();
      done();
    };
    const onAbort = () => {
      send({ t: 'stop' });
      finish(() => reject(abortError()));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    sock.onopen = () => {
      opened = true;
      send({ t: 'auth', token: d.token, v: WIRE_VERSION });
      send({ t: 'hello', ...request });
    };
    sock.onmessage = (e) => {
      const m = parse(e.data);
      if (!m || settled) return;
      if (m.t === 'status') onStatus?.({ stage: m.stage, places: m.places });
      else if (m.t === 'find')
        d.find(m.query, m.in, finds.signal).then(
          (hits) => send({ t: 'found', id: m.id, hits }),
          () => send({ t: 'found', id: m.id, hits: [] }),
        );
      else if (m.t === 'list') send({ t: 'places', id: m.id, places: d.places() });
      else if (m.t === 'answer') finish(() => resolve(m.answer));
      else finish(() => reject(new Error(m.reason)));
    };
    sock.onclose = (e) => finish(() => reject(new Error(closeReason(e.code, opened))));
  });
}

/** GET /api/assistant/status; null when the server says not configured or not allowed, or fails. */
export async function assistantStatus(base: string, token: string): Promise<Status | null> {
  try {
    const res = await fetch(`${base}/api/assistant/status`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!isObject(data)) return null;
    const { ask, thorough } = data;
    if (ask !== 'ok' && ask !== 'day' && ask !== 'month') return null;
    if (thorough !== 'ok' && thorough !== 'low' && thorough !== 'day' && thorough !== 'month') return null;
    return { ask, thorough };
  } catch {
    return null;
  }
}
