// The Assistant (SIDE-14), fenced inside the invite service (spec §2.1): it gets a GET-only function for the homeserver,
// its own database file, its configuration and two questions for the invite records, and nothing else.
import { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { parseHello, startAsk, type Model, type Running } from './ask.ts';
import { gate, type Admitted, type Refusal } from './gate.ts';
import { masker } from './mask.ts';
import { createStep, type Step } from './provider.ts';
import { openReader, type HomeserverGet, type Kind, type Reader } from './reader.ts';
import { openUsage, validTz, type Price } from './usage.ts';
import { CLOSE, LIMITS, WIRE_VERSION, type Depth, type ServerMessage } from './wire.ts';

export type { HomeserverGet } from './reader.ts';
export type { Price } from './usage.ts';
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
  /** The provider adapter; tests pass a fake that records every request. */
  step?: Step;
  now?: () => number;
};
export type Answer = { status: number; body?: unknown };

const OPEN_PER_PERSON = 2;
const STARTS_PER_MINUTE = 6;
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

/** "gpt-6.2-sol:low" with its price; null when the model has no price, which keeps the module off (§6.2). */
function modelOf(setting: string, prices: Record<string, Price>): Model | null {
  const [model = '', effort = 'medium'] = setting.split(':');
  const price = Object.hasOwn(prices, model) ? prices[model] : undefined;
  const ok = price && [price.in, price.cached, price.write, price.out].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  return model && ok ? { model, effort, price } : null;
}

export function createAssistant({ get, config: given, isClientAccount, isClientOf, allowIp, step: injected, now = Date.now }: AssistantDeps) {
  const models = given && { quick: modelOf(given.quick, given.prices), thorough: modelOf(given.thorough, given.prices) };
  const config = models?.quick && models.thorough ? given : null;
  const modelFor = (depth: Depth) => models![depth]!;
  // The module's own file, never the service's main database.
  const db = config ? new DatabaseSync(config.dbPath) : null;
  const book = db && config ? openUsage(db, config, now) : null;
  const step = injected ?? (config ? createStep(config.apiKey) : null);
  const kinds = new Map<string, Kind>();
  const mask = config ? masker(config.serverName) : null;
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.messageBytes });
  const people = new Map<string, { open: number; starts: number[] }>();
  const running = new Set<Running>();

  /** 2 asks open at once and 6 started a minute, per person. */
  function admit(userId: string): (() => void) | null {
    const p = people.get(userId) ?? { open: 0, starts: [] };
    p.starts = p.starts.filter((t) => now() - t < 60_000);
    if (p.open >= OPEN_PER_PERSON || p.starts.length >= STARTS_PER_MINUTE) return null;
    p.open++;
    p.starts.push(now());
    people.set(userId, p);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      p.open--;
      if (!p.open && !p.starts.length) people.delete(userId);
    };
  }

  function readerFor(token: string, signal?: AbortSignal) {
    return openReader({ get, workspaceAlias: config!.workspaceAlias, serverName: config!.serverName, mask: mask!, isClientAccount, isClientOf, kinds, signal }, token);
  }

  async function status(req: IncomingMessage): Promise<Answer> {
    if (!config) return { status: 503, body: { error: 'not-configured' } };
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return { status: 401, body: { error: 'unauthorized' } };
    const g = await gate(readerFor(token), isClientAccount);
    if (typeof g === 'string') return { status: HTTP_STATUS[g], body: { error: g } };
    const raw = new URL(req.url ?? '/', 'http://invite').searchParams.get('tz');
    const tz = raw !== null && /^-?\d{1,4}$/.test(raw) ? Number(raw) : NaN;
    if (!validTz(tz)) return { status: 400, body: { error: 'bad-tz' } };
    return { status: 200, body: book!.status(g.userId, tz) };
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
    let stage: 'auth' | 'gate' | 'hello' | 'ask' | 'done' = 'auth';
    let reader: Reader | null = null;
    let admitted: Admitted | null = null;
    let ask: Running | null = null;
    const send = (m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
    const fail = (reason: 'unavailable' | 'failed', code: number) => {
      stage = 'done';
      send({ t: 'error', reason });
      ws.close(code);
    };
    let late = setTimeout(() => ws.close(CLOSE.unauthorized), LIMITS.authMs);
    ws.on('error', () => ws.terminate());
    ws.on('close', (code) => {
      clearTimeout(late);
      controller.abort();
      ask?.end('stopped');
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
        reader = readerFor(m.token, controller.signal);
        gate(reader, isClientAccount).then(
          (g) => {
            if (stage !== 'gate') return;
            if (g === 'unauthorized') return ws.close(CLOSE.unauthorized);
            if (g === 'not-allowed') return ws.close(CLOSE.notAllowed);
            if (g === 'unavailable') return fail('unavailable', 1011);
            admitted = g;
            stage = 'hello';
            late = setTimeout(() => ws.close(1008), LIMITS.authMs);
          },
          () => fail('unavailable', 1011),
        );
        return;
      }
      if (stage === 'ask') return ask!.message(m);
      if (stage === 'hello' && m.t === 'hello') {
        clearTimeout(late);
        const hello = parseHello(m);
        if (!hello) return ws.close(1008);
        const release = admit(admitted!.userId);
        if (!release) return ws.close(CLOSE.tooMany);
        stage = 'ask';
        let self: Running | null = null;
        const started = startAsk({
          ws, reader: reader!, step: step!, book: book!, admitted: admitted!, hello, model: modelFor(hello.depth), mask: mask!, now,
          onEnd: () => (release(), self && running.delete(self)),
        });
        if (typeof started === 'string') {
          release();
          stage = 'done';
          send({ t: 'error', reason: started });
          return ws.close(1000);
        }
        self = ask = started;
        running.add(started);
        return;
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
      for (const a of [...running]) a.end('failed');
      for (const ws of wss.clients) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'error', reason: 'failed' } satisfies ServerMessage));
        ws.terminate();
      }
      db?.close();
    },
  };
}

export type Assistant = ReturnType<typeof createAssistant>;
