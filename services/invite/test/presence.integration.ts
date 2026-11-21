// Presence relay (D-37) against the local stack (pnpm dev:server, pnpm dev:seed). Run: pnpm test:invite
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { BASE, SEED_FILE, login, userId } from '../../../dev/lib.ts';

const general = (JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { rooms: { general: string } }).rooms.general;
const path = (roomId: string) => `${BASE}/api/presence/${encodeURIComponent(roomId)}`;
const newConn = () => randomBytes(16).toString('base64url');
const auth = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

type Stream = { status: number; seen: any[]; next(match: (l: any) => boolean): Promise<any>; close(): void };
const open: Stream[] = [];

async function stream(token: string | null, conn: string, roomId = general): Promise<Stream> {
  const ac = new AbortController();
  const res = await fetch(`${path(roomId)}?id=${conn}`, { headers: auth(token), signal: ac.signal });
  const seen: any[] = [];
  let wake = () => {};
  if (res.ok) {
    void (async () => {
      const decoder = new TextDecoder();
      let buf = '';
      try {
        for await (const chunk of res.body!) {
          buf += decoder.decode(chunk, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n')) >= 0) {
            const text = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (text) seen.push(JSON.parse(text));
          }
          wake();
        }
      } catch { /* aborted */ }
    })();
  } else await res.body?.cancel();
  const s: Stream = {
    status: res.status,
    seen,
    async next(match) {
      const until = Date.now() + 5000;
      for (;;) {
        const i = seen.findIndex(match);
        if (i >= 0) return seen.splice(i, 1)[0];
        if (Date.now() > until) throw new Error('no matching line');
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, 100);
        });
      }
    },
    close: () => ac.abort(),
  };
  open.push(s);
  return s;
}

const post = (token: string | null, body: unknown, roomId = general) =>
  fetch(path(roomId), { method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => (await r.body?.cancel(), r.status));

let ingrid = '', jonas = '', sofia = '', henrik = '';
before(async () => {
  [ingrid, jonas, sofia, henrik] = await Promise.all([login('ingrid'), login('jonas'), login('sofia'), login('henrik_nordlys.no')]);
});
after(() => open.forEach((s) => s.close()));

describe('presence relay', () => {
  it('needs a token', async () => {
    assert.equal((await stream(null, newConn())).status, 401);
    assert.equal(await post(null, { id: newConn(), data: 1 }), 401);
  });

  it('turns away someone who is not in the room', async () => {
    assert.equal((await stream(henrik, newConn())).status, 403);
    assert.equal(await post(henrik, { id: newConn(), data: 1 }), 403);
  });

  it('relays a member to the room with the sender stamped by the server', async () => {
    const a = await stream(ingrid, newConn());
    const bConn = newConn();
    const b = await stream(jonas, bConn);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);

    assert.equal(await post(jonas, { id: bConn, data: { at: 3 }, from: userId('sofia') }), 204);
    assert.deepEqual(await a.next((l) => l.conn === bConn), { from: userId('jonas'), conn: bConn, data: { at: 3 } });

    // Someone opening later gets everyone's last value; when a tab closes, the rest hear it's gone.
    const c = await stream(sofia, newConn());
    assert.deepEqual(await c.next((l) => l.conn === bConn), { from: userId('jonas'), conn: bConn, data: { at: 3 } });
    b.close();
    assert.deepEqual(await a.next((l) => l.conn === bConn && l.gone), { from: userId('jonas'), conn: bConn, gone: true });
  });

  it('never loses the latest of a burst', async () => {
    const a = await stream(ingrid, newConn());
    const conn = newConn();
    await stream(jonas, conn);
    // 50 moves in a second, like a fast caret. A refused post is retried with the latest state, as the app does.
    let last = 0;
    for (let n = 1; n <= 50; n++) {
      last = await post(jonas, { id: conn, data: { n } });
      await new Promise((r) => setTimeout(r, 20));
    }
    for (let tries = 0; last === 429 && tries < 10; tries++) {
      await new Promise((r) => setTimeout(r, 150));
      last = await post(jonas, { id: conn, data: { n: 50 } });
    }
    assert.equal(last, 204);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(a.seen.filter((l) => l.conn === conn).at(-1)?.data, { n: 50 });
  });

  it('only takes posts for an open stream of the same token', async () => {
    assert.equal(await post(ingrid, { id: newConn(), data: 1 }), 403);
    const conn = newConn();
    await stream(jonas, conn);
    assert.equal(await post(ingrid, { id: conn, data: 1 }), 403);
    assert.equal(await post(jonas, { id: conn, data: 'x'.repeat(5000) }), 413);
  });
});
