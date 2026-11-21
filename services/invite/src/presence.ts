// Presence relay (D-37): carets and board hints between the open tabs of one room. A streamed GET carries the room's
// lines down, a POST sends mine up. In memory only; nothing is stored, and nothing logged but the route and status.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Matrix } from './matrix.ts';

const HEARTBEAT_MS = 20_000;
const RECHECK_MS = 5 * 60_000;
const MAX_BODY = 4 * 1024;
const PER_SECOND = 4;
const PER_USER = 8;
const PER_ROOM = 64;
// A reader this far behind is dropped rather than buffered for.
const MAX_BACKLOG = 256 * 1024;
const CONN_ID = /^[A-Za-z0-9_-]{22,64}$/;

type Conn = {
  id: string;
  roomId: string;
  userId: string;
  token: string;
  tokenHash: Buffer;
  res: ServerResponse;
  /** My last line, replayed to whoever connects next. */
  last?: string;
  tokens: number;
  at: number;
  timers: NodeJS.Timeout[];
  dropped?: boolean;
};

class Fail {
  status: number;
  error: string;
  constructor(status: number, error: string) {
    this.status = status;
    this.error = error;
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest();
const line = (o: unknown) => JSON.stringify(o) + '\n';

function bearer(req: IncomingMessage): string | null {
  return req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1] ?? null;
}

export function createPresence({ mx, now = Date.now }: { mx: Matrix; now?: () => number }) {
  const rooms = new Map<string, Map<string, Conn>>();
  let shutdownHooked = false;
  let closing = false;

  function write(c: Conn, s: string) {
    if (c.res.writableLength > MAX_BACKLOG) drop(c, true);
    else c.res.write(s);
  }

  function drop(c: Conn, announce: boolean) {
    if (c.dropped) return;
    c.dropped = true;
    c.timers.forEach(clearInterval);
    const room = rooms.get(c.roomId);
    if (room?.get(c.id) === c) {
      room.delete(c.id);
      if (!room.size) rooms.delete(c.roomId);
      if (announce && c.last) {
        const gone = line({ from: c.userId, conn: c.id, gone: true });
        for (const o of room.values()) write(o, gone);
      }
    }
    if (!c.res.writableEnded) c.res.end();
  }

  function hookShutdown() {
    if (shutdownHooked) return;
    shutdownHooked = true;
    // Ends every stream so server.close() in index.ts can return; a proxy's pooled connection mustn't open new ones.
    const endAll = () => {
      closing = true;
      for (const room of [...rooms.values()]) for (const c of [...room.values()]) drop(c, false);
    };
    process.once('SIGTERM', endAll);
    process.once('SIGINT', endAll);
  }

  async function stream(req: IncomingMessage, res: ServerResponse, roomId: string, id: string | null): Promise<number> {
    if (closing) throw new Fail(503, 'closing');
    if (!id || !CONN_ID.test(id)) throw new Fail(400, 'bad-request');
    const token = bearer(req);
    const userId = token ? await mx.whoami(token) : null;
    if (!token || !userId) throw new Fail(401, 'unauthorized');
    if ((await mx.membership(token, roomId, userId)) !== 'join') throw new Fail(403, 'not-allowed');
    if (res.destroyed) return 499;

    const tokenHash = sha(token);
    const room = rooms.get(roomId) ?? new Map<string, Conn>();
    const prev = room.get(id);
    if (prev && !timingSafeEqual(prev.tokenHash, tokenHash)) throw new Fail(409, 'conflict');
    // The same tab reconnecting before we noticed its old stream close: take over quietly.
    if (prev) drop(prev, false);
    let mine = 0;
    for (const r of rooms.values()) for (const o of r.values()) if (o.userId === userId) mine++;
    if (mine >= PER_USER || room.size >= PER_ROOM) throw new Fail(429, 'too-many');

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const c: Conn = { id, roomId, userId, token, tokenHash, res, last: prev?.last, tokens: PER_SECOND, at: now(), timers: [] };
    room.set(id, c);
    rooms.set(roomId, room);
    for (const o of room.values()) if (o !== c && o.last) write(c, o.last);
    c.timers.push(
      setInterval(() => write(c, '\n'), HEARTBEAT_MS),
      setInterval(() => {
        mx.membership(token, roomId, userId).then(
          (m) => m !== 'join' && drop(c, true),
          () => drop(c, true),
        );
      }, RECHECK_MS),
    );
    res.on('close', () => drop(c, true));
    hookShutdown();
    return 200;
  }

  async function post(req: IncomingMessage, roomId: string): Promise<number> {
    const token = bearer(req);
    if (!token) throw new Fail(401, 'unauthorized');
    const body = await readJson(req);
    const c = typeof body.id === 'string' ? rooms.get(roomId)?.get(body.id) : undefined;
    if (!c || !timingSafeEqual(c.tokenHash, sha(token))) throw new Fail(403, 'not-allowed');
    const t = now();
    c.tokens = Math.min(PER_SECOND, c.tokens + ((t - c.at) * PER_SECOND) / 1000);
    c.at = t;
    if (c.tokens < 1) throw new Fail(429, 'rate-limited');
    c.tokens -= 1;
    c.last = line({ from: c.userId, conn: c.id, data: body.data ?? null });
    for (const o of rooms.get(roomId)!.values()) if (o !== c) write(o, c.last);
    return 204;
  }

  return {
    /** Answers /api/presence/*; false for anything else. */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const url = new URL(req.url ?? '/', 'http://invite');
      if (!/^\/api\/presence(\/|$)/.test(url.pathname)) return false;
      let status: number;
      try {
        const m = url.pathname.match(/^\/api\/presence\/([^/]+)$/);
        let roomId = '';
        try {
          roomId = decodeURIComponent(m?.[1] ?? '');
        } catch { /* stays empty */ }
        if (!roomId.startsWith('!')) throw new Fail(404, 'not-found');
        if (req.method === 'GET') status = await stream(req, res, roomId, url.searchParams.get('id'));
        else if (req.method === 'POST') status = await post(req, roomId);
        else throw new Fail(405, 'method-not-allowed');
        if (status === 204) res.writeHead(204).end();
      } catch (e) {
        const f = e instanceof Fail ? e : new Fail(502, 'server');
        status = f.status;
        if (!res.headersSent) {
          res.writeHead(f.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(closing ? { Connection: 'close' } : {}) });
        }
        if (!res.writableEnded) res.end(JSON.stringify({ error: f.error }));
      }
      // Posts arrive up to 4/s per tab: only failures are worth a line.
      if (status !== 204) console.log(`${req.method} presence ${status}`);
      return true;
    },
  };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Fail(413, 'too-large');
    chunks.push(chunk);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new Fail(400, 'bad-request');
}
