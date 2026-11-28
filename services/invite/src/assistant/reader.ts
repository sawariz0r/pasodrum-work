// The per-ask reader (spec §3.2): built once per ask from the caller's token, on a function that can only GET. Every read
// passes the four checks per place; anything it cannot show is allowed is not read. Failures are null, never text.
import type { Mask } from './mask.ts';
import { LIMITS, type Ref } from './wire.ts';

export type HomeserverGet = (token: string, path: string, signal: AbortSignal) => Promise<{ status: number; body: unknown }>;
export type Kind = 'chat' | 'space' | 'project' | 'page' | 'other';
export type Role = 'team' | 'client' | 'external';
export type Where = { in: 'workspace' } | { in: 'client'; space: string } | { in: 'none' };
export type Place = { id: string; kind: Kind; name: string; where: Where };
export type Item = { kind: 'message'; place: string; from: string; role: Role; at: number; text: string; ref: Ref };
export type Read = { place: Place; items: Item[]; more?: string };

export type ReaderDeps = {
  get: HomeserverGet;
  /** The pinned workspace room; never resolved from #workspace, which any workspace Admin can repoint. */
  workspaceId: string | null;
  serverName: string;
  mask: Mask;
  isClientAccount: (userId: string) => boolean;
  isClientOf: (userId: string, spaceId: string) => boolean;
  /** The only thing kept between asks: a room's kind, from its create event, which never changes. */
  kinds: Map<string, Kind>;
  signal?: AbortSignal;
};

type Json = Record<string, unknown>;
type Ev = Json;
type State = { one(type: string, key?: string): Ev | undefined; of(type: string): Ev[] };
type Located = Place & { state: State };

const CALL_MS = 10_000;
const MAX_KINDS = 100_000;
const MAX_JOINED = 5_000;
const PAGE_LIMIT = 100;
const ROOM_ID = /^![\x21-\x7e]{1,254}$/;
const EVENT_ID = /^\$[\x21-\x7e]{1,254}$/;
const PROJECT = 'work.pasodrum.boards.project';
const PAGE = 'work.pasodrum.docs.page';
const EXTERNAL = 'work.pasodrum.external';
const MARK = 'work.pasodrum.ai';
const CONSENT = 'work.pasodrum.ai.consent';
const TEXT = new Set(['m.text', 'm.notice', 'm.emote']);
const enc = encodeURIComponent;
const v3 = (path: string) => `/_matrix/client/v3${path}`;
const v1 = (path: string) => `/_matrix/client/v1${path}`;

class Unreadable extends Error {
  constructor() {
    super('unreadable');
  }
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const contentOf = (e: Ev | undefined): Json => (e && isObj(e.content) ? e.content : {});
const relationOf = (c: Json): Json => (isObj(c['m.relates_to']) ? c['m.relates_to'] : {});
const hasVia = (e: Ev) => Array.isArray(contentOf(e).via) && (contentOf(e).via as unknown[]).length > 0;

function indexState(events: unknown[]): State {
  const byKey = new Map<string, Ev>();
  const byType = new Map<string, Ev[]>();
  for (const e of events) {
    if (!isObj(e) || typeof e.type !== 'string' || typeof e.state_key !== 'string') continue;
    byKey.set(`${e.type}\u0000${e.state_key}`, e);
    byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  }
  return { one: (type, key = '') => byKey.get(`${type}\u0000${key}`), of: (type) => byType.get(type) ?? [] };
}

const membershipIn = (s: State, user: string) => str(contentOf(s.one('m.room.member', user)).membership);
const joinedIn = (s: State, user: string) => membershipIn(s, user) === 'join';
const isExternal = (ws: State, user: string) => Object.keys(contentOf(ws.one(EXTERNAL, user.slice(1)))).length > 0;
const childrenOf = (s: State) => new Set(s.of('m.space.child').filter(hasVia).map((e) => e.state_key as string));

/** Splits an Element-style reply quote ("> <@user:server> quoted\n\nreply") off a plain body, as the app does. */
function stripReplyFallback(body: string): string {
  if (!body.startsWith('> ')) return body;
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i]!.startsWith('>')) i++;
  if (lines[i] === '') i++;
  return lines.slice(i).join('\n');
}

/** The plain text of a message as the app shows it, before edits; null for anything that is not a text message. */
function textOf(e: Ev): string | null {
  const c = contentOf(e);
  if (e.type !== 'm.room.message' || !TEXT.has(str(c.msgtype) ?? '') || typeof c.body !== 'string') return null;
  if (relationOf(c).rel_type === 'm.replace') return null;
  return c.body;
}

const isReply = (e: Ev) => {
  const rel = relationOf(contentOf(e));
  return isObj(rel['m.in_reply_to']) && rel.is_falling_back !== true;
};

/** An edit counts only for a target that was read, is not deleted and has the same sender, in the same room. */
function editedText(edit: unknown, target: Ev, room: string): string | null {
  if (!isObj(edit) || edit.type !== 'm.room.message' || edit.room_id !== room || edit.sender !== target.sender) return null;
  const c = contentOf(edit);
  const rel = relationOf(c);
  const next = isObj(c['m.new_content']) ? c['m.new_content'] : {};
  if (rel.rel_type !== 'm.replace' || rel.event_id !== target.event_id) return null;
  return TEXT.has(str(next.msgtype) ?? '') && typeof next.body === 'string' ? next.body : null;
}

const threadRootOf = (e: Ev) => {
  const rel = relationOf(contentOf(e));
  return rel.rel_type === 'm.thread' ? str(rel.event_id) : undefined;
};

export function openReader(deps: ReaderDeps, token: string) {
  const { get, kinds, mask } = deps;
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, f: () => Promise<T>): Promise<T> => {
    if (!memo.has(key)) memo.set(key, f());
    return memo.get(key) as Promise<T>;
  };

  async function call(path: string) {
    const timeout = AbortSignal.timeout(CALL_MS);
    try {
      return await get(token, path, deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout);
    } catch {
      throw new Unreadable();
    }
  }

  /** 200 is the body; 400, 403 and 404 mean this caller cannot read it; anything else is an error. */
  async function read(path: string): Promise<unknown> {
    const r = await call(path);
    if (r.status === 200) return r.body;
    if (r.status === 400 || r.status === 403 || r.status === 404) return null;
    throw new Unreadable();
  }

  async function need(path: string): Promise<Json> {
    const body = await read(path);
    if (!isObj(body)) throw new Unreadable();
    return body;
  }

  const whoami = () => once('whoami', async () => {
    const r = await call(v3('/account/whoami'));
    if (r.status === 401 || r.status === 403) return null;
    if (r.status !== 200 || !isObj(r.body) || typeof r.body.user_id !== 'string') throw new Unreadable();
    return r.body.user_id;
  });

  const resolve = async (alias: string) => {
    const body = await read(v3(`/directory/room/${enc(alias)}`));
    const id = isObj(body) ? str(body.room_id) : undefined;
    return id && ROOM_ID.test(id) ? id : null;
  };

  const stateOf = (room: string) => once(`state:${room}`, async () => {
    const body = await read(v3(`/rooms/${enc(room)}/state`));
    return Array.isArray(body) ? indexState(body) : null;
  });

  /** The pinned workspace room and its state as the caller sees it now. */
  const workspace = () => once('workspace', async () => {
    const id = deps.workspaceId && ROOM_ID.test(deps.workspaceId) ? deps.workspaceId : null;
    const state = id ? await stateOf(id) : null;
    return id && state ? { id, state } : null;
  });

  const adminRoom = () => once('admin', () => resolve(`#admins:${deps.serverName}`));

  async function kindOf(room: string, state?: State): Promise<Kind | null> {
    const known = kinds.get(room);
    if (known) return known;
    const create = state ? state.one('m.room.create') : { content: await read(v3(`/rooms/${enc(room)}/state/m.room.create/`)) };
    if (!create || !isObj(create.content)) return null;
    const type = create.content.type;
    const kind: Kind = type === undefined ? 'chat' : type === 'm.space' ? 'space' : type === PROJECT ? 'project' : type === PAGE ? 'page' : 'other';
    if (kinds.size >= MAX_KINDS) kinds.clear();
    kinds.set(room, kind);
    return kind;
  }

  async function roleOf(user: string): Promise<Role> {
    const ws = await workspace();
    if (!ws || deps.isClientAccount(user)) return 'client';
    if (joinedIn(ws.state, user)) return 'team';
    return isExternal(ws.state, user) ? 'external' : 'client';
  }

  /** D-53: the mark in the workspace's state, the answers in the client space's; fails closed. */
  const spaceOpen = (space: string) => once(`open:${space}`, async () => {
    try {
      const [me, ws, state] = await Promise.all([whoami(), workspace(), stateOf(space)]);
      if (!me || !ws || !state || space === ws.id || !joinedIn(state, me)) return false;
      const cover = contentOf(ws.state.one(MARK, space)).cover;
      let yes = 0;
      for (const e of state.of(CONSENT)) {
        const by = str(e.sender);
        if (!by || e.state_key !== by) continue;
        const counted = joinedIn(state, by) && !joinedIn(ws.state, by) && !isExternal(ws.state, by) && deps.isClientOf(by, space);
        if (!counted) continue;
        const answer = contentOf(e).answer;
        if (answer === 'no') return false;
        if (answer === 'yes') yes++;
      }
      return cover === 'terms' || (cover === 'ask' && yes > 0);
    } catch {
      return false;
    }
  });

  /** The caller's joined spaces other than the workspace, each with its state and whether it is open. Throws when any part fails. */
  const clientSpaces = () => once('spaces', async () => {
    const [me, ws] = await Promise.all([whoami(), workspace()]);
    const body = await need(v3('/joined_rooms'));
    const ids = body.joined_rooms;
    if (!me || !ws || !Array.isArray(ids) || ids.length > MAX_JOINED) throw new Unreadable();
    const spaces: { id: string; state: State; open: boolean }[] = [];
    const rooms = ids.filter((id): id is string => typeof id === 'string' && ROOM_ID.test(id) && id !== ws.id);
    for (let i = 0; i < rooms.length; i += 8) {
      await Promise.all(rooms.slice(i, i + 8).map(async (id) => {
        const kind = await kindOf(id);
        if (!kind) throw new Unreadable();
        if (kind !== 'space') return;
        const state = await stateOf(id);
        if (!state || !joinedIn(state, me)) throw new Unreadable();
        spaces.push({ id, state, open: await spaceOpen(id) });
      }));
    }
    return spaces;
  });

  /** Conversations outside any space: every member is team, an External, or a client of an open space the caller is in and of no closed one. */
  async function conversationReadable(room: string, state: State, ws: { id: string; state: State }): Promise<boolean> {
    const spaces = await clientSpaces();
    if (childrenOf(ws.state).has(room) || spaces.some((s) => childrenOf(s.state).has(room))) return false;
    for (const e of state.of('m.room.member')) {
      const user = e.state_key as string;
      const role = await roleOf(user);
      if (role !== 'client') continue;
      const inSpaces = spaces.filter((s) => ['join', 'invite'].includes(membershipIn(s.state, user) ?? ''));
      if (!inSpaces.some((s) => s.open) || inSpaces.some((s) => !s.open)) return false;
    }
    return true;
  }

  /** The placing rule: both links agree, exactly one space, and that space is the workspace or an open client space. */
  async function whereIs(room: string, kind: Kind, state: State, me: string, ws: { id: string; state: State }): Promise<Where | null> {
    if (kind === 'space') {
      if (room === ws.id) return { in: 'workspace' };
      return (await spaceOpen(room)) ? { in: 'client', space: room } : null;
    }
    const named = [...new Set(state.of('m.space.parent').filter(hasVia).map((e) => e.state_key as string))];
    if (!named.length) return kind === 'chat' && (await conversationReadable(room, state, ws)) ? { in: 'none' } : null;
    if (named.length !== 1 || !ROOM_ID.test(named[0]!)) return null;
    const home = named[0]!;
    const homeState = home === ws.id ? ws.state : await stateOf(home);
    if (!homeState || !joinedIn(homeState, me)) return null;
    const listed = kind === 'page' ? typeof contentOf(homeState.one(PAGE, room)).order === 'string' : childrenOf(homeState).has(room);
    if (!listed) return null;
    if (home === ws.id) return { in: 'workspace' };
    return (await spaceOpen(home)) ? { in: 'client', space: home } : null;
  }

  async function locate(room: string): Promise<Located | null> {
    const [me, ws, admin] = await Promise.all([whoami(), workspace(), adminRoom()]);
    if (!me || !ws || room === admin) return null;
    const state = await stateOf(room);
    if (!state || !joinedIn(state, me)) return null;
    if (state.of('m.room.encryption').length) return null;
    const kind = await kindOf(room, state);
    if (!kind || kind === 'other') return null;
    const where = await whereIs(room, kind, state, me, ws);
    if (!where) return null;
    return { id: room, kind, name: mask(str(contentOf(state.one('m.room.name')).name) ?? ''), where, state };
  }

  const located = (room: string): Promise<Located | null> =>
    ROOM_ID.test(room) ? once(`place:${room}`, () => locate(room).catch(() => null)) : Promise.resolve(null);

  async function checked(room: string, kind: Kind): Promise<Located | null> {
    const p = await located(room);
    return p && p.kind === kind ? p : null;
  }

  const fetchEvent = async (room: string, id: string): Promise<Ev | null> => {
    if (!EVENT_ID.test(id)) return null;
    const e = await read(v3(`/rooms/${enc(room)}/event/${enc(id)}`));
    return isObj(e) && e.room_id === room && e.event_id === id ? e : null;
  };

  /** For a message not reached in one unbroken scan back from the newest event: its newest edit by the same sender. */
  async function newestEdit(room: string, e: Ev): Promise<string | null> {
    const unsigned = isObj(e.unsigned) ? e.unsigned : {};
    const bundled = isObj(unsigned['m.relations']) ? unsigned['m.relations']['m.replace'] : undefined;
    const quick = editedText(bundled, e, room);
    if (quick !== null) return quick;
    const body = await need(v1(`/rooms/${enc(room)}/relations/${enc(e.event_id as string)}/m.replace?dir=b&limit=20`));
    const chunk = Array.isArray(body.chunk) ? body.chunk : [];
    for (const edit of chunk) {
      const text = editedText(edit, e, room);
      if (text !== null) return text;
    }
    return null;
  }

  async function itemOf(place: Located, e: Ev, text: string): Promise<Item | null> {
    const sender = str(e.sender);
    if (!sender || typeof e.event_id !== 'string') return null;
    const role = await roleOf(sender);
    // D-06: a client is never in a workspace channel; if one is there anyway, their own messages are skipped.
    if (place.where.in === 'workspace' && role === 'client') return null;
    const body = isReply(e) ? stripReplyFallback(text) : text;
    return {
      kind: 'message',
      place: place.name,
      from: mask(str(contentOf(place.state.one('m.room.member', sender)).displayname) ?? ''),
      role,
      at: typeof e.origin_server_ts === 'number' ? e.origin_server_ts : 0,
      text: mask(body).slice(0, LIMITS.itemChars),
      ref: { k: 'message', room: place.id, event: e.event_id },
    };
  }

  /** Messages fetched one by one or around a point: each gets its newest edit looked up. */
  async function itemsLookedUp(place: Located, events: Ev[]): Promise<Item[]> {
    const items: Item[] = [];
    for (const e of events) {
      const text = textOf(e);
      if (text === null) continue;
      const item = await itemOf(place, e, (await newestEdit(place.id, e)) ?? text);
      if (item) items.push(item);
    }
    return items;
  }

  const limitOf = (n: number | undefined) => Math.max(1, Math.min(PAGE_LIMIT, Math.floor(n ?? 50)));
  const guard = async <T>(f: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await f();
    } catch {
      return null;
    }
  };

  return {
    whoami,
    workspace: async () => (await workspace())?.id ?? null,
    /** The workspace state as read for the gate (the same read as the rest of this ask). */
    workspaceState: async () => (await workspace())?.state ?? null,

    /** Where a place lies and what it is, when it passes the four checks; null otherwise. */
    async placeOf(room: string): Promise<Place | null> {
      const p = await located(room);
      return p && strip(p);
    },

    async checkPlace(room: string, kind: Kind): Promise<Place | null> {
      const p = await checked(room, kind);
      return p && strip(p);
    },

    /** A channel's main timeline, newest first from the server, returned oldest first. `from` continues an older page. */
    readPlace: (room: string, opts: { limit?: number; from?: string } = {}) => guard(async (): Promise<Read | null> => {
      const place = await checked(room, 'chat');
      if (!place || (opts.from !== undefined && !/^[\x21-\x7e]{1,512}$/.test(opts.from))) return null;
      const from = opts.from === undefined ? '' : `&from=${enc(opts.from)}`;
      const body = await need(v3(`/rooms/${enc(room)}/messages?dir=b&limit=${limitOf(opts.limit)}${from}`));
      const events = (Array.isArray(body.chunk) ? body.chunk : []).filter((e): e is Ev => isObj(e) && e.room_id === room);
      const items: Item[] = [];
      if (opts.from === undefined) {
        // One unbroken scan back from the newest event holds every edit of what it reached.
        const edits = new Map<string, Ev[]>();
        for (const e of events) {
          const rel = relationOf(contentOf(e));
          if (rel.rel_type === 'm.replace' && typeof rel.event_id === 'string') edits.set(rel.event_id, [...(edits.get(rel.event_id) ?? []), e]);
        }
        for (const e of events) {
          const text = textOf(e);
          if (text === null || threadRootOf(e)) continue;
          let edited: string | null = null;
          for (const edit of edits.get(e.event_id as string) ?? []) if ((edited = editedText(edit, e, room)) !== null) break;
          const item = await itemOf(place, e, edited ?? text);
          if (item) items.push(item);
        }
      } else {
        items.push(...(await itemsLookedUp(place, events.filter((e) => !threadRootOf(e)))));
      }
      const more = str(body.end);
      return { place: strip(place), items: items.reverse(), ...(more ? { more } : {}) };
    }),

    /** A thread: the root first, then its replies, oldest first. */
    readThread: (room: string, root: string, opts: { limit?: number } = {}) => guard(async (): Promise<Read | null> => {
      const place = await checked(room, 'chat');
      if (!place) return null;
      const first = await fetchEvent(room, root);
      if (!first || textOf(first) === null || threadRootOf(first)) return null;
      const body = await need(v1(`/rooms/${enc(room)}/relations/${enc(root)}/m.thread?dir=b&limit=${limitOf(opts.limit)}`));
      const replies = (Array.isArray(body.chunk) ? body.chunk : [])
        .filter((e): e is Ev => isObj(e) && e.room_id === room && threadRootOf(e) === root)
        .reverse();
      return { place: strip(place), items: await itemsLookedUp(place, [first, ...replies]) };
    }),

    /** One message by id; refused when deleted or when the server's event names another room. */
    readEvent: (room: string, event: string) => guard(async (): Promise<Read | null> => {
      const place = await checked(room, 'chat');
      const e = place && (await fetchEvent(room, event));
      if (!place || !e || textOf(e) === null) return null;
      const items = await itemsLookedUp(place, [e]);
      return items.length ? { place: strip(place), items } : null;
    }),

    /** The messages around one message, oldest first. */
    readAround: (room: string, event: string, opts: { limit?: number } = {}) => guard(async (): Promise<Read | null> => {
      const place = await checked(room, 'chat');
      if (!place || !EVENT_ID.test(event)) return null;
      const body = await need(v3(`/rooms/${enc(room)}/context/${enc(event)}?limit=${Math.min(20, limitOf(opts.limit))}`));
      const center = isObj(body.event) ? body.event : null;
      if (!center || center.room_id !== room || center.event_id !== event || textOf(center) === null) return null;
      const list = (k: string) => (Array.isArray(body[k]) ? (body[k] as unknown[]) : []).filter((e): e is Ev => isObj(e) && e.room_id === room && !threadRootOf(e));
      return { place: strip(place), items: await itemsLookedUp(place, [...list('events_before').reverse(), center, ...list('events_after')]) };
    }),
  };
}

const strip = (p: Located): Place => ({ id: p.id, kind: p.kind, name: p.name, where: p.where });

export type Reader = ReturnType<typeof openReader>;
