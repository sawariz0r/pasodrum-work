// The Assistant's gate and reader (SIDE-14, spec §9 tests 1, 2, 3 server half, 4, 6, 11), run in this process against
// the local stack (pnpm dev:server, pnpm dev:seed). No provider exists yet, so "nothing sent" is what the reader returns.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { BASE, SEED_FILE, SERVER, enc, envToken, login, mx, ok, register, send, state, userId } from '../../../dev/lib.ts';
import { gate } from '../src/assistant/gate.ts';
import { createAssistant, type Assistant, type AssistantConfig } from '../src/assistant/index.ts';
import { masker } from '../src/assistant/mask.ts';
import { openReader, type HomeserverGet, type Kind, type Read } from '../src/assistant/reader.ts';
import { homeserverGet } from '../src/matrix.ts';
import { openStore } from '../src/store.ts';

const MARK = 'work.pasodrum.ai';
const CONSENT = 'work.pasodrum.ai.consent';
const EXTERNAL = 'work.pasodrum.external';
const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { rooms: { workspace: string } };
const W = seed.rooms.workspace;

const dir = mkdtempSync(join(tmpdir(), 'assistant-test-'));
const store = openStore(join(dir, 'invites.db'));
const config: AssistantConfig = {
  apiKey: 'not-a-key', quick: 'quick', thorough: 'thorough', prices: {}, dayUsd: 3, monthUsd: 100,
  dbPath: join(dir, 'assistant.db'), workspaceAlias: `#workspace:${SERVER}`, serverName: SERVER,
};

const calls: { token: string; path: string }[] = [];
let broken: ((path: string) => boolean) | null = null;
const real = homeserverGet(BASE);
const get: HomeserverGet = async (token, path, signal) => {
  calls.push({ token, path });
  if (broken?.(path)) return { status: 500, body: {} };
  return real(token, path, signal);
};
const kinds = new Map<string, Kind>();

/** One ask: a fresh reader, after the gate. */
async function ask(token: string) {
  const reader = openReader({ get, workspaceAlias: config.workspaceAlias, serverName: SERVER, mask: masker(SERVER), isClientAccount: store.clientAccount, isClientOf: store.clientOf, kinds }, token);
  const g = await gate(reader, store.clientAccount);
  assert.equal(typeof g, 'object', `gate: ${String(g)}`);
  return reader;
}

const texts = (r: Read | null) => r?.items.map((i) => i.text) ?? [];
const all = (r: Read | null) => JSON.stringify(r ?? null);

// Fixtures, made through the API.
type Who = { id: string; token: string };
let sofia: Who, ingrid: Who, jonas: Who, henrik: Who, lea: Who;

async function fresh(name: string): Promise<Who> {
  const localpart = `ast${randomBytes(4).toString('hex')}`;
  const token = await register(localpart, envToken());
  await ok(token, 'PUT', `/_matrix/client/v3/profile/${enc(userId(localpart))}/displayname`, { displayname: name });
  return { id: userId(localpart), token };
}

async function addTo(room: string, ...who: Who[]) {
  for (const w of who) {
    await ok(sofia.token, 'POST', `/_matrix/client/v3/rooms/${enc(room)}/invite`, { user_id: w.id });
    await ok(w.token, 'POST', `/_matrix/client/v3/join/${enc(room)}`, {});
  }
}
const leave = (w: Who, room: string) => ok(w.token, 'POST', `/_matrix/client/v3/rooms/${enc(room)}/leave`, {});

async function space(name: string, kind: 'client' | null = 'client'): Promise<string> {
  const b = await ok(sofia.token, 'POST', '/_matrix/client/v3/createRoom', {
    name, preset: 'private_chat', creation_content: { type: 'm.space' },
    // As Time will: the answer event is open to everyone in the space (spec §9 test 11).
    power_level_content_override: { users_default: 0, events: { [CONSENT]: 0 } },
    initial_state: kind ? [{ type: 'work.pasodrum.space', state_key: '', content: { kind } }] : [],
  });
  return b.room_id;
}

/** A channel with both links to each parent: the channel names the space and the space lists the channel. */
async function channel(name: string, parents: string[], ...members: Who[]): Promise<string> {
  const b = await ok(sofia.token, 'POST', '/_matrix/client/v3/createRoom', {
    name, preset: 'private_chat',
    initial_state: [
      ...parents.map((p) => ({ type: 'm.space.parent', state_key: p, content: { via: [SERVER] } })),
      { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'shared' } },
    ],
  });
  for (const p of parents) await state(sofia.token, p, 'm.space.child', b.room_id, { via: [SERVER] });
  await addTo(b.room_id, ...members);
  return b.room_id;
}

async function dm(from: Who, ...to: Who[]): Promise<string> {
  const b = await ok(from.token, 'POST', '/_matrix/client/v3/createRoom', { preset: 'trusted_private_chat', is_direct: true, invite: to.map((w) => w.id) });
  for (const w of to) await ok(w.token, 'POST', `/_matrix/client/v3/join/${enc(b.room_id)}`, {});
  return b.room_id;
}

const say = (w: Who, room: string, body: string, extra: object = {}) => send(w.token, room, { msgtype: 'm.text', body, ...extra });
const edit = (w: Who, room: string, target: string, body: string) =>
  send(w.token, room, { msgtype: 'm.text', body: `* ${body}`, 'm.new_content': { msgtype: 'm.text', body }, 'm.relates_to': { rel_type: 'm.replace', event_id: target } });
const redact = (w: Who, room: string, event: string) =>
  ok(w.token, 'PUT', `/_matrix/client/v3/rooms/${enc(room)}/redact/${enc(event)}/r${randomBytes(6).toString('hex')}`, {});

const mark = (by: Who, space: string, cover: 'terms' | 'ask' | null) =>
  mx(by.token, 'PUT', `/_matrix/client/v3/rooms/${enc(W)}/state/${MARK}/${enc(space)}`, cover ? { cover } : {});
const answer = (w: Who, space: string, a: 'yes' | 'no' | null) => state(w.token, space, CONSENT, w.id, a ? { answer: a } : {});

function invited(user: string, spaceId: string, role: 'client' | 'staff' | 'external') {
  const ts = Date.now();
  store.insert({
    code: randomBytes(8).toString('hex'), email: `${randomBytes(3).toString('hex')}@example.com`, name: null, role, userId: user, spaceId,
    spaceName: 'X', spaceKind: role === 'client' ? 'client' : 'workspace', inviterId: sofia.id, inviterName: 'Sofia', team: [], rooms: [spaceId],
    locale: 'en', secret: null, createdTs: ts, expiresTs: ts + 1e9, claimedTs: ts, revokedTs: null,
  });
}

async function setLevel(user: string, level: number) {
  const pl = await ok(sofia.token, 'GET', `/_matrix/client/v3/rooms/${enc(W)}/state/m.room.power_levels/`);
  await ok(sofia.token, 'PUT', `/_matrix/client/v3/rooms/${enc(W)}/state/m.room.power_levels/`, { ...pl, users: { ...pl.users, [user]: level } });
}

async function serve(a: Assistant): Promise<{ http: string; ws: string; server: Server }> {
  const server = createServer(async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://x').pathname.split('/').slice(3);
    const r = await a.route(req, parts, { name: '?' });
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(r.body === undefined ? undefined : JSON.stringify(r.body));
  });
  server.on('upgrade', (req, socket, head) => {
    if (!a.upgrade(req, socket, head)) socket.destroy();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { http: `http://127.0.0.1:${port}/api/assistant`, ws: `ws://127.0.0.1:${port}/api/assistant/ask`, server };
}

type Sock = { seen: any[]; send(m: unknown): void; closed: Promise<number> };
function connect(url: string, first?: unknown): Sock {
  const ws = new WebSocket(url);
  const seen: any[] = [];
  ws.onopen = () => first !== undefined && ws.send(typeof first === 'string' ? first : JSON.stringify(first));
  ws.onmessage = (e) => seen.push(JSON.parse(String(e.data)));
  ws.onerror = () => {};
  return {
    seen,
    send: (m) => ws.send(JSON.stringify(m)),
    closed: new Promise((r) => (ws.onclose = (e) => r(e.code))),
  };
}
const auth = (token: string) => ({ t: 'auth', token, v: 1 });

let on: Awaited<ReturnType<typeof serve>>, off: Awaited<ReturnType<typeof serve>>, shut: Awaited<ReturnType<typeof serve>>;
const assistants: Assistant[] = [];
const makeAssistant = (c: AssistantConfig | null, allowIp = () => true) => {
  const a = createAssistant({ get, config: c, isClientAccount: store.clientAccount, isClientOf: store.clientOf, allowIp });
  assistants.push(a);
  return a;
};

before(async () => {
  const [s, i, j, h, l] = await Promise.all(['sofia', 'ingrid', 'jonas', 'henrik_nordlys.no', 'lea_freelance.dev'].map((n) => login(n)));
  sofia = { id: userId('sofia'), token: s! };
  ingrid = { id: userId('ingrid'), token: i! };
  jonas = { id: userId('jonas'), token: j! };
  henrik = { id: userId('henrik_nordlys.no'), token: h! };
  lea = { id: userId('lea_freelance.dev'), token: l! };
  on = await serve(makeAssistant(config));
  off = await serve(makeAssistant(null));
  shut = await serve(makeAssistant(config, () => false));
});

after(() => {
  for (const a of assistants) a.close();
  for (const s of [on, off, shut]) s?.server.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('test 1: the gate', () => {
  let locked: Who, clientInWorkspace: Who, externalInWorkspace: Who;
  before(async () => {
    [locked, clientInWorkspace, externalInWorkspace] = await Promise.all([fresh('Locked'), fresh('Client in workspace'), fresh('External in workspace')]);
    await addTo(W, locked, clientInWorkspace);
    const lock = await mx(sofia.token, 'PUT', `/_matrix/client/v1/admin/lock/${enc(locked.id)}`, { locked: true });
    assert.equal(lock.status, 200, 'sofia locks accounts (server admin)');
    invited(clientInWorkspace.id, '!client-space:x', 'client');
    await state(sofia.token, W, EXTERNAL, externalInWorkspace.id.slice(1), { roles: [], channels: [] });
    await addTo(W, externalInWorkspace);
  });

  const status = async (s: { http: string }, token: string | null) => {
    const r = await fetch(`${s.http}/status`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: r.status, body: await r.json() };
  };

  it('answers Staff, and 503 without its configuration', async () => {
    assert.deepEqual(await status(on, jonas.token), { status: 200, body: { ask: 'ok', thorough: 'ok' } });
    assert.deepEqual(await status(off, jonas.token), { status: 503, body: { error: 'not-configured' } });
    assert.equal((await fetch(`${on.http}/status`, { method: 'POST' })).status, 405);
  });

  it('refuses on status: no token, a client, an External, a locked account, a client in the workspace, an External in the workspace, a homeserver error', async () => {
    assert.equal((await status(on, null)).status, 401);
    assert.equal((await status(on, 'not-a-token')).status, 401);
    assert.equal((await status(on, henrik.token)).status, 403);
    assert.equal((await status(on, lea.token)).status, 403);
    assert.equal((await status(on, locked.token)).status, 401);
    assert.equal((await status(on, clientInWorkspace.token)).status, 403);
    assert.equal((await status(on, externalInWorkspace.token)).status, 403);
    broken = (p) => p === `/_matrix/client/v3/rooms/${enc(W)}/state`;
    try {
      assert.equal((await status(on, jonas.token)).status, 503);
      broken = (p) => p.endsWith('/account/whoami');
      assert.equal((await status(on, jonas.token)).status, 503);
    } finally {
      broken = null;
    }
  });

  it('refuses on the socket the same way, and admits Staff only as far as hello', async () => {
    const staff = connect(on.ws, auth(jonas.token));
    await new Promise((r) => setTimeout(r, 300));
    staff.send({ t: 'hello', ask: 'hi', lang: 'en', tz: 60, depth: 'quick', context: null, history: [], can: { parts: [], proposals: [], views: [] } });
    assert.equal(await staff.closed, 1000);
    assert.deepEqual(staff.seen, [{ t: 'error', reason: 'unavailable' }]);

    assert.equal(await connect(on.ws, { t: 'auth', v: 1 }).closed, 4401);
    assert.equal(await connect(on.ws, auth('not-a-token')).closed, 4401);
    assert.equal(await connect(on.ws, auth(locked.token)).closed, 4401);
    for (const w of [henrik, lea, clientInWorkspace, externalInWorkspace]) {
      const s = connect(on.ws, auth(w.token));
      assert.equal(await s.closed, 4403);
      assert.deepEqual(s.seen, []);
    }
    broken = (p) => p === `/_matrix/client/v3/rooms/${enc(W)}/state`;
    try {
      const s = connect(on.ws, auth(jonas.token));
      assert.equal(await s.closed, 1011);
      assert.deepEqual(s.seen, [{ t: 'error', reason: 'unavailable' }]);
    } finally {
      broken = null;
    }
  });

  it('holds the limits before the gate: a first message over 4 KiB, a message out of turn, the per-IP limit, no configuration', async () => {
    const before = calls.length;
    assert.equal(await connect(on.ws, JSON.stringify({ ...auth(jonas.token), pad: 'x'.repeat(5000) })).closed, 1009);
    assert.equal(await connect(on.ws, { t: 'hello' }).closed, 4401);
    assert.equal(calls.length, before, 'nothing was read');
    const limited = connect(shut.ws, auth(jonas.token));
    assert.equal(await limited.closed, 1006);
    assert.deepEqual(limited.seen, []);
    const unconfigured = connect(off.ws, auth(jonas.token));
    assert.equal(await unconfigured.closed, 1000);
    assert.deepEqual(unconfigured.seen, [{ t: 'error', reason: 'unavailable' }]);
  });

  it('writes nothing to its database', () => {
    const db = new DatabaseSync(config.dbPath);
    assert.deepEqual({ ...db.prepare('SELECT count(*) AS n FROM sqlite_master').get() }, { n: 0 });
    db.close();
  });
});

describe('tests 2, 3, 4 and 6: who reads what', () => {
  let X: string, xChan: string, xEvent: string;
  before(async () => {
    X = await space('Assistant test X');
    await mark(ingrid, X, 'terms');
    await addTo(X, ingrid);
    xChan = await channel('x-channel', [X], ingrid);
    xEvent = await say(ingrid, xChan, 'x-secret plans');
  });

  it('test 2: refs into a client space the caller is not in are refused, as context, find hits or history', async () => {
    const r = await ask(jonas.token);
    assert.equal(await r.readPlace(xChan), null);
    assert.equal(await r.readEvent(xChan, xEvent), null);
    assert.equal(await r.readAround(xChan, xEvent), null);
    assert.equal(await r.readThread(xChan, xEvent), null);
    assert.equal(await r.placeOf(X), null);
    assert.ok(texts(await (await ask(ingrid.token)).readPlace(xChan)).includes('x-secret plans'), 'a member reads it');
  });

  it('test 2: an event id from a conversation the caller left, asked for through one they are in', async () => {
    const mine = await channel('joined', [W], jonas);
    await say(jonas, mine, 'mine');
    const left = await channel('left', [W], jonas);
    const secret = await say(sofia, left, 'left-secret');
    await leave(jonas, left);
    const r = await ask(jonas.token);
    for (const read of [r.readEvent(mine, secret), r.readAround(mine, secret), r.readThread(mine, secret), r.readEvent(left, secret), r.readPlace(left)]) {
      const got = await read;
      assert.equal(got, null);
      assert.ok(!all(got).includes('left-secret'));
    }
    assert.deepEqual(texts(await r.readPlace(mine)), ['mine']);
  });

  it('test 3: a plain conversation that was then encrypted gives nothing, the earlier plain messages included', async () => {
    const room = await channel('encrypted-later', [W], jonas);
    const plain = await say(jonas, room, 'plain before encryption');
    assert.deepEqual(texts(await (await ask(jonas.token)).readPlace(room)), ['plain before encryption']);
    await state(sofia.token, room, 'm.room.encryption', '', { algorithm: 'm.megolm.v1.aes-sha2' });
    const r = await ask(jonas.token);
    assert.equal(await r.readPlace(room), null);
    assert.equal(await r.readEvent(room, plain), null);
    assert.equal(await r.readAround(room, plain), null);
  });

  it('test 4: read, then refused after leaving; a workspace channel with an External is read (D-50)', async () => {
    const room = await channel('leave-later', [W], jonas);
    const ev = await say(sofia, room, 'before leaving');
    assert.deepEqual(texts(await (await ask(jonas.token)).readEvent(room, ev)), ['before leaving']);
    await leave(jonas, room);
    const r = await ask(jonas.token);
    assert.equal(await r.readEvent(room, ev), null);
    assert.equal(await r.readPlace(room), null);

    const withExternal = await channel('with-external', [W], jonas, lea);
    await say(lea, withExternal, 'from the External');
    const got = await (await ask(jonas.token)).readPlace(withExternal);
    assert.deepEqual(got?.items.map((i) => [i.text, i.role]), [['from the External', 'external']]);
  });

  it('test 6: deleted, edited then deleted, edited to remove a word, a forged edit, a reply; never-joined refs', async () => {
    const room = await channel('edits', [W], jonas, ingrid);
    const deleted = await say(jonas, room, 'deleted-text');
    await redact(jonas, room, deleted);
    const both = await say(jonas, room, 'edited-then-deleted original');
    const bothEdit = await edit(jonas, room, both, 'edited-then-deleted new');
    await redact(jonas, room, both);
    const removed = await say(jonas, room, 'remove PINEAPPLE please');
    await edit(jonas, room, removed, 'remove please');
    const theirs = await say(ingrid, room, 'ingrid original');
    await edit(jonas, room, theirs, 'jonas forged');
    await say(jonas, room, `> <${ingrid.id}> ingrid original\n\nmy reply`, { 'm.relates_to': { 'm.in_reply_to': { event_id: theirs } } });
    for (let n = 0; n < 4; n++) await say(ingrid, room, `filler ${n}`);

    const r = await ask(jonas.token);
    const scan = await r.readPlace(room);
    assert.deepEqual(texts(scan), ['remove please', 'ingrid original', 'my reply', 'filler 0', 'filler 1', 'filler 2', 'filler 3']);

    // Older pages are not one unbroken scan: each message gets its newest edit looked up.
    const paged: string[] = [];
    let from: string | undefined;
    for (let n = 0; n < 30; n++) {
      const page = await r.readPlace(room, { limit: 2, ...(from ? { from } : {}) });
      assert.ok(page);
      paged.unshift(...texts(page));
      if (!page.more || page.more === from) break;
      from = page.more;
    }
    assert.deepEqual(paged, texts(scan));

    assert.deepEqual(texts(await r.readEvent(room, removed)), ['remove please']);
    assert.ok(texts(await r.readAround(room, removed)).includes('remove please'));
    for (const read of [r.readEvent(room, deleted), r.readEvent(room, both), r.readEvent(room, bothEdit)]) assert.equal(await read, null);
    const everything = [scan, await r.readAround(room, removed), await r.readAround(room, theirs)].map(all).join('\n');
    for (const gone of ['deleted-text', 'edited-then-deleted', 'PINEAPPLE', 'jonas forged', '* ']) assert.ok(!everything.includes(gone), gone);

    const never = await channel('never-joined', [W], ingrid);
    const nev = await say(ingrid, never, 'never-joined text');
    assert.equal(await r.readEvent(never, nev), null);
    assert.equal(await r.readPlace(never), null);
    assert.equal(await r.readEvent(room, nev), null);
  });

  it('masks text and names: ids, the server name, links, emails, code', async () => {
    const mailName = await fresh('someone@example.com');
    await addTo(W, mailName);
    const room = await channel('masked', [W], jonas, mailName);
    await say(mailName, room, `ping @ingrid:${SERVER} on ${SERVER}, see https://x.example/a or www.y.example, mail a.b@c.example, in ${room}\n\`\`\`\nsecret();\n\`\`\``);
    const [item] = (await (await ask(jonas.token)).readPlace(room))?.items ?? [];
    assert.ok(item);
    assert.equal(item.from, '[email]');
    assert.equal(item.text, 'ping on , see [link] or [link], mail [email], in\n[code]');
    assert.ok(!JSON.stringify({ ...item, ref: null }).includes(SERVER));
  });
});

describe('test 11: the client-space check (D-53)', () => {
  let X: string, xChan: string, xEvent: string, c1: Who;
  const see = async () => {
    const r = await ask(jonas.token);
    const got = [await r.readPlace(xChan), await r.readEvent(xChan, xEvent), await r.readAround(xChan, xEvent), await r.placeOf(X)];
    const open = got.every((g) => g !== null);
    assert.ok(open || got.every((g) => g === null), 'every path agrees');
    if (!open) assert.ok(!got.map((g) => JSON.stringify(g)).join().includes('x-text'));
    return open;
  };

  before(async () => {
    X = await space('Assistant test closed');
    c1 = await fresh('Client One');
    invited(c1.id, X, 'client');
    await addTo(X, jonas, c1);
    xChan = await channel('x-chan', [X], jonas, c1);
    xEvent = await say(c1, xChan, 'x-text from the client');
  });

  it('the mark: none, terms, ask, written by an Admin who is then demoted, Staff writing it', async () => {
    assert.equal(await see(), false);
    await mark(ingrid, X, 'terms');
    assert.equal(await see(), true);
    await mark(ingrid, X, 'ask');
    assert.equal(await see(), false);

    const admin = await fresh('Admin then demoted');
    await addTo(W, admin);
    await setLevel(admin.id, 50);
    assert.equal((await mark(admin, X, 'terms')).status, 200);
    await setLevel(admin.id, 10);
    assert.equal(await see(), true);

    assert.equal((await mark(jonas, X, 'ask')).status, 403);
    assert.equal(await see(), true);
    await mark(ingrid, X, 'ask');
  });

  it('the answers: none, no, yes, yes then no, terms with a no', async () => {
    assert.equal(await see(), false);
    await answer(c1, X, 'no');
    assert.equal(await see(), false);
    await answer(c1, X, 'yes');
    assert.equal(await see(), true);
    await answer(c1, X, 'no');
    assert.equal(await see(), false);
    await mark(ingrid, X, 'terms');
    assert.equal(await see(), false);
    await mark(ingrid, X, 'ask');
    await answer(c1, X, null);
  });

  it('a yes counts from none of: a team member, an External, a former client on the team, another space\'s client, a client who left', async () => {
    await answer(jonas, X, 'yes');
    assert.equal(await see(), false);
    await answer(jonas, X, null);

    await addTo(X, lea);
    await answer(lea, X, 'yes');
    assert.equal(await see(), false);
    await answer(lea, X, null);

    const former = await fresh('Former client');
    invited(former.id, X, 'client');
    await addTo(X, former);
    await addTo(W, former);
    await answer(former, X, 'yes');
    assert.equal(await see(), false);

    const other = await fresh('Other space client');
    invited(other.id, '!other-space:x', 'client');
    await addTo(X, other);
    await answer(other, X, 'yes');
    assert.equal(await see(), false);

    const c2 = await fresh('Client Two');
    invited(c2.id, X, 'client');
    await addTo(X, c2);
    await answer(c2, X, 'yes');
    assert.equal(await see(), true);
    await leave(c2, X);
    assert.equal(await see(), false);
  });

  it('placing: unlisted by its space, left behind by a deleted client space, listed by two spaces', async () => {
    const unlisted = await channel('unlisted-later', [W], jonas);
    await say(jonas, unlisted, 'unlisted');
    assert.ok(await (await ask(jonas.token)).readPlace(unlisted));
    await state(sofia.token, W, 'm.space.child', unlisted, {});
    assert.equal(await (await ask(jonas.token)).readPlace(unlisted), null);

    const gone = await space('Assistant test deleted');
    await mark(ingrid, gone, 'terms');
    await addTo(gone, jonas);
    const leftBehind = await channel('left-behind', [gone], jonas);
    await say(jonas, leftBehind, 'left behind');
    assert.ok(await (await ask(jonas.token)).readPlace(leftBehind));
    await leave(jonas, gone);
    assert.equal(await (await ask(jonas.token)).readPlace(leftBehind), null);

    const open = await space('Assistant test open');
    await mark(ingrid, open, 'terms');
    await addTo(open, jonas);
    const twice = await channel('in-two', [W, open], jonas);
    await say(jonas, twice, 'in two spaces');
    assert.equal(await (await ask(jonas.token)).readPlace(twice), null);
  });

  it('conversations: a DM and a group DM with a client of a closed space, a DM with a client of a space the caller left, a client in a workspace channel', async () => {
    const direct = await dm(jonas, c1);
    await say(c1, direct, 'dm text');
    const group = await dm(jonas, ingrid, c1);
    await say(c1, group, 'group text');
    let r = await ask(jonas.token);
    assert.equal(await r.readPlace(direct), null);
    assert.equal(await r.readPlace(group), null);
    await mark(ingrid, X, 'terms');
    r = await ask(jonas.token);
    assert.deepEqual(texts(await r.readPlace(direct)), ['dm text']);
    assert.deepEqual((await r.readPlace(direct))?.place.where, { in: 'none' });
    await mark(ingrid, X, 'ask');

    const X3 = await space('Assistant test left');
    await mark(ingrid, X3, 'terms');
    const c3 = await fresh('Client Three');
    invited(c3.id, X3, 'client');
    await addTo(X3, jonas, c3);
    const third = await dm(jonas, c3);
    await say(c3, third, 'third text');
    assert.ok(await (await ask(jonas.token)).readPlace(third));
    await leave(jonas, X3);
    assert.equal(await (await ask(jonas.token)).readPlace(third), null);

    const wsChannel = await channel('client-in-workspace', [W], jonas, c1);
    await say(c1, wsChannel, 'client in a workspace channel');
    await say(jonas, wsChannel, 'Nordlys wants the review on Thursday');
    const got = await (await ask(jonas.token)).readPlace(wsChannel);
    assert.deepEqual(texts(got), ['Nordlys wants the review on Thursday']);
  });

  it('errors: the homeserver fails while the client space is read; a workspace channel about the client is still read', async () => {
    await mark(ingrid, X, 'terms');
    const about = await channel('about-the-client', [W], jonas);
    await say(jonas, about, 'X is late on the invoice');
    assert.equal(await see(), true);
    broken = (p) => p === `/_matrix/client/v3/rooms/${enc(X)}/state`;
    try {
      assert.equal(await see(), false);
      assert.deepEqual(texts(await (await ask(jonas.token)).readPlace(about)), ['X is late on the invoice']);
    } finally {
      broken = null;
      await mark(ingrid, X, 'ask');
    }
  });

  it('every homeserver call went through the GET-only function, under /_matrix/client/, with a token', () => {
    assert.ok(calls.length > 0);
    for (const c of calls) assert.ok(c.path.startsWith('/_matrix/client/') && c.token, c.path);
  });
});
