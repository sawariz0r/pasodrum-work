// Docs and Boards over Matrix (D-37, build plan §1–§4). Its own snapshot and listeners; WorkspaceSnapshot is untouched.
// Loaded after the first sync (docsBoards.ts); yjs and fractional-indexing load later still (docsProvider.ts, order.ts).
import {
  ClientEvent,
  EventType,
  KnownMembership,
  Method,
  Preset,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  Visibility,
  type IEvent,
  type MatrixEvent,
  type RoomMember,
  type Room,
} from 'matrix-js-sdk';
import { byOrder, DEFAULT_COLUMNS, type Column, type DocsBoards, type DocsBoardsSnapshot, type Issue, type IssueChange, type PageNode, type PageSession, type Project, type SpacePages } from './docsBoardsTypes';
import type { DocsBoardsContext } from './docsBoards';
import type { PageCore } from './docsProvider';
import { channelUsers, LEVEL, PAGES, powerLevels } from './levels';
import { hydra, share } from './map';
import type { Person } from './types';

/** Space state (key = page room id) and the page room's type. */
const PAGE = PAGES;
const SNAPSHOT = 'work.pasodrum.docs.snapshot';
/** Project room type and its `{key, colour}` state. */
const PROJECT = 'work.pasodrum.boards.project';
const COLUMNS = 'work.pasodrum.boards.columns';
const ISSUE = 'work.pasodrum.boards.issue';
const DESCRIPTION = 'work.pasodrum.boards.description';
const SPACE_STATE = 'work.pasodrum.space';
const WATCHED = new Set<string>([PAGE, PROJECT, COLUMNS, ISSUE, DESCRIPTION, EventType.RoomPowerLevels, EventType.RoomName, EventType.SpaceChild, EventType.SpaceParent, EventType.RoomCreate]);
const LEAVE_AFTER = 5 * 60_000;
/** A write's own echo normally clears its overlay; this is the backstop. */
const OVERLAY_MAX = 20_000;
const TYPING_TIMEOUT = 8_000;
const TYPING_RESEND = 4_000;
const TYPING_IDLE = 5_000;
const CHANGES_SCAN = 300;
const FALLBACK_COLOUR = '#0F766E';
const enc = encodeURIComponent;
const noop = () => {};

type Content = Record<string, unknown>;
type CoreEntry = { core: Promise<PageCore>; refs: number; timer?: ReturnType<typeof setTimeout>; loaded?: PageCore };


const joined = (r: Room | null | undefined): r is Room => r?.getMyMembership() === KnownMembership.Join;
const contentOf = (ev: MatrixEvent | null | undefined): Content => (ev?.getContent() ?? {}) as Content;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const isClientSpace = (space: Room) => contentOf(space.currentState.getStateEvents(SPACE_STATE, '')).kind === 'client';
const live = (c: Content) => typeof c.order === 'string';
const canonical = (v: unknown) =>
  JSON.stringify(v, (_, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Content).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  );
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const txnId = () => `pd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Everything but links and presence, which docsBoards.ts answers without loading this. */
export type DocsBoardsCore = Omit<DocsBoards, 'pageLink' | 'issueLink' | 'presence'>;

export function createDocsBoardsCore(ctx: DocsBoardsContext): DocsBoardsCore {
  const { client, userId, server, person, ready } = ctx;
  const listeners = new Set<() => void>();
  /** State I wrote, by `room|type|key`, shown until the server's copy matches (optimistic moves, renames, creates). */
  const overlays = new Map<string, Content>();
  /** Projects found through /hierarchy, by room id. */
  const listed = new Map<string, { spaceId: string; name: string }>();
  const refused = new Set<string>();
  const ensured = new Set<string>();
  const cores = new Map<string, CoreEntry>();
  const typingSent = new Map<string, { at: number; idle: ReturnType<typeof setTimeout> }>();
  /** The highest issue number I handed out, by project. */
  const numbered = new Map<string, number>();
  let ensuring: Promise<void> | null = null;
  let stopped = false;

  const keyOf = (roomId: string, type: string, stateKey: string) => `${roomId}|${type}|${stateKey}`;
  const stateOf = (room: Room, type: string, stateKey: string): Content =>
    overlays.get(keyOf(room.roomId, type, stateKey)) ?? contentOf(room.currentState.getStateEvents(type, stateKey));
  /** Every state key of a type, with my overlays on top. */
  const allOf = (room: Room, type: string): Map<string, { content: Content; pending: boolean }> => {
    const out = new Map<string, { content: Content; pending: boolean }>();
    for (const ev of room.currentState.getStateEvents(type)) out.set(ev.getStateKey() ?? '', { content: contentOf(ev), pending: false });
    const prefix = keyOf(room.roomId, type, '');
    for (const [k, content] of overlays) if (k.startsWith(prefix)) out.set(k.slice(prefix.length), { content, pending: true });
    return out;
  };
  const spacesJoined = () => client.getRooms().filter((r) => joined(r) && r.isSpaceRoom());

  // Snapshot
  const pagesOf = (space: Room): SpacePages => {
    const nodes = new Map<string, PageNode>();
    for (const [id, { content: c, pending }] of allOf(space, PAGE)) {
      if (!live(c)) continue;
      const parent = str(c.parent);
      nodes.set(id, {
        id,
        spaceId: space.roomId,
        title: typeof c.title === 'string' ? c.title : '',
        ...(parent ? { parent } : {}),
        order: c.order as string,
        children: [],
        linksTo: Array.isArray(c.links) ? c.links.filter((l): l is string => typeof l === 'string') : [],
        ...(pending ? { pending: true } : {}),
      });
    }
    // Concurrent moves can make a loop (A under B, B under A); the loop's lowest id shows at the top level instead.
    const up = (n: PageNode) => (n.parent && n.parent !== n.id && nodes.has(n.parent) ? n.parent : undefined);
    const broken = new Set<string>();
    for (const n of nodes.values()) {
      const path: string[] = [];
      for (let at: string | undefined = n.id; at && !broken.has(at); at = up(nodes.get(at)!)) {
        const i = path.indexOf(at);
        if (i >= 0) {
          broken.add(path.slice(i).sort()[0]!);
          break;
        }
        path.push(at);
      }
    }
    const roots: PageNode[] = [];
    for (const n of nodes.values()) {
      const parent = broken.has(n.id) ? undefined : up(n);
      if (parent) nodes.get(parent)!.children.push(n);
      else roots.push(n);
    }
    const sortAll = (list: PageNode[]) => {
      list.sort(byOrder);
      list.forEach((n) => sortAll(n.children));
    };
    sortAll(roots);
    return { spaceId: space.roomId, roots, canCreate: space.currentState.maySendStateEvent(PAGE, userId) };
  };

  const columnsOf = (room: Room): Column[] => {
    const raw = stateOf(room, COLUMNS, '').columns;
    const list = Array.isArray(raw) ? raw.filter((c): c is Content => !!c && typeof c === 'object' && typeof (c as Content).id === 'string') : [];
    return list.length ? list.map((c) => ({ id: c.id as string, ...(str(c.title) ? { title: c.title as string } : {}) })) : DEFAULT_COLUMNS.map((id) => ({ id }));
  };

  const issuesOf = (room: Room): Issue[] => {
    const out: Issue[] = [];
    for (const [id, { content: c, pending }] of allOf(room, ISSUE)) {
      if (!live(c) || typeof c.column !== 'string') continue;
      const assignee = str(c.assignee);
      const due = str(c.due);
      out.push({
        id,
        projectId: room.roomId,
        n: typeof c.n === 'number' ? c.n : 0,
        title: typeof c.title === 'string' ? c.title : '',
        column: c.column,
        ...(assignee ? { assignee: person(assignee, room.roomId) } : {}),
        ...(due ? { due } : {}),
        order: c.order as string,
        ...(pending ? { pending: true } : {}),
      });
    }
    return out.sort(byOrder);
  };

  const spaceOfProject = (room: Room) => {
    const mine = new Set(spacesJoined().map((s) => s.roomId));
    const fromList = listed.get(room.roomId)?.spaceId;
    if (fromList && mine.has(fromList)) return fromList;
    return room.currentState
      .getStateEvents(EventType.SpaceParent)
      .map((e) => e.getStateKey()!)
      .find((id) => mine.has(id));
  };

  const projectOf = (room: Room, spaceId: string): Project => {
    const meta = stateOf(room, PROJECT, '');
    return {
      id: room.roomId,
      spaceId,
      name: str(contentOf(room.currentState.getStateEvents(EventType.RoomName, '')).name) ?? listed.get(room.roomId)?.name ?? '',
      key: str(meta.key) ?? '',
      colour: str(meta.colour) ?? FALLBACK_COLOUR,
      columns: columnsOf(room),
      issues: issuesOf(room),
      loading: !room.currentState.getStateEvents(EventType.RoomCreate, ''),
      canAddColumn: room.currentState.maySendStateEvent(COLUMNS, userId),
    };
  };

  const projectsOf = (): Record<string, Project[]> => {
    const out: Record<string, Project[]> = {};
    for (const id of ensured) out[id] = [];
    const seen = new Set<string>();
    for (const room of client.getRooms()) {
      if (!joined(room) || room.getType() !== PROJECT) continue;
      const spaceId = spaceOfProject(room);
      if (!spaceId) continue;
      seen.add(room.roomId);
      (out[spaceId] ??= []).push(projectOf(room, spaceId));
    }
    for (const [id, { spaceId, name }] of listed) {
      if (seen.has(id) || refused.has(id) || !out[spaceId]) continue;
      out[spaceId].push({ id, spaceId, name, key: '', colour: FALLBACK_COLOUR, columns: [], issues: [], loading: true, canAddColumn: false });
    }
    for (const list of Object.values(out)) list.sort(byName);
    return out;
  };

  const typingOf = (roomId: string): Person[] =>
    (client.getRoom(roomId)?.currentState.getMembers() ?? [])
      .filter((m) => m.typing && m.userId !== userId)
      .map((m) => person(m.userId, roomId))
      .sort(byName);

  const build = (): DocsBoardsSnapshot => {
    const pages: Record<string, SpacePages> = {};
    for (const space of spacesJoined()) pages[space.roomId] = pagesOf(space);
    const typing: Record<string, Person[]> = {};
    for (const id of cores.keys()) {
      const people = typingOf(id);
      if (people.length) typing[id] = people;
    }
    return { pages, projects: projectsOf(), typing };
  };

  let snapshot = build();
  let scheduled = false;
  let force = false;
  /** `notify`: tell subscribers even if the snapshot is unchanged (descriptions live outside it). */
  const schedule = (notify = false) => {
    force ||= notify;
    if (scheduled || stopped) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const next = share(snapshot, build());
      const forced = force;
      force = false;
      if (next === snapshot && !forced) return;
      snapshot = next;
      listeners.forEach((l) => l());
    });
  };

  // Listeners
  const onState = (ev: MatrixEvent) => {
    const type = ev.getType();
    if (!WATCHED.has(type)) return;
    const k = keyOf(ev.getRoomId() ?? '', type, ev.getStateKey() ?? '');
    const mine = overlays.get(k);
    if (mine && canonical(mine) === canonical(ev.getContent())) overlays.delete(k);
    schedule(type === DESCRIPTION);
  };
  const onRoom = () => schedule();
  const onTyping = (_ev: MatrixEvent, member: RoomMember) => {
    if (cores.has(member.roomId)) schedule();
  };
  client.on(RoomStateEvent.Events, onState);
  client.on(RoomEvent.MyMembership, onRoom);
  client.on(ClientEvent.Room, onRoom);
  client.on(RoomMemberEvent.Typing, onTyping);

  void ready.then(() => {
    if (!stopped) schedule();
  });

  const whenJoined = (roomId: string) =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (joined(client.getRoom(roomId))) done();
      };
      const done = () => {
        client.off(ClientEvent.Room, check);
        client.off(RoomEvent.MyMembership, check);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 10_000);
      client.on(ClientEvent.Room, check);
      client.on(RoomEvent.MyMembership, check);
      check();
    });

  /** Writes full content (last write wins) and shows it at once; a rejection takes the local copy back. */
  const write = async (roomId: string, type: string, stateKey: string, content: Content) => {
    const k = keyOf(roomId, type, stateKey);
    overlays.set(k, content);
    schedule(type === DESCRIPTION);
    try {
      await client.sendStateEvent(roomId, type as never, content as never, stateKey);
    } catch (e) {
      if (overlays.get(k) === content) {
        overlays.delete(k);
        schedule(type === DESCRIPTION);
      }
      throw e;
    }
    setTimeout(() => {
      if (overlays.get(k) !== content) return;
      overlays.delete(k);
      schedule(type === DESCRIPTION);
    }, OVERLAY_MAX);
  };

  /** D-27 levels of a channel in this space (its team keeps their level; I'm the creator), plus our own state types. */
  const roomLevels = (space: Room, extra: Record<string, number>) => {
    const create = space.currentState.getStateEvents(EventType.RoomCreate, '');
    const c = contentOf(create);
    const pl = contentOf(space.currentState.getStateEvents(EventType.RoomPowerLevels, ''));
    const creators = create && hydra(c.room_version) ? [create.getSender()!, ...(Array.isArray(c.additional_creators) ? (c.additional_creators as string[]) : [])] : [];
    const base = powerLevels(isClientSpace(space) ? 'client' : 'workspace', 'channel', channelUsers((pl.users ?? {}) as Record<string, unknown>, creators, userId));
    return { ...base, events: { ...base.events, ...extra } };
  };

  /** Restricted to the space (D-06), its history readable by everyone who joins (the page is replayed from it). */
  const childState = (spaceId: string) => [
    { type: EventType.SpaceParent, state_key: spaceId, content: { via: [server], canonical: true } },
    { type: EventType.RoomHistoryVisibility, state_key: '', content: { history_visibility: 'shared' } },
    { type: EventType.RoomJoinRules, state_key: '', content: { join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: spaceId }] } },
  ];

  const pageEntry = (pageId: string) => {
    for (const space of spacesJoined()) {
      const content = stateOf(space, PAGE, pageId);
      if (live(content)) return { space, content };
    }
    throw new Error('not-found');
  };
  const siblingsOf = (space: Room, parent: string | undefined, except?: string) =>
    [...allOf(space, PAGE)]
      .filter(([id, { content: c }]) => id !== except && live(c) && (str(c.parent) ?? undefined) === parent)
      .map(([id, { content: c }]) => ({ id, order: c.order as string }));

  const projectRoom = (projectId: string) => {
    const room = client.getRoom(projectId);
    if (!joined(room) || room.getType() !== PROJECT) throw new Error('not-found');
    return room;
  };
  const issueContent = (room: Room, issueId: string) => {
    const c = stateOf(room, ISSUE, issueId);
    if (!live(c)) throw new Error('not-found');
    return c;
  };

  const hierarchy = async (spaceId: string) => {
    const rooms: { room_id: string; room_type?: string; name?: string }[] = [];
    let from: string | undefined;
    do {
      const res = await client.getRoomHierarchy(spaceId, 100, 1, false, from);
      rooms.push(...res.rooms);
      from = res.next_batch;
    } while (from && rooms.length < 1000);
    return rooms;
  };

  const setTyping = (roomId: string, typing: boolean) => {
    const prev = typingSent.get(roomId);
    clearTimeout(prev?.idle);
    if (!typing) {
      if (prev) {
        typingSent.delete(roomId);
        void client.sendTyping(roomId, false, 0).catch(noop);
      }
      return;
    }
    const now = Date.now();
    const fresh = !prev || now - prev.at > TYPING_RESEND;
    if (fresh) void client.sendTyping(roomId, true, TYPING_TIMEOUT).catch(noop);
    typingSent.set(roomId, { at: fresh ? now : prev.at, idle: setTimeout(() => setTyping(roomId, false), TYPING_IDLE) });
  };

  const release = (pageId: string, entry: CoreEntry) => {
    entry.refs--;
    if (entry.refs > 0) return;
    setTyping(pageId, false);
    void entry.core.then(async (core) => {
      await core.settle().catch(noop);
      if (entry.refs > 0 || stopped) return;
      const leave = () => {
        if (entry.refs > 0) return;
        if (core.unsent()) {
          entry.timer = setTimeout(leave, LEAVE_AFTER);
          return;
        }
        // The room stays joined: on our single server, the last member leaving makes it unjoinable for everyone.
        core.destroy();
        if (cores.get(pageId) === entry) cores.delete(pageId);
        schedule();
      };
      clearTimeout(entry.timer);
      entry.timer = setTimeout(leave, LEAVE_AFTER);
    }, noop);
  };

  const ensureProjects = () =>
    (ensuring ??= (async () => {
      await ready;
      const spaces = spacesJoined();
      await Promise.all(
        spaces.map(async (space) => {
          // A space the server won't list (I'm no longer in it, or it's gone) still answers: its joined projects, or none.
          const rooms = await hierarchy(space.roomId).catch(() => []);
          for (const r of rooms) if (r.room_type === PROJECT) listed.set(r.room_id, { spaceId: space.roomId, name: r.name ?? '' });
          ensured.add(space.roomId);
        }),
      );
      schedule();
      await Promise.all(
        [...listed.keys()]
          .filter((id) => !joined(client.getRoom(id)) && !refused.has(id))
          .map((id) =>
            client.joinRoom(id, { viaServers: [server] }).then(
              () => whenJoined(id),
              () => void refused.add(id),
            ),
          ),
      );
      schedule();
    })().finally(() => {
      ensuring = null;
    }));

  const find = (projectId: string, issueId: string) => {
    for (const list of Object.values(build().projects)) {
      const project = list.find((p) => p.id === projectId);
      const issue = project?.issues.find((i) => i.id === issueId);
      if (project && issue) return { project, issue };
    }
    return null;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },

    async createPage({ spaceId, parent, title }) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!joined(space) || !space.currentState.maySendStateEvent(PAGE, userId)) throw new Error('not-allowed');
      const { orderAmong } = await import('./order');
      const order = orderAmong(siblingsOf(space, parent), {});
      const { room_id } = await client.createRoom({
        preset: Preset.PrivateChat,
        visibility: Visibility.Private,
        creation_content: { type: PAGE },
        power_level_content_override: roomLevels(space, { [SNAPSHOT]: 0, [EventType.RoomName]: 0 }),
        initial_state: childState(spaceId),
      });
      try {
        await write(spaceId, PAGE, room_id, { title: title?.trim() ?? '', ...(parent ? { parent } : {}), order });
      } catch (e) {
        void client.leave(room_id).catch(noop);
        throw e;
      }
      return room_id;
    },
    async renamePage(pageId, title) {
      const { space, content } = pageEntry(pageId);
      await write(space.roomId, PAGE, pageId, { ...content, title: title.trim() });
    },
    async movePage(pageId, to) {
      const { space, content } = pageEntry(pageId);
      if (to.parent && !live(stateOf(space, PAGE, to.parent))) throw new Error('not-found');
      const { orderAmong, wouldCycle } = await import('./order');
      const parents: Record<string, string | undefined> = {};
      for (const [id, { content: c }] of allOf(space, PAGE)) if (live(c)) parents[id] = str(c.parent);
      if (wouldCycle(parents, pageId, to.parent)) throw new Error('cycle');
      const next: Content = { ...content, order: orderAmong(siblingsOf(space, to.parent, pageId), to) };
      if (to.parent) next.parent = to.parent;
      else delete next.parent;
      await write(space.roomId, PAGE, pageId, next);
    },
    async deletePage(pageId) {
      const { space } = pageEntry(pageId);
      // The subtree as shown: a parent loop is already broken there, so it can't reach pages above this one.
      const nodeOf = (list: PageNode[]): PageNode | undefined => {
        for (const n of list) {
          if (n.id === pageId) return n;
          const hit = nodeOf(n.children);
          if (hit) return hit;
        }
      };
      const doomed: string[] = [];
      const walk = (n: PageNode) => {
        doomed.push(n.id);
        n.children.forEach(walk);
      };
      walk(nodeOf(pagesOf(space).roots)!);
      await Promise.all(doomed.map((id) => write(space.roomId, PAGE, id, {})));
    },
    async setPageLinks(pageId, links) {
      const { space, content } = pageEntry(pageId);
      await write(space.roomId, PAGE, pageId, { ...content, links: [...new Set(links)] });
    },
    async openPage(pageId): Promise<PageSession> {
      await ready;
      let entry = cores.get(pageId);
      // A page that couldn't be read when nobody holds it is tried again from scratch.
      if (entry?.refs === 0 && entry.loaded?.getState().status === 'failed') {
        clearTimeout(entry.timer);
        entry.loaded.destroy();
        cores.delete(pageId);
        entry = undefined;
      }
      if (!entry) {
        const core = import('./docsProvider').then((m) => m.openPageSession({ client, server, whenJoined }, pageId));
        const fresh: CoreEntry = { core, refs: 0 };
        core.then(
          (c) => void (fresh.loaded = c),
          () => {
            if (cores.get(pageId) === fresh) cores.delete(pageId);
          },
        );
        cores.set(pageId, fresh);
        entry = fresh;
      }
      clearTimeout(entry.timer);
      entry.refs++;
      const held = entry;
      let core: PageCore;
      try {
        core = await held.core;
      } catch (e) {
        held.refs--;
        throw e;
      }
      schedule();
      let closed = false;
      return {
        pageId,
        doc: core.doc,
        awareness: core.awareness,
        getState: core.getState,
        subscribe: core.subscribe,
        close() {
          if (closed) return;
          closed = true;
          release(pageId, held);
        },
      };
    },
    setTyping,

    ensureProjects,
    async createProject({ spaceId, name, colour, columns }) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!joined(space) || !space.currentState.maySendStateEvent(EventType.SpaceChild, userId)) throw new Error('not-allowed');
      const wanted = name.trim();
      const taken = new Set((snapshot.projects[spaceId] ?? []).map((p) => p.key));
      const base = wanted.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'PRJ';
      let key = base;
      for (let i = 2; taken.has(key); i++) key = `${base}${i}`;
      const { room_id } = await client.createRoom({
        name: wanted,
        preset: Preset.PrivateChat,
        visibility: Visibility.Private,
        creation_content: { type: PROJECT },
        power_level_content_override: roomLevels(space, { [ISSUE]: 0, [DESCRIPTION]: 0, [COLUMNS]: isClientSpace(space) ? LEVEL.staff : 0 }),
        initial_state: [
          ...childState(spaceId),
          { type: PROJECT, state_key: '', content: { key, colour } },
          { type: COLUMNS, state_key: '', content: { columns } },
        ],
      });
      try {
        await client.sendStateEvent(spaceId, EventType.SpaceChild, { via: [server] }, room_id);
      } catch (e) {
        void client.leave(room_id).catch(noop);
        throw e;
      }
      listed.set(room_id, { spaceId, name: wanted });
      ensured.add(spaceId);
      schedule();
      return room_id;
    },
    async createColumn(projectId, title) {
      const room = projectRoom(projectId);
      if (!room.currentState.maySendStateEvent(COLUMNS, userId)) throw new Error('not-allowed');
      const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await write(projectId, COLUMNS, '', { columns: [...columnsOf(room), { id, title: title.trim() }] });
    },
    async renameColumn(projectId, columnId, title) {
      const room = projectRoom(projectId);
      if (!room.currentState.maySendStateEvent(COLUMNS, userId)) throw new Error('not-allowed');
      const columns = columnsOf(room);
      if (!columns.some((c) => c.id === columnId)) throw new Error('not-found');
      await write(projectId, COLUMNS, '', { columns: columns.map((c) => (c.id === columnId ? { ...c, title: title.trim() } : c)) });
    },
    async titleColumns(projectId, titles) {
      const room = projectRoom(projectId);
      if (!room.currentState.maySendStateEvent(COLUMNS, userId)) throw new Error('not-allowed');
      // A room whose columns haven't arrived yet (just created or joined) shows the untitled fallback: not a project to title.
      if (!room.currentState.getStateEvents(COLUMNS, '')) return;
      const columns = columnsOf(room);
      if (columns.every((c) => c.title || !titles[c.id])) return;
      await write(projectId, COLUMNS, '', { columns: columns.map((c) => (c.title || !titles[c.id] ? c : { ...c, title: titles[c.id] })) });
    },
    async createIssue(projectId, o) {
      const room = projectRoom(projectId);
      const project = projectOf(room, '');
      // Counted before any await: a number I handed out may not have echoed as state yet.
      let n = numbered.get(projectId) ?? 0;
      for (const { content: c } of allOf(room, ISSUE).values()) if (typeof c.n === 'number') n = Math.max(n, c.n);
      for (const ev of room.getLiveTimeline().getEvents()) {
        const at = (ev.getContent()[ISSUE] as Content | undefined)?.n;
        if (typeof at === 'number') n = Math.max(n, at);
      }
      numbered.set(projectId, ++n);
      const title = o.title.trim();
      const { orderAmong } = await import('./order');
      const order = orderAmong(project.issues.filter((i) => i.column === o.column), {});
      const { event_id } = await client.http.authedRequest<{ event_id: string }>(Method.Put, `/rooms/${enc(projectId)}/send/${EventType.RoomMessage}/${txnId()}`, undefined, {
        msgtype: 'm.text',
        body: `${project.key ? `${project.key}-${n} ` : ''}${title}`,
        [ISSUE]: { n },
      });
      await write(projectId, ISSUE, event_id, { title, column: o.column, ...(o.assignee ? { assignee: o.assignee } : {}), ...(o.due ? { due: o.due } : {}), order, n });
      return event_id;
    },
    async updateIssue(projectId, issueId, patch) {
      const room = projectRoom(projectId);
      const next: Content = { ...issueContent(room, issueId) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') delete next[k];
        else if (v !== undefined) next[k] = k === 'title' ? String(v).trim() : v;
      }
      await write(projectId, ISSUE, issueId, next);
    },
    async moveIssue(projectId, issueId, to) {
      const room = projectRoom(projectId);
      const current = issueContent(room, issueId);
      const { orderAmong } = await import('./order');
      const siblings = issuesOf(room).filter((i) => i.column === to.column && i.id !== issueId);
      await write(projectId, ISSUE, issueId, { ...current, column: to.column, order: orderAmong(siblings, to) });
    },
    async deleteIssue(projectId, issueId) {
      const room = projectRoom(projectId);
      const { n } = issueContent(room, issueId);
      // The number stays behind, so a new issue never reuses it.
      await write(projectId, ISSUE, issueId, typeof n === 'number' ? { n } : {});
      if (typeof stateOf(room, DESCRIPTION, issueId).body === 'string') await write(projectId, DESCRIPTION, issueId, {}).catch(noop);
      // Best effort: only my own root (or an Admin) may be redacted.
      void client.redactEvent(projectId, issueId).catch(noop);
    },
    description(projectId, issueId) {
      const room = client.getRoom(projectId);
      if (!room) return undefined;
      const c = stateOf(room, DESCRIPTION, issueId);
      return typeof c.body === 'string' ? (c as { body: string; html?: string }) : undefined;
    },
    async setDescription(projectId, issueId, d) {
      projectRoom(projectId);
      await write(projectId, DESCRIPTION, issueId, { body: d.body, ...(d.html ? { html: d.html } : {}) });
    },
    async issueChanges(projectId, issueId) {
      const versions: IEvent[] = [];
      const filter = JSON.stringify({ types: [ISSUE] });
      let from: string | undefined;
      for (let scanned = 0; scanned < CHANGES_SCAN; ) {
        const res = await client.http.authedRequest<{ chunk: IEvent[]; end?: string }>(Method.Get, `/rooms/${enc(projectId)}/messages`, {
          dir: 'b',
          limit: '100',
          filter,
          ...(from ? { from } : {}),
        });
        scanned += res.chunk.length;
        versions.push(...res.chunk.filter((e) => e.type === ISSUE && e.state_key === issueId));
        if (!res.chunk.length || !res.end || res.end === from) break;
        from = res.end;
      }
      versions.reverse();
      const out: IssueChange[] = [];
      versions.forEach((ev, i) => {
        const prev = (i > 0 ? versions[i - 1]!.content : (ev.unsigned?.prev_content as Content | undefined)) as Content | undefined;
        const now = ev.content as Content;
        if (!prev || !live(prev) || !live(now)) return;
        for (const field of ['column', 'assignee', 'due', 'title'] as const) {
          if (prev[field] === now[field]) continue;
          const to = str(now[field]);
          out.push({ id: `${ev.event_id}:${field}`, ts: ev.origin_server_ts, by: person(ev.sender, projectId), field, ...(to ? { to } : {}) });
        }
      });
      return out;
    },
    async uploadMedia(_roomId, file) {
      const { content_uri } = await client.uploadContent(file, { name: file.name, type: file.type || undefined });
      return content_uri;
    },
    async resolveIssue(projectId, issueId) {
      const known = find(projectId, issueId);
      if (known) return known;
      await ensureProjects();
      return find(projectId, issueId);
    },
    async stop() {
      stopped = true;
      client.off(RoomStateEvent.Events, onState);
      client.off(RoomEvent.MyMembership, onRoom);
      client.off(ClientEvent.Room, onRoom);
      client.off(RoomMemberEvent.Typing, onTyping);
      typingSent.forEach((t) => clearTimeout(t.idle));
      const entries = [...cores.values()];
      cores.clear();
      listeners.clear();
      for (const entry of entries) {
        clearTimeout(entry.timer);
        entry.loaded?.flushNow();
      }
      // Sign-out logs out (aborting every request) right after this, so unsent edits get a short window to land.
      const loaded = entries.flatMap((e) => (e.loaded ? [e.loaded] : []));
      await Promise.race([Promise.all(loaded.map((c) => c.settle().catch(noop))), new Promise((r) => setTimeout(r, 3000))]);
      for (const entry of entries) void entry.core.then((core) => core.destroy(), noop);
    },
  };
}
