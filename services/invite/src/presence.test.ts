// The relay admits a socket after one membership check, then repeats that check on a timer.
// These tests drive that timer against the real client and a homeserver that answers the way
// Continuwuity does once a token is locked or gone. They fail while a dead token leaves the socket up.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { matrixClient } from './matrix.ts';
import { createPresence } from './presence.ts';

const PING_MS = 20_000;
const PAGE = '!page:pasodrum.test';
const BOARD = '!board:pasodrum.test';
const ATTACKER = '@attacker:pasodrum.test';
const COLLEAGUE = '@colleague:pasodrum.test';
const JOINER = '@joiner:pasodrum.test';
const ATTACKER_TOKEN = 'token-attacker';
const COLLEAGUE_TOKEN = 'token-colleague';
const JOINER_TOKEN = 'token-joiner';

type Who = 'attacker' | 'colleague' | 'joiner' | 'unknown';
type Hit = { who: Who; status: number; path: 'whoami' | 'member' };
type Account = { userId: string; locked: boolean };
type Tab = {
  ws: WebSocket;
  roomId: string;
  userId: string;
  messages: Record<string, unknown>[];
  closeCode: number | null;
  send(body: unknown): void;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no port');
      resolve(address.port);
    });
  });
}

function eventU(message: Record<string, unknown>): string | undefined {
  const event = message.event;
  if (!event || typeof event !== 'object' || !('u' in event)) return undefined;
  const u = (event as { u?: unknown }).u;
  return typeof u === 'string' ? u : undefined;
}

function dataMark(message: Record<string, unknown>): string | undefined {
  const data = message.data;
  if (!data || typeof data !== 'object' || !('mark' in data)) return undefined;
  const mark = (data as { mark?: unknown }).mark;
  return typeof mark === 'string' ? mark : undefined;
}

/**
 * Homeserver stand-in for the two calls the relay makes.
 * Auth matches Continuwuity's access-token check: an unknown token is 401, and a known locked
 * account is 401 before the route handler runs, on whoami and on membership alike.
 */
function startHomeserver(accounts: Map<string, Account>, membership: Map<string, string>) {
  const trace: Hit[] = [];
  const whoOf = (token: string): Who =>
    token === ATTACKER_TOKEN ? 'attacker' : token === COLLEAGUE_TOKEN ? 'colleague' : token === JOINER_TOKEN ? 'joiner' : 'unknown';
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://homeserver');
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const account = token ? accounts.get(token) : undefined;
    const who = whoOf(token);
    const deny = (status: number, errcode: string, error: string, path: Hit['path']) => {
      trace.push({ who, status, path });
      send(res, status, { errcode, error });
    };
    const memberPath = url.pathname.match(/^\/_matrix\/client\/v3\/rooms\/([^/]+)\/state\/m\.room\.member\/([^/]+)$/);
    const path: Hit['path'] | null =
      req.method === 'GET' && url.pathname === '/_matrix/client/v3/account/whoami'
        ? 'whoami'
        : req.method === 'GET' && memberPath
          ? 'member'
          : null;
    if (!path) {
      send(res, 400, { errcode: 'M_UNRECOGNIZED', error: 'Unrecognized request' });
      return;
    }
    if (!account) {
      deny(401, 'M_UNKNOWN_TOKEN', 'Invalid token', path);
      return;
    }
    if (account.locked) {
      deny(401, 'M_USER_LOCKED', 'Your account is locked.', path);
      return;
    }
    if (path === 'whoami') {
      trace.push({ who, status: 200, path });
      send(res, 200, { user_id: account.userId, device_id: 'DEVICE' });
      return;
    }
    const roomId = decodeURIComponent(memberPath?.[1] ?? '');
    const userId = decodeURIComponent(memberPath?.[2] ?? '');
    const state = membership.get(`${roomId}\0${userId}`);
    if (!state) {
      deny(404, 'M_NOT_FOUND', 'State event not found in room.', path);
      return;
    }
    trace.push({ who, status: 200, path });
    send(res, 200, { membership: state });
  });
  return { server, trace };
}

type Timer = { fn: () => void; ms: number; fired: boolean };

function captureRelayTimers(): Timer[] {
  const timers: Timer[] = [];
  const real = globalThis.setInterval.bind(globalThis);
  vi.stubGlobal('setInterval', (fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    const delayMs = Number(ms);
    // Vitest polls on short timers. The relay's own timers are the ping and the membership recheck.
    if (delayMs < PING_MS) return real(fn as never, ms as never, ...(args as never[]));
    const id = real(() => {}, 2 ** 31 - 1);
    id.unref();
    timers.push({ fn: () => (fn as (...a: unknown[]) => void)(...args), ms: delayMs, fired: false });
    return id;
  });
  return timers;
}

async function relayHarness() {
  const accounts = new Map<string, Account>([
    [ATTACKER_TOKEN, { userId: ATTACKER, locked: false }],
    [COLLEAGUE_TOKEN, { userId: COLLEAGUE, locked: false }],
    [JOINER_TOKEN, { userId: JOINER, locked: false }],
  ]);
  const membership = new Map<string, string>([
    [`${PAGE}\0${ATTACKER}`, 'join'],
    [`${PAGE}\0${COLLEAGUE}`, 'join'],
    [`${PAGE}\0${JOINER}`, 'join'],
    [`${BOARD}\0${ATTACKER}`, 'join'],
    [`${BOARD}\0${COLLEAGUE}`, 'join'],
    [`${BOARD}\0${JOINER}`, 'join'],
  ]);
  const homeserver = startHomeserver(accounts, membership);
  const hsPort = await listen(homeserver.server);
  const timers = captureRelayTimers();
  const presence = createPresence({ mx: matrixClient(`http://127.0.0.1:${hsPort}`) });
  const relay = createServer();
  relay.on('upgrade', (req, socket, head) => {
    if (!presence.upgrade(req, socket, head)) socket.destroy();
  });
  const relayPort = await listen(relay);
  const tabs: Tab[] = [];

  async function connect(roomId: string, token: string, userId: string): Promise<Tab> {
    const ws = new WebSocket(`ws://127.0.0.1:${relayPort}/api/presence/${encodeURIComponent(roomId)}`);
    const tab: Tab = {
      ws,
      roomId,
      userId,
      messages: [],
      closeCode: null,
      send(body) {
        ws.send(JSON.stringify(body));
      },
    };
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      tab.messages.push(message);
      if (message.ping === 1 && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ pong: 1 }));
    });
    ws.on('close', (code) => {
      tab.closeCode = code;
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ token }));
    tabs.push(tab);
    return tab;
  }

  async function until(tab: Tab, pred: (message: Record<string, unknown>) => boolean): Promise<Record<string, unknown> | null> {
    const start = Date.now();
    for (;;) {
      const found = tab.messages.find(pred);
      if (found) return found;
      if (tab.closeCode !== null) return null;
      if (Date.now() - start > 1000) return null;
      await delay(10);
    }
  }

  function fire(pred: (timer: Timer) => boolean): number {
    const due = timers.filter((timer) => !timer.fired && pred(timer));
    for (const timer of due) {
      timer.fired = true;
      timer.fn();
    }
    return due.length;
  }

  async function recheck() {
    const before = homeserver.trace.length;
    const n = fire((timer) => timer.ms !== PING_MS);
    expect(n).toBeGreaterThan(0);
    await vi.waitFor(() => {
      if (homeserver.trace.length < before + n) throw new Error(`waiting for ${n} recheck lookups`);
    });
    await delay(50);
  }

  async function stop() {
    for (const tab of tabs) if (tab.ws.readyState === WebSocket.OPEN) tab.ws.close();
    presence.close();
    await Promise.all([closeServer(relay), closeServer(homeserver.server)]);
    vi.unstubAllGlobals();
  }

  return { accounts, membership, trace: homeserver.trace, connect, until, fire, recheck, stop };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function ready(tab: Tab, until: (tab: Tab, pred: (message: Record<string, unknown>) => boolean) => Promise<unknown>) {
  const message = await until(tab, (m) => m.ready === true);
  expect(message, `${tab.userId} in ${tab.roomId}`).not.toBeNull();
}

let stop: (() => Promise<void>) | null = null;
afterEach(async () => {
  await stop?.();
  stop = null;
});

describe('live relay recheck', () => {
  it('drops a locked session from every open page and board', async () => {
    const h = await relayHarness();
    stop = h.stop;
    const pageAttacker = await h.connect(PAGE, ATTACKER_TOKEN, ATTACKER);
    const pageColleague = await h.connect(PAGE, COLLEAGUE_TOKEN, COLLEAGUE);
    const boardAttacker = await h.connect(BOARD, ATTACKER_TOKEN, ATTACKER);
    const boardColleague = await h.connect(BOARD, COLLEAGUE_TOKEN, COLLEAGUE);
    await Promise.all([pageAttacker, pageColleague, boardAttacker, boardColleague].map((tab) => ready(tab, h.until)));

    pageAttacker.send({ event: { u: 'page-before' } });
    pageAttacker.send({ data: { mark: 'page-state' } });
    boardAttacker.send({ event: { u: 'board-before' } });
    boardAttacker.send({ data: { mark: 'board-state' } });
    expect(await h.until(pageColleague, (m) => eventU(m) === 'page-before')).not.toBeNull();
    expect(await h.until(pageColleague, (m) => dataMark(m) === 'page-state')).not.toBeNull();
    expect(await h.until(boardColleague, (m) => eventU(m) === 'board-before')).not.toBeNull();
    expect(await h.until(boardColleague, (m) => dataMark(m) === 'board-state')).not.toBeNull();

    expect(h.fire((timer) => timer.ms === PING_MS)).toBe(4);
    await delay(50);
    for (const tab of [pageAttacker, pageColleague, boardAttacker, boardColleague]) {
      expect(tab.closeCode).toBeNull();
      expect(tab.ws.readyState).toBe(WebSocket.OPEN);
    }

    h.accounts.get(ATTACKER_TOKEN)!.locked = true;
    await h.recheck();

    const leaks: string[] = [];
    const watch = (tab: Tab, kind: string) => {
      const before = tab.messages.length;
      return () => {
        for (const message of tab.messages.slice(before)) {
          const mark = eventU(message) ?? dataMark(message);
          if (mark?.endsWith('-after') || mark?.endsWith('-inject')) leaks.push(`${kind}:${mark}`);
        }
      };
    };
    const reads = [
      watch(pageAttacker, 'page-read'),
      watch(boardAttacker, 'board-read'),
      watch(pageColleague, 'page-write'),
      watch(boardColleague, 'board-write'),
    ];
    pageColleague.send({ event: { u: 'page-edit-after' } });
    pageColleague.send({ data: { mark: 'page-hint-after' } });
    boardColleague.send({ event: { u: 'board-edit-after' } });
    boardColleague.send({ data: { mark: 'board-hint-after' } });
    for (const tab of [pageAttacker, boardAttacker]) {
      try {
        tab.send({ event: { u: `${tab.roomId === PAGE ? 'page' : 'board'}-inject` } });
        tab.send({ data: { mark: `${tab.roomId === PAGE ? 'page' : 'board'}-state-inject` } });
      } catch {
        // A closed socket cannot push another edit.
      }
    }
    await delay(150);
    reads.forEach((read) => read());

    const joiner = await h.connect(PAGE, JOINER_TOKEN, JOINER);
    const joined = await h.until(joiner, (m) => m.ready === true);
    const peers = (joined as { peers?: { from?: string }[] } | null)?.peers ?? [];
    if (peers.some((peer) => peer.from === ATTACKER)) leaks.push('page-state-retained');

    const attackerLookups = h.trace.filter((hit) => hit.who === 'attacker' && hit.status === 401);
    expect(attackerLookups.length).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
    expect([4401, 4403]).toContain(pageAttacker.closeCode);
    expect([4401, 4403]).toContain(boardAttacker.closeCode);
    expect(pageColleague.closeCode).toBeNull();
    expect(boardColleague.closeCode).toBeNull();
    expect(pageColleague.ws.readyState).toBe(WebSocket.OPEN);
    expect(boardColleague.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('drops a logged-out session the same way', async () => {
    const h = await relayHarness();
    stop = h.stop;
    const attacker = await h.connect(PAGE, ATTACKER_TOKEN, ATTACKER);
    const colleague = await h.connect(PAGE, COLLEAGUE_TOKEN, COLLEAGUE);
    await Promise.all([ready(attacker, h.until), ready(colleague, h.until)]);
    attacker.send({ event: { u: 'before' } });
    expect(await h.until(colleague, (m) => eventU(m) === 'before')).not.toBeNull();

    h.accounts.delete(ATTACKER_TOKEN);
    await h.recheck();
    const before = attacker.messages.length;
    colleague.send({ event: { u: 'edit-after' } });
    try {
      attacker.send({ event: { u: 'inject' } });
    } catch {
      // closed
    }
    await delay(150);
    const leaked = attacker.messages.slice(before).some((m) => eventU(m) === 'edit-after')
      || colleague.messages.some((m) => eventU(m) === 'inject');
    expect(leaked).toBe(false);
    expect(h.trace.some((hit) => hit.who === 'attacker' && hit.status === 401)).toBe(true);
    expect([4401, 4403]).toContain(attacker.closeCode);
    expect(colleague.closeCode).toBeNull();
    expect(colleague.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('drops a member who left while the session still works', async () => {
    const h = await relayHarness();
    stop = h.stop;
    const attacker = await h.connect(PAGE, ATTACKER_TOKEN, ATTACKER);
    const colleague = await h.connect(PAGE, COLLEAGUE_TOKEN, COLLEAGUE);
    await Promise.all([ready(attacker, h.until), ready(colleague, h.until)]);
    h.membership.set(`${PAGE}\0${ATTACKER}`, 'leave');
    await h.recheck();
    await delay(150);
    expect(attacker.closeCode).toBe(4403);
    expect(colleague.closeCode).toBeNull();
    expect(colleague.ws.readyState).toBe(WebSocket.OPEN);
    colleague.send({ event: { u: 'still-here' } });
    await delay(50);
    expect(attacker.messages.some((m) => eventU(m) === 'still-here')).toBe(false);
  });

  it('refuses a token that is already locked before the socket is admitted', async () => {
    const h = await relayHarness();
    stop = h.stop;
    h.accounts.get(ATTACKER_TOKEN)!.locked = true;
    const attacker = await h.connect(PAGE, ATTACKER_TOKEN, ATTACKER);
    await delay(200);
    expect(attacker.messages.some((m) => m.ready === true)).toBe(false);
    expect(attacker.closeCode).toBe(4401);
    expect(h.trace.some((hit) => hit.who === 'attacker' && hit.path === 'member')).toBe(false);
  });
});
