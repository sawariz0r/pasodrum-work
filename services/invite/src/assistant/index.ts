// The Assistant (SIDE-14), fenced inside the invite service (spec §2.1): it gets a GET-only function for the homeserver,
// its own database file, its configuration and two questions for the invite records, and nothing else.
import { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { gate, type Refusal } from './gate.ts';
import { masker } from './mask.ts';
import { openReader, type HomeserverGet, type Kind } from './reader.ts';
import { CLOSE, LIMITS, WIRE_VERSION, type ServerMessage, type Status } from './wire.ts';

export type { HomeserverGet } from './reader.ts';
export type Price = { in: number; cached: number; write: number; out: number };
export type AssistantConfig = {
  apiKey: string;
  quick: string;
  thorough: string;
  prices: Record<string, Price>;
  dayUsd: number;
  monthUsd: number;
  dbPath: string;
  workspaceAlias: string;
  serverName: string;
};
export type AssistantDeps = {
  get: HomeserverGet;
  config: AssistantConfig | null;
  isClientAccount: (userId: string) => boolean;
  isClientOf: (userId: string, spaceId: string) => boolean;
  /** The service's per-IP limit; upgrades to this path count against it. */
  allowIp: (req: IncomingMessage) => boolean;
  now?: () => number;
};
export type Answer = { status: number; body?: unknown };

const ASK_MS = 5 * 60_000;
const HTTP_STATUS: Record<Refusal, number> = { unauthorized: 401, 'not-allowed': 403, unavailable: 503 };

const sizeOf = (raw: RawData) => (Array.isArray(raw) ? raw.reduce((n, b) => n + b.length, 0) : raw.byteLength);

function parse(raw: RawData, binary: boolean): Record<string, unknown> | null {
  if (binary) return null;
  try {
    const m: unknown = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.from(raw as ArrayBuffer).toString('utf8'));
    return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createAssistant({ get, config, isClientAccount, isClientOf, allowIp, now = Date.now }: AssistantDeps) {
  // Tables arrive with usage (AST-06); the file is the module's own, never the service's main database.
  const db = config ? new DatabaseSync(config.dbPath) : null;
  const kinds = new Map<string, Kind>();
  const mask = config ? masker(config.serverName) : null;
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.messageBytes });

  function readerFor(token: string, signal?: AbortSignal) {
    return openReader({ get, workspaceAlias: config!.workspaceAlias, serverName: config!.serverName, mask: mask!, isClientAccount, isClientOf, kinds, signal }, token);
  }

  async function status(req: IncomingMessage): Promise<Answer> {
    if (!config) return { status: 503, body: { error: 'not-configured' } };
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return { status: 401, body: { error: 'unauthorized' } };
    const g = await gate(readerFor(token), isClientAccount);
    if (typeof g === 'string') return { status: HTTP_STATUS[g], body: { error: g } };
    const body: Status = { ask: 'ok', thorough: 'ok' };
    return { status: 200, body };
  }

  /** /api/assistant/<parts>. Never throws, so nothing from a read reaches the service's error log. */
  async function route(req: IncomingMessage, parts: string[], meta: { name: string }): Promise<Answer> {
    try {
      if (parts.length === 1 && parts[0] === 'status') {
        meta.name = 'assistant-status';
        return req.method === 'GET' ? await status(req) : { status: 405, body: { error: 'method-not-allowed' } };
      }
      meta.name = 'assistant';
      return { status: 404, body: { error: 'not-found' } };
    } catch {
      return { status: 502, body: { error: 'server' } };
    }
  }

  function accept(ws: WebSocket) {
    const started = now();
    const controller = new AbortController();
    let stage: 'auth' | 'gate' | 'hello' | 'done' = 'auth';
    const send = (m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
    const fail = (reason: 'unavailable' | 'failed', code: number) => {
      stage = 'done';
      send({ t: 'error', reason });
      ws.close(code);
    };
    let late = setTimeout(() => ws.close(CLOSE.unauthorized), LIMITS.authMs);
    const cap = setTimeout(() => fail('failed', 1000), ASK_MS);
    ws.on('error', () => ws.terminate());
    ws.on('close', (code) => {
      clearTimeout(late);
      clearTimeout(cap);
      controller.abort();
      console.log(`WS assistant-ask ${code} ${now() - started}ms`);
    });
    if (!config) return fail('unavailable', 1000);

    ws.on('message', (raw, binary) => {
      if (stage === 'auth' && sizeOf(raw) > LIMITS.authBytes) return ws.close(1009);
      const m = parse(raw, binary);
      if (!m) return ws.close(1003);
      if (stage === 'auth') {
        if (m.t !== 'auth' || typeof m.token !== 'string' || !m.token || m.v !== WIRE_VERSION) return ws.close(CLOSE.unauthorized);
        stage = 'gate';
        clearTimeout(late);
        gate(readerFor(m.token, controller.signal), isClientAccount).then(
          (g) => {
            if (stage !== 'gate') return;
            if (g === 'unauthorized') return ws.close(CLOSE.unauthorized);
            if (g === 'not-allowed') return ws.close(CLOSE.notAllowed);
            if (g === 'unavailable') return fail('unavailable', 1011);
            stage = 'hello';
            late = setTimeout(() => ws.close(1008), LIMITS.authMs);
          },
          () => fail('unavailable', 1011),
        );
        return;
      }
      if (stage === 'hello' && m.t === 'hello') {
        clearTimeout(late);
        // The ask loop is AST-06; until then every admitted ask ends here.
        return fail('unavailable', 1000);
      }
      ws.close(1008);
    });
  }

  return {
    route,
    /** Takes the upgrade for /api/assistant/ask; false for anything else. */
    upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
      if (new URL(req.url ?? '/', 'http://invite').pathname !== '/api/assistant/ask') return false;
      if (!allowIp(req)) {
        socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return true;
      }
      wss.handleUpgrade(req, socket, head, accept);
      return true;
    },
    /** Shutdown: every open ask ends as failed. */
    close() {
      for (const ws of wss.clients) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'error', reason: 'failed' } satisfies ServerMessage));
        ws.terminate();
      }
      db?.close();
    },
  };
}

export type Assistant = ReturnType<typeof createAssistant>;
