// Presence relay client (D-37): one streamed GET per open room carries the other tabs' lines down; set() posts mine up.
// The token rides in the header, never the URL. If the relay is down, peers() is empty and nothing else changes.
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

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;
// The relay sends a heartbeat every 20 s; this long without a byte means the stream is dead.
const SILENCE_MS = 45_000;
// About 11 posts a second, under the relay's 12/s (burst 24).
const SEND_GAP_MS = 90;
// A refused (429) or failed post is retried with the latest state after this, doubling up to the cap.
const FAIL_MIN_MS = 150;
const FAIL_MAX_MS = 300;

function connId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function openPresence(o: PresenceOptions): Presence {
  const conn = connId();
  const url = `${o.base}/api/presence/${encodeURIComponent(o.roomId)}`;
  const headers = { Authorization: `Bearer ${o.token}` };
  const person = o.person ?? ((id: string) => ({ id, name: id.slice(1, id.indexOf(':')) }));
  const peers = new Map<string, PresencePeer>();
  const listeners = new Set<() => void>();
  let list: PresencePeer[] = [];
  let ctrl: AbortController | null = null;
  let live = false;
  let done = false;
  let retry = RETRY_MIN_MS;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  // Mine, as JSON: the latest asked for, and the latest the relay has.
  let mine: string | undefined;
  let sent: string | undefined;
  let sentAt = 0;
  let holdUntil = 0;
  let failDelay = FAIL_MIN_MS;
  let sendTimer: ReturnType<typeof setTimeout> | undefined;

  const emit = () => {
    list = [...peers.values()];
    listeners.forEach((l) => l());
  };

  function onLine(text: string) {
    let m: unknown;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    const { from, conn: c, data, gone } = m as Record<string, unknown>;
    if (typeof from !== 'string' || typeof c !== 'string') return;
    if (gone === true) {
      if (peers.delete(c)) emit();
    } else {
      peers.set(c, { user: person(from), conn: c, data: data ?? null });
      emit();
    }
  }

  function schedule() {
    if (sendTimer || !live || mine === sent) return;
    sendTimer = setTimeout(flush, Math.max(0, sentAt + SEND_GAP_MS - Date.now(), holdUntil - Date.now()));
  }

  function flush() {
    sendTimer = undefined;
    if (!live || mine === undefined || mine === sent) return;
    const value = mine;
    sent = value;
    sentAt = Date.now();
    fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: `{"id":${JSON.stringify(conn)},"data":${value}}`,
    })
      .then((r) => {
        if (r.ok) failDelay = FAIL_MIN_MS;
        // 403/413 won't get better by retrying; a dropped stream reconnects and re-sends anyway.
        else failed(value, r.status === 429 || r.status >= 500);
      })
      .catch(() => failed(value, true));
    schedule();
  }

  function failed(value: string, retry: boolean) {
    if (sent !== value) return;
    sent = undefined;
    if (!retry) return;
    holdUntil = Date.now() + failDelay;
    failDelay = Math.min(failDelay * 2, FAIL_MAX_MS);
    schedule();
  }

  async function connect() {
    retryTimer = undefined;
    if (done) return;
    const ac = new AbortController();
    ctrl = ac;
    const silence = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => ac.abort(), SILENCE_MS);
    };
    try {
      silence();
      const res = await fetch(`${url}?id=${conn}`, { headers, signal: ac.signal, cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        done = true;
        return;
      }
      if (!res.ok || !res.body) return;
      retry = RETRY_MIN_MS;
      live = true;
      sent = undefined;
      holdUntil = 0;
      failDelay = FAIL_MIN_MS;
      schedule();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        silence();
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const text = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (text) onLine(text);
        }
      }
    } catch {
      // Aborted, offline or the relay is down: same as an empty room.
    } finally {
      clearTimeout(silenceTimer);
      if (ctrl === ac) {
        ctrl = null;
        live = false;
        clearTimeout(sendTimer);
        sendTimer = undefined;
        if (peers.size) {
          peers.clear();
          emit();
        }
        if (!done) {
          retryTimer = setTimeout(connect, retry / 2 + Math.random() * (retry / 2));
          retry = Math.min(retry * 2, RETRY_MAX_MS);
        }
      }
    }
  }

  void connect();

  return {
    set(data) {
      const value = JSON.stringify(data ?? null);
      if (value === mine) return;
      mine = value;
      schedule();
    },
    peers: () => list,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    close() {
      done = true;
      clearTimeout(retryTimer);
      clearTimeout(sendTimer);
      const ac = ctrl;
      ctrl = null;
      ac?.abort();
      live = false;
      peers.clear();
      list = [];
      listeners.clear();
    },
  };
}
