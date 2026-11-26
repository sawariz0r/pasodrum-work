// Spec for the Assistant masker: a team member's message text, display name and room name are masked on the invite
// process before the model runs. A long run of letters must not stall that process. These tests fail until that is true.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { parseHello, startAsk, type Hello } from './assistant/ask.ts';
import { gate, type Admitted } from './assistant/gate.ts';
import { masker } from './assistant/mask.ts';
import type { Step, StepResult } from './assistant/provider.ts';
import { openReader, type HomeserverGet, type Reader } from './assistant/reader.ts';
import { openUsage } from './assistant/usage.ts';
import { LIMITS } from './assistant/wire.ts';

const SERVER = 'pasodrum.test';
const USER = `@staff:${SERVER}`;
const WORKSPACE = `!workspace:${SERVER}`;
const ROOM = `!talk:${SERVER}`;
const ROOT = '$root';
const SHORT = 8_000;
const LONG = 32_000;
// 4× the letters is 4× the work when the scan is linear, and 16× when it backtracks. 8 sits between them.
const MAX_GROWTH = 8;

const mask = masker(SERVER);
const letters = (n: number) => 'a'.repeat(n);

type Stored = { id: string; body: string; thread?: string };

function message(id: string, body: string, thread?: string) {
  return {
    type: 'm.room.message',
    room_id: ROOM,
    event_id: id,
    sender: USER,
    origin_server_ts: 1_700_000_000_000,
    content: {
      msgtype: 'm.text',
      body,
      ...(thread ? { 'm.relates_to': { rel_type: 'm.thread', event_id: thread } } : {}),
    },
  };
}

/** Homeserver replies for one ask: a Staff member, an unencrypted parentless room, and the messages they stored. */
function world(opts: { messages: Stored[]; roomName?: string; displayname?: string }) {
  const roomName = opts.roomName ?? 'Talk';
  const displayname = opts.displayname ?? 'Staff';
  const events = opts.messages.map((m) => message(m.id, m.body, m.thread));
  const byId = new Map(events.map((e) => [e.event_id, e]));
  const replies = events.filter((e) => e.content['m.relates_to']);
  const timeline = events.filter((e) => !e.content['m.relates_to']);
  let threadReads = 0;
  const roomState = [
    { type: 'm.room.create', state_key: '', sender: USER, content: {} },
    { type: 'm.room.member', state_key: USER, sender: USER, content: { membership: 'join', displayname } },
    { type: 'm.room.name', state_key: '', sender: USER, content: { name: roomName } },
  ];
  const workspaceState = [
    { type: 'm.room.create', state_key: '', sender: USER, content: { room_version: '10' } },
    { type: 'm.room.member', state_key: USER, sender: USER, content: { membership: 'join', displayname: 'Staff' } },
    { type: 'm.room.power_levels', state_key: '', sender: USER, content: { users: { [USER]: 10 } } },
  ];
  const get: HomeserverGet = async (_token, path) => {
    const name = decodeURIComponent(new URL(path, 'http://hs').pathname);
    const ok = (body: unknown) => ({ status: 200, body });
    if (name.endsWith('/account/whoami')) return ok({ user_id: USER });
    if (name.endsWith(`/directory/room/${`#workspace:${SERVER}`}`)) return ok({ room_id: WORKSPACE });
    if (name.endsWith(`/directory/room/${`#admins:${SERVER}`}`)) return { status: 404, body: {} };
    if (name.endsWith(`/rooms/${WORKSPACE}/state`)) return ok(workspaceState);
    if (name.endsWith('/joined_rooms')) return ok({ joined_rooms: [WORKSPACE, ROOM] });
    if (name.endsWith(`/rooms/${ROOM}/state/m.room.create/`)) return ok({});
    if (name.endsWith(`/rooms/${ROOM}/state`)) return ok(roomState);
    if (name.includes(`/rooms/${ROOM}/event/`)) {
      const id = name.slice(name.lastIndexOf('/') + 1);
      const found = byId.get(id);
      return found ? ok(found) : { status: 404, body: {} };
    }
    if (name.includes('/m.thread')) {
      threadReads++;
      return ok({ chunk: replies });
    }
    if (name.includes('/m.replace')) return ok({ chunk: [] });
    if (name.endsWith('/messages')) return ok({ chunk: [...timeline].reverse(), end: 'older' });
    if (name.includes('/context/')) {
      const id = name.slice(name.lastIndexOf('/') + 1);
      const center = byId.get(id) ?? timeline[0];
      return ok({ event: center, events_before: [], events_after: [] });
    }
    return { status: 404, body: { missing: name } };
  };
  const reader = openReader(
    { get, workspaceAlias: `#workspace:${SERVER}`, serverName: SERVER, mask, isClientAccount: () => false, isClientOf: () => false, kinds: new Map() },
    'token',
  );
  return { reader, threadReads: () => threadReads };
}

async function millis(run: () => Promise<void>): Promise<{ ms: number; late: number }> {
  let late = 0;
  const started = performance.now();
  const timer = setTimeout(() => {
    late = performance.now() - started;
  }, 0);
  await run();
  const ms = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 0));
  clearTimeout(timer);
  return { ms, late };
}

/** Four times the letters is four times the work when the scan is linear, and sixteen times when it backtracks. */
async function expectLinear(label: string, run: (chars: number) => Promise<void>) {
  const short = await millis(() => run(SHORT));
  const long = await millis(() => run(LONG));
  expect(
    long.ms / short.ms,
    `${label}: ${SHORT} chars took ${short.ms.toFixed(0)} ms (timer late ${short.late.toFixed(0)} ms), ${LONG} chars took ${long.ms.toFixed(0)} ms (timer late ${long.late.toFixed(0)} ms)`,
  ).toBeLessThan(MAX_GROWTH);
}

function thread(chars: number): Stored[] {
  const body = letters(chars);
  return [
    { id: ROOT, body },
    { id: '$reply1', body, thread: ROOT },
    { id: '$reply2', body, thread: ROOT },
  ];
}

const answer: StepResult = {
  items: [{ type: 'function_call', name: 'answer', call_id: 'call', arguments: JSON.stringify({ outcome: 'nothing', say: 'Nothing there.', parts: [] }) }],
  usage: { input: 10, cached: 0, written: 0, output: 5, reasoning: 0 },
};

function helloOf(over: { context: Hello['context']; history: Hello['history'] }): Hello {
  const hello = parseHello({
    t: 'hello',
    ask: 'What was said?',
    lang: 'en',
    tz: 0,
    depth: 'quick',
    can: { parts: ['message'], proposals: [], views: [] },
    ...over,
  });
  if (!hello) throw new Error('hello rejected');
  return hello;
}

const ref = { k: 'thread' as const, room: ROOM, root: ROOT };

async function runAsk(reader: Reader, hello: Hello, step: Step): Promise<Admitted> {
  const admitted = await gate(reader, () => false);
  if (typeof admitted === 'string') throw new Error(`gate refused: ${admitted}`);
  const db = new DatabaseSync(':memory:');
  const book = openUsage(db, { dayUsd: 3, monthUsd: 100 }, () => Date.now());
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ask did not finish')), 20_000);
      const ws = {
        readyState: 1,
        OPEN: 1,
        send() {},
        close() {
          clearTimeout(timer);
          resolve();
        },
      };
      const running = startAsk({
        ws: ws as never,
        reader,
        step,
        book,
        admitted,
        hello,
        model: { model: 'm', effort: 'low', price: { in: 1, cached: 1, write: 1, out: 1 } },
        mask,
        now: () => Date.now(),
        onEnd() {},
      });
      if (typeof running === 'string') {
        clearTimeout(timer);
        reject(new Error(running));
      }
    });
  } finally {
    db.close();
  }
  return admitted;
}

describe('assistant text masking', () => {
  it('still hides an email address', () => {
    const out = mask('Write to user@example.com today');
    expect(out).toContain('[email]');
    expect(out).not.toContain('@');
  });

  it('masks a long run of letters in linear time', { timeout: 30_000 }, async () => {
    await expectLinear('mask', async (n) => {
      mask(letters(n));
    });
  });

  it('readEvent masks the stored message body before cutting it for the model', { timeout: 30_000 }, async () => {
    await expectLinear('readEvent', async (n) => {
      const { reader } = world({ messages: [{ id: ROOT, body: letters(n) }] });
      const read = await reader.readEvent(ROOM, ROOT);
      if (!read) throw new Error('message was not read');
      expect(read.items[0]?.text).toBe(letters(LIMITS.itemChars));
    });
  });

  it('readThread masks the root and each reply', { timeout: 30_000 }, async () => {
    await expectLinear('readThread', async (n) => {
      const { reader } = world({ messages: thread(n) });
      const read = await reader.readThread(ROOM, ROOT);
      if (!read || read.items.length !== 3) throw new Error(`thread items: ${read?.items.length ?? 0}`);
      for (const item of read.items) expect(item.text).toBe(letters(LIMITS.itemChars));
    });
  });

  it('readPlace masks each timeline message', { timeout: 30_000 }, async () => {
    await expectLinear('readPlace', async (n) => {
      const { reader } = world({ messages: [{ id: ROOT, body: letters(n) }] });
      const read = await reader.readPlace(ROOM);
      if (!read?.items.length) throw new Error('timeline was not read');
      expect(read.items[0]?.text).toBe(letters(LIMITS.itemChars));
    });
  });

  it('readAround masks the message it centers on', { timeout: 30_000 }, async () => {
    await expectLinear('readAround', async (n) => {
      const { reader } = world({ messages: [{ id: ROOT, body: letters(n) }] });
      const read = await reader.readAround(ROOM, ROOT);
      if (!read?.items.length) throw new Error('context was not read');
      expect(read.items[0]?.text).toBe(letters(LIMITS.itemChars));
    });
  });

  it('masks a display name in linear time', { timeout: 30_000 }, async () => {
    await expectLinear('display name', async (n) => {
      const { reader } = world({ messages: [{ id: ROOT, body: 'hi' }], displayname: letters(n) });
      const read = await reader.readEvent(ROOM, ROOT);
      if (!read) throw new Error('message was not read');
      expect(read.items[0]?.text).toBe('hi');
    });
  });

  it('masks a room name in linear time', { timeout: 30_000 }, async () => {
    await expectLinear('room name', async (n) => {
      const { reader } = world({ messages: [{ id: ROOT, body: 'hi' }], roomName: letters(n) });
      const read = await reader.readEvent(ROOM, ROOT);
      if (!read) throw new Error('message was not read');
      expect(read.place.name.length).toBeGreaterThan(0);
    });
  });

  it('an ask masks context and history text before the model is called', { timeout: 30_000 }, async () => {
    await expectLinear('ask', async (n) => {
      const { reader } = world({ messages: thread(n) });
      let shown = '';
      const step: Step = async (args) => {
        const user = args.items.find((i) => i.role === 'user');
        shown = JSON.stringify(user);
        return answer;
      };
      const admitted = await runAsk(
        reader,
        helloOf({
          context: { kind: 'thread', layer: 'page', refs: [ref] },
          history: [{ ask: 'earlier', say: 'noted', sources: [ref] }],
        }),
        step,
      );
      expect(admitted).toMatchObject({ userId: USER });
      expect(shown).toContain(letters(LIMITS.itemChars));
    });
  });

  it('reads a repeated thread reference once per ask', { timeout: 30_000 }, async () => {
    const { reader, threadReads } = world({ messages: [{ id: ROOT, body: 'unique-plan-word' }] });
    let shown = '';
    const step: Step = async (args) => {
      const user = args.items.find((i) => i.role === 'user');
      shown = JSON.stringify(user);
      return answer;
    };
    const history = Array.from({ length: 6 }, () => ({
      ask: 'earlier',
      say: 'noted',
      sources: Array.from({ length: 5 }, () => ({ ...ref })),
    }));
    await runAsk(
      reader,
      helloOf({
        context: { kind: 'thread', layer: 'page', refs: Array.from({ length: 8 }, () => ({ ...ref })) },
        history,
      }),
      step,
    );
    expect(shown).toContain('unique-plan-word');
    // Eight context refs and thirty history refs name this one thread. One read covers both lists.
    expect(threadReads()).toBeLessThanOrEqual(2);
  });
});
