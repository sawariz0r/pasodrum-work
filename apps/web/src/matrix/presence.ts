// Live relay client (D-37, D-39): one WebSocket per open room. set() is my state (the latest wins), send() a passing
// event; the other tabs' come back through peers() and onEvent(). The token goes in the first message, never the URL.
// If the relay is down, peers() is empty and nothing else changes.
import type { Presence, PresencePeer } from './docsBoardsTypes';
import type { Person } from './types';

export interface PresenceOptions {
  token: string;
  /** Origin serving /api/presence (the app's own). */
  base: string;
  roomId: string;
  /** Someone as this room knows them. */
  person?: (userId: string) => Person;
}

const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 5_000;
// The relay pings every 20 s; this long without a message means the socket is dead.
const SILENCE_MS = 45_000;
// About 30 states a second: one a frame at most, sent at once when the last is older than this.
const SEND_GAP_MS = 33;
/** Cut off from the relay this long, I no longer know who is here. */
const STALE_MS = 10_000;

export function openPresence(o: PresenceOptions): Presence {
  const url = `${o.base.replace(/^http/, 'ws')}/api/presence/${encodeURIComponent(o.roomId)}`;
  const person = o.person ?? ((id: string) => ({ id, name: id.slice(1, id.indexOf(':')) }));
  const peers = new Map<string, PresencePeer>();
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: unknown, from: Person) => void>();
  let list: PresencePeer[] = [];
  let ws: WebSocket | null = null;
  let ready = false;
  let done = false;
  let retry = RETRY_MIN_MS;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  // Mine, as JSON: the latest asked for, and the latest the relay has.
  let mine: string | undefined;
  let sent: string | undefined;
  let sentAt = 0;
  let sendTimer: ReturnType<typeof setTimeout> | undefined;

  const emit = () => {
    list = [...peers.values()];
    listeners.forEach((l) => l());
  };

  function flush() {
    clearTimeout(sendTimer);
    sendTimer = undefined;
    if (!ready || mine === undefined || mine === sent) return;
    const wait = sentAt + SEND_GAP_MS - Date.now();
    if (wait > 0) {
      sendTimer = setTimeout(flush, wait);
      return;
    }
    ws!.send(`{"data":${mine}}`);
    sent = mine;
    sentAt = Date.now();
  }

  function onMessage(sock: WebSocket, text: unknown) {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(text)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (m.ping) return sock.send('{"pong":1}');
    if (m.ready) {
      clearTimeout(staleTimer);
      staleTimer = undefined;
      peers.clear();
      for (const p of Array.isArray(m.peers) ? (m.peers as { from?: unknown; conn?: unknown; data?: unknown }[]) : []) {
        if (typeof p?.from === 'string' && typeof p.conn === 'string') peers.set(p.conn, { user: person(p.from), conn: p.conn, data: p.data ?? null });
      }
      ready = true;
      retry = RETRY_MIN_MS;
      sent = undefined;
      emit();
      flush();
      return;
    }
    const { from, conn } = m;
    if (typeof from !== 'string' || typeof conn !== 'string') return;
    if (m.gone === true) {
      if (peers.delete(conn)) emit();
    } else if ('event' in m) {
      const who = person(from);
      eventListeners.forEach((l) => l(m.event, who));
    } else if ('data' in m) {
      peers.set(conn, { user: person(from), conn, data: m.data ?? null });
      emit();
    }
  }

  function connect() {
    retryTimer = undefined;
    if (done) return;
    const sock = new WebSocket(url);
    ws = sock;
    const heard = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => sock.close(), SILENCE_MS);
    };
    heard();
    sock.onopen = () => sock.send(JSON.stringify({ token: o.token }));
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      heard();
      onMessage(sock, e.data);
    };
    sock.onclose = (e) => {
      if (ws !== sock) return;
      ws = null;
      ready = false;
      clearTimeout(silenceTimer);
      clearTimeout(sendTimer);
      sendTimer = undefined;
      // Signed out or not in the room: retrying won't change that.
      if (e.code === 4401 || e.code === 4403) done = true;
      if (done) return;
      // Whoever was here stays on screen through a short drop; { ready } brings the true list.
      staleTimer ??= setTimeout(() => {
        staleTimer = undefined;
        if (ready || !peers.size) return;
        peers.clear();
        emit();
      }, STALE_MS);
      retryTimer = setTimeout(connect, retry / 2 + Math.random() * (retry / 2));
      retry = Math.min(retry * 2, RETRY_MAX_MS);
    };
  }

  connect();

  return {
    set(data) {
      const value = JSON.stringify(data ?? null);
      if (value === mine) return;
      mine = value;
      flush();
    },
    send(event) {
      if (ready) ws!.send(JSON.stringify({ event }));
    },
    peers: () => list,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    onEvent(cb) {
      eventListeners.add(cb);
      return () => void eventListeners.delete(cb);
    },
    close() {
      done = true;
      clearTimeout(retryTimer);
      clearTimeout(silenceTimer);
      clearTimeout(staleTimer);
      clearTimeout(sendTimer);
      const sock = ws;
      ws = null;
      ready = false;
      sock?.close();
      peers.clear();
      list = [];
      listeners.clear();
      eventListeners.clear();
    },
  };
}
