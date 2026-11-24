// Live relay (D-37, D-39): carets, board hints and page edits between the open tabs of one room, over one WebSocket
// per tab at /api/presence/<roomId>. The first message is { token }; then { data } is my state (kept, the latest wins,
// sent to whoever opens next) and { event } is passed on and forgotten. In memory only; nothing stored or logged.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { MatrixError, type Matrix } from './matrix.ts';

const PING_MS = 20_000;
const AUTH_MS = 10_000;
const RECHECK_MS = 60_000;
const MAX_MESSAGE = 16 * 1024;
// Far above what a tab sends (about 30 states and a few edits a second); past it the tab is cut off.
const PER_SECOND = 100;
const BURST = 200;
const PER_USER = 8;
const PER_ROOM = 64;
// A reader this far behind is dropped rather than buffered for.
const MAX_BACKLOG = 256 * 1024;

const UNAUTHORIZED = 4401;
const NOT_ALLOWED = 4403;
const TOO_MANY = 4429;

type Conn = {
  id: string;
  roomId: string;
  userId: string;
  ws: WebSocket;
  data?: unknown;
  tokens: number;
  at: number;
  alive: boolean;
  close(code: number): void;
};

export function createPresence({ mx, now = Date.now }: { mx: Matrix; now?: () => number }) {
  const rooms = new Map<string, Map<string, Conn>>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });

  function send(c: Conn, message: object) {
    if (c.ws.bufferedAmount > MAX_BACKLOG) c.ws.terminate();
    else c.ws.send(JSON.stringify(message));
  }

  function others(c: Conn, message: object) {
    for (const o of rooms.get(c.roomId)?.values() ?? []) if (o !== c) send(o, message);
  }

  // Who the token belongs to when they're joined to the room, else the close code. A dead token is 401 on every route.
  async function authorize(token: string, roomId: string): Promise<string | number> {
    const who = await mx.session(token);
    if (!who) return UNAUTHORIZED;
    try {
      if ((await mx.membership(token, roomId, who.userId)) !== 'join') return NOT_ALLOWED;
    } catch (e) {
      if (e instanceof MatrixError && (e.status === 401 || e.status === 403)) return UNAUTHORIZED;
      throw e;
    }
    return who.userId;
  }

  async function admit(ws: WebSocket, roomId: string, token: unknown): Promise<Conn | number> {
    if (typeof token !== 'string' || !token) return UNAUTHORIZED;
    const userId = await authorize(token, roomId);
    if (typeof userId === 'number') return userId;
    if (ws.readyState !== ws.OPEN) return 1011;
    const room = rooms.get(roomId) ?? new Map<string, Conn>();
    let mine = 0;
    for (const r of rooms.values()) for (const o of r.values()) if (o.userId === userId) mine++;
    if (mine >= PER_USER || room.size >= PER_ROOM) return TOO_MANY;
    // The sender is who the homeserver says the token belongs to, never what a message claims.
    let left = false;
    // Out of the room the moment it's closed: a peer that never answers the close frame gets nothing more meanwhile.
    const leave = () => {
      if (left) return;
      left = true;
      clearInterval(recheck);
      clearInterval(ping);
      room.delete(c.id);
      if (!room.size && rooms.get(roomId) === room) rooms.delete(roomId);
      others(c, { from: userId, conn: c.id, gone: true });
    };
    const c: Conn = {
      id: randomUUID(), roomId, userId, ws, tokens: BURST, at: now(), alive: true,
      close(code) {
        leave();
        ws.close(code);
      },
    };
    const peers = [...room.values()].filter((o) => o.data !== undefined).map((o) => ({ from: o.userId, conn: o.id, data: o.data }));
    room.set(c.id, c);
    rooms.set(roomId, room);
    // Fails closed: anything but the same person still joined ends the socket; after a lookup error the app reconnects
    // and is admitted afresh.
    const recheck = setInterval(() => {
      authorize(token, roomId).then(
        (r) => r !== userId && c.close(typeof r === 'number' ? r : UNAUTHORIZED),
        () => c.close(1011),
      );
    }, RECHECK_MS);
    const ping = setInterval(() => {
      if (!c.alive) return ws.terminate();
      c.alive = false;
      send(c, { ping: 1 });
    }, PING_MS);
    ws.on('close', leave);
    send(c, { ready: true, peers });
    return c;
  }

  function onMessage(c: Conn, m: Record<string, unknown>) {
    if (c.ws.readyState !== c.ws.OPEN) return;
    c.alive = true;
    const t = now();
    c.tokens = Math.min(BURST, c.tokens + ((t - c.at) * PER_SECOND) / 1000);
    c.at = t;
    if (c.tokens < 1) return c.close(TOO_MANY);
    c.tokens -= 1;
    if ('data' in m) {
      c.data = m.data ?? null;
      others(c, { from: c.userId, conn: c.id, data: c.data });
    } else if ('event' in m) others(c, { from: c.userId, conn: c.id, event: m.event });
  }

  function accept(ws: WebSocket, roomId: string) {
    let conn: Conn | null = null;
    let asked = false;
    const late = setTimeout(() => ws.close(UNAUTHORIZED), AUTH_MS);
    ws.on('error', () => ws.terminate());
    ws.on('close', () => clearTimeout(late));
    ws.on('message', (raw, binary) => {
      let m: unknown;
      try {
        m = binary ? null : JSON.parse(raw.toString());
      } catch { /* stays undefined */ }
      if (!m || typeof m !== 'object' || Array.isArray(m)) return ws.close(1003);
      if (conn) return onMessage(conn, m as Record<string, unknown>);
      // Anything sent before I've answered the token is dropped; the app waits for { ready }.
      if (asked) return;
      asked = true;
      admit(ws, roomId, (m as { token?: unknown }).token).then(
        (r) => {
          clearTimeout(late);
          if (typeof r === 'number') ws.close(r);
          else if (ws.readyState === ws.OPEN) conn = r;
        },
        () => ws.close(1011),
      );
    });
  }

  return {
    /** Takes the upgrade for /api/presence/<roomId>; false for anything else. */
    upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
      const m = new URL(req.url ?? '/', 'http://invite').pathname.match(/^\/api\/presence\/([^/]+)$/);
      let roomId = '';
      try {
        roomId = decodeURIComponent(m?.[1] ?? '');
      } catch { /* stays empty */ }
      if (!roomId.startsWith('!')) return false;
      wss.handleUpgrade(req, socket, head, (ws) => accept(ws, roomId));
      return true;
    },
    /** Ends every socket this person holds, in every room. */
    closeUser(userId: string) {
      for (const room of [...rooms.values()]) for (const c of [...room.values()]) if (c.userId === userId) c.close(UNAUTHORIZED);
    },
    /** Ends every socket, so the HTTP server can close. */
    close() {
      for (const ws of wss.clients) ws.terminate();
    },
  };
}
