// Live relay (D-37, D-39) against the local stack (pnpm dev:server, pnpm dev:seed). Run: pnpm test:invite
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { BASE, SEED_FILE, login, userId } from '../../../dev/lib.ts';

const general = (JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { rooms: { general: string } }).rooms.general;
const url = `${BASE.replace(/^http/, 'ws')}/api/presence/${encodeURIComponent(general)}`;

type Tab = { seen: any[]; send(m: unknown): void; next(match: (m: any) => boolean): Promise<any>; closed: Promise<number>; close(): void };
const tabs: Tab[] = [];

function open(token: string | null): Tab {
  const ws = new WebSocket(url);
  const seen: any[] = [];
  let wake = () => {};
  ws.onopen = () => ws.send(JSON.stringify(token ? { token } : {}));
  ws.onmessage = (e) => {
    seen.push(JSON.parse(String(e.data)));
    wake();
  };
  const tab: Tab = {
    seen,
    send: (m) => ws.send(JSON.stringify(m)),
    async next(match) {
      const until = Date.now() + 5000;
      for (;;) {
        const i = seen.findIndex(match);
        if (i >= 0) return seen.splice(i, 1)[0];
        if (Date.now() > until) throw new Error('no matching message');
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, 100);
        });
      }
    },
    closed: new Promise((r) => (ws.onclose = (e) => r(e.code))),
    close: () => ws.close(),
  };
  tabs.push(tab);
  return tab;
}

let ingrid = '', jonas = '', sofia = '', henrik = '';
before(async () => {
  [ingrid, jonas, sofia, henrik] = await Promise.all([login('ingrid'), login('jonas'), login('sofia'), login('henrik_nordlys.no')]);
});
after(() => tabs.forEach((t) => t.close()));

describe('live relay', () => {
  it('turns away a missing or unknown token, and someone who is not in the room', async () => {
    assert.equal(await open(null).closed, 4401);
    assert.equal(await open('not-a-token').closed, 4401);
    const outsider = open(henrik);
    assert.equal(await outsider.closed, 4403);
    assert.deepEqual(outsider.seen, []);
  });

  it('stamps the sender itself, and tells a late tab the latest', async () => {
    const a = open(ingrid);
    const b = open(jonas);
    await Promise.all([a.next((m) => m.ready), b.next((m) => m.ready)]);

    b.send({ data: { at: 3 }, from: userId('sofia'), conn: 'someone-else' });
    const got = await a.next((m) => 'data' in m);
    assert.equal(got.from, userId('jonas'));
    assert.deepEqual(got.data, { at: 3 });

    b.send({ event: { u: 'x' }, from: userId('sofia') });
    assert.deepEqual(await a.next((m) => 'event' in m), { from: userId('jonas'), conn: got.conn, event: { u: 'x' } });

    // Someone opening later gets everyone's state (not past events); when a tab closes, the rest hear it's gone.
    const c = open(sofia);
    assert.deepEqual((await c.next((m) => m.ready)).peers, [{ from: userId('jonas'), conn: got.conn, data: { at: 3 } }]);
    b.close();
    assert.deepEqual(await a.next((m) => m.gone), { from: userId('jonas'), conn: got.conn, gone: true });
  });

  it('delivers a burst whole and in order, the latest last', async () => {
    const a = open(ingrid);
    const b = open(jonas);
    await Promise.all([a.next((m) => m.ready), b.next((m) => m.ready)]);
    for (let n = 1; n <= 150; n++) b.send({ data: { n } });
    await a.next((m) => m.data?.n === 150);
    assert.deepEqual(a.seen.filter((m) => 'data' in m).map((m) => m.data.n), Array.from({ length: 149 }, (_, i) => i + 1));
  });
});
