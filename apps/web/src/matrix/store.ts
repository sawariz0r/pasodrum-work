import {
  ClientEvent,
  ClientPrefix,
  createClient,
  Direction,
  EventStatus,
  EventType,
  HttpApiEvent,
  KnownMembership,
  MatrixEventEvent,
  Method,
  NotificationCountType,
  PendingEventOrdering,
  Preset,
  ReceiptType,
  RelationType,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  SyncState,
  THREAD_RELATION_TYPE,
  Visibility,
  type IEvent,
  type MatrixEvent,
  type Room,
} from 'matrix-js-sdk';
import { sanitizeHtml, type SanitizedHtml } from './html';
import {
  connectionOf, emailFromId, looksExternal, mediaOf, membershipSummary, reactionsOf, replyFallback, sameMembers, share, stripReplyFallback, threadStats, workspaceOf,
  type RoomFacts, type ThreadReply,
} from './map';
import { send, sendEdit, sendReaction, type MsgType, type TextMessage } from './send';
import { clearSession } from './session';
import type { ActivityItem, Dm, Message, MessageKind, Person, Session, Space, ThreadInfo, ThreadSummary, Timeline, Upload, WorkspaceSnapshot, WorkspaceStore } from './types';

const PAGE = 30;
const MAX_UPLOAD = 50 * 1024 * 1024;
const TYPING_TIMEOUT = 6_000;
const TYPING_RESEND = 4_000;
const TYPING_IDLE = 5_000;
const THUMBNAIL = { width: 800, height: 600 };
const TEXT_KINDS = new Set(['m.text', 'm.emote', 'm.notice']);
const MEDIA_KINDS = new Set(['m.image', 'm.video', 'm.audio', 'm.file']);
const HTML = 'org.matrix.custom.html';
const noop = () => {};
const localpart = (userId: string) => userId.slice(1).split(':')[0] ?? userId;
const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const MAIN = 'main';
const THREAD = THREAD_RELATION_TYPE.name;
const enc = encodeURIComponent;
const isClientSpace = (room: Room) => room.currentState.getStateEvents('work.pasodrum.space', '')?.getContent().kind === 'client';
const joined = (room: Room) => room.getMyMembership() === KnownMembership.Join;

type Relation = { rel_type?: string; event_id?: string; is_falling_back?: boolean; 'm.in_reply_to'?: { event_id?: string } };
const relationOf = (ev: MatrixEvent) => ev.getWireContent()['m.relates_to'] as Relation | undefined;
/** The thread an event replies in (not the root itself). */
const threadRootOf = (ev: MatrixEvent) => (!ev.isState() && relationOf(ev)?.rel_type === THREAD ? relationOf(ev)?.event_id : undefined);
/** A real reply; the m.in_reply_to a thread reply carries for clients without threads doesn't count. */
const replyIdOf = (ev: MatrixEvent) => (relationOf(ev)?.is_falling_back ? undefined : ev.replyEventId);
const sent = (ev: MatrixEvent) => !ev.status && !!ev.getId()?.startsWith('$');
const replyOfEvent = (ev: MatrixEvent): ThreadReply => ({ id: ev.getId()!, ts: ev.getTs(), sender: ev.getSender() ?? '' });

interface ThreadBundle {
  count: number;
  latest_event?: IEvent;
  current_user_participated?: boolean;
}

/** Thread data beyond the live timeline: the root when it isn't loaded, and replies fetched with the relations API. */
interface ThreadState {
  roomId: string;
  root?: MatrixEvent;
  replies: Map<string, MatrixEvent>;
  /** Pagination token for older replies; null = all loaded; undefined = never fetched. */
  next?: string | null;
}

/** Per-build caches (reset by build()). */
interface Scan {
  /** Thread replies in live timelines and pending sends, by root. */
  replies: Map<string, MatrixEvent[]>;
  /** Roots seen: replied to in a live timeline, or carrying a bundled thread summary. */
  roots: Map<string, Room>;
  /** My latest event per `${roomId}|${threadRootId or main}`. */
  mine: Map<string, number>;
  info: Map<string, ThreadComputed | null>;
}

interface ThreadComputed {
  info: ThreadInfo;
  followed: boolean;
  latestId?: string;
}

function factsOf(room: Room): RoomFacts {
  const state = room.currentState;
  const topic: unknown = state.getStateEvents(EventType.RoomTopic, '')?.getContent().topic;
  return {
    id: room.roomId,
    name: room.name,
    joined: room.getMyMembership() === KnownMembership.Join,
    isSpace: room.isSpaceRoom(),
    otherType: !!room.getType() && !room.isSpaceRoom(),
    clientSpace: state.getStateEvents('work.pasodrum.space', '')?.getContent().kind === 'client',
    joinRule: room.getJoinRule(),
    ...(typeof topic === 'string' && topic ? { topic } : {}),
    children: state
      .getStateEvents(EventType.SpaceChild)
      .filter((e) => Array.isArray(e.getContent().via) && e.getContent().via.length > 0)
      .map((e) => e.getStateKey()!),
    unread: room.getUnreadNotificationCount(NotificationCountType.Total),
    mentions: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    memberCount: room.getJoinedMemberCount(),
  };
}

const statusOf = (ev: MatrixEvent): Message['status'] =>
  ev.status === EventStatus.NOT_SENT ? 'failed' : ev.status && ev.status !== EventStatus.SENT ? 'sending' : 'sent';

const hasOlder = (room: Room) => {
  const live = room.getLiveTimeline();
  return live.getPaginationToken(Direction.Backward) !== null && !live.getEvents().some((e) => e.getType() === EventType.RoomCreate);
};

const msgtypeOf = (mimetype: string): MsgType =>
  mimetype.startsWith('image/') ? 'm.image' : mimetype.startsWith('video/') ? 'm.video' : mimetype.startsWith('audio/') ? 'm.audio' : 'm.file';

async function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

interface TrayItem {
  upload: Upload;
  file: File;
  info: Record<string, unknown>;
  url?: string;
  abort?: AbortController;
}

export function createWorkspaceStore(session: Session): WorkspaceStore {
  const client = createClient({ baseUrl: session.baseUrl, userId: session.userId, deviceId: session.deviceId, accessToken: session.accessToken, disableVoip: true });
  const listeners = new Set<() => void>();
  const open = new Map<string, Pick<Timeline, 'initialLoading' | 'loadingOlder'>>();
  const sanitized = new WeakMap<object, SanitizedHtml>();
  /** Reply originals outside the loaded timeline: fetched once; null while fetching or when unavailable. */
  const fetched = new Map<string, { sender: Person; body: string } | null>();
  const trays = new Map<string, TrayItem[]>();
  const typingSent = new Map<string, { at: number; idle: ReturnType<typeof setTimeout> }>();
  const media = new Map<string, Promise<string>>();
  // M3
  const known = new Map<string, MatrixEvent>();
  const threadStore = new Map<string, ThreadState>();
  const openThreads = new Map<string, Pick<Timeline, 'initialLoading' | 'loadingOlder' | 'failed'> & { roomId: string }>();
  /** My threaded/local read positions: `${roomId}|${threadRootId or main}` → timestamp read up to. */
  const receipts = new Map<string, number>();
  const readItems = new Set<string>();
  const localDirect = new Set<string>();
  const membersRequested = new Set<string>();
  const threadsListed = new Set<string>();
  const rootsRequested = new Set<string>();
  const joining = new Set<string>();
  const dmRequests = new Map<string, Promise<string>>();
  let workspaceRoom: Room | undefined;
  let scanCache: Scan | null = null;
  let me: Person = { id: session.userId, name: localpart(session.userId) };
  let syncState: SyncState | null = null;
  let synced = false;
  let sessionExpired = false;
  let uploadSeq = 0;
  let markReady = noop;
  const ready = new Promise<void>((resolve) => (markReady = resolve));

  const eventOf = (room: Room | null, id: string) => room?.findEventById(id) ?? room?.getPendingEvent(id) ?? known.get(id);
  const mapper = client.getEventMapper();
  const mapEvent = (roomId: string, raw: Partial<IEvent>) => {
    const ev = mapper({ ...raw, room_id: roomId });
    known.set(ev.getId()!, ev);
    return ev;
  };

  /** Not a member of the company workspace; before its member list loads (or for clients, who can't see it), judged by the ID. */
  const isExternal = (userId: string) =>
    workspaceRoom?.membersLoaded() ? workspaceRoom.getMember(userId)?.membership !== KnownMembership.Join : looksExternal(userId);
  const person = (userId: string, name?: string | null, avatarUrl?: string): Person => ({
    id: userId,
    name: name || localpart(userId),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(userId !== me.id && isExternal(userId) ? { external: true } : {}),
  });
  const personOf = (room: Room | null, userId: string): Person => person(userId, room?.getMember(userId)?.name);

  const htmlOf = (content: Record<string, unknown>): SanitizedHtml | null => {
    if (content.format !== HTML || typeof content.formatted_body !== 'string') return null;
    let hit = sanitized.get(content);
    if (!hit) sanitized.set(content, (hit = sanitizeHtml(content.formatted_body)));
    return hit;
  };

  const reactionsFor = (room: Room, eventId: string) =>
    (room.relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction)?.getRelations() ?? []).filter(
      (e) => !e.isRedacted() && e.status !== EventStatus.NOT_SENT && e.status !== EventStatus.CANCELLED,
    );

  const fetchOnce = (room: Room, eventId: string) => {
    if (fetched.has(eventId)) return;
    fetched.set(eventId, null);
    client
      .fetchRoomEvent(room.roomId, eventId)
      .then((raw) => {
        const content = (raw.content ?? {}) as Record<string, unknown>;
        const body = typeof content.body === 'string' ? content.body : '';
        const isReply = !!(content['m.relates_to'] as { 'm.in_reply_to'?: unknown } | undefined)?.['m.in_reply_to'];
        fetched.set(eventId, { sender: personOf(room, raw.sender ?? ''), body: isReply ? stripReplyFallback(body).body : body });
        schedule();
      })
      .catch(noop);
  };

  function messageOf(ev: MatrixEvent, room: Room, withReply = true, inThread = false): Message | null {
    if (ev.isState() || ev.isRelation(RelationType.Replace) || (!inThread && ev.isRelation(THREAD))) return null;
    const type = ev.getType();
    const senderId = ev.getSender() ?? '';
    const base = { id: ev.getId()!, channelId: room.roomId, sender: person(senderId, ev.sender?.name ?? room.getMember(senderId)?.name), ts: ev.getTs(), status: statusOf(ev) };
    const content = ev.getContent() as Record<string, unknown>;

    if (type !== EventType.RoomMessage && type !== EventType.Sticker) {
      // D-05: unknown content with a text fallback shows it; anything else (reactions, encrypted, poll votes…) is hidden.
      const text = content.body ?? content['org.matrix.msc1767.text'];
      return typeof text === 'string' && text && !ev.isRelation() && !ev.isRedacted() ? { ...base, body: text, kind: 'unsupported' } : null;
    }
    if (ev.isRedacted()) return { ...base, body: '', kind: 'deleted' };
    if (typeof content.body !== 'string') return null;

    const msgtype = String(content.msgtype ?? '');
    const replyId = replyIdOf(ev);
    let body = replyId && !ev.replacingEvent() ? stripReplyFallback(content.body).body : content.body;
    let kind: MessageKind;
    const file = type === EventType.Sticker ? mediaOf(content, true) : MEDIA_KINDS.has(msgtype) ? mediaOf(content) : null;
    if (file) {
      kind = type === EventType.Sticker ? 'image' : (msgtype.slice(2) as MessageKind);
      body = file.caption;
    } else {
      kind = TEXT_KINDS.has(msgtype) ? (msgtype.slice(2) as MessageKind) : 'unsupported';
    }
    const html = !file || file.caption ? htmlOf(content) : null;
    const mentioned = (content['m.mentions'] as { user_ids?: unknown } | undefined)?.user_ids;
    const mentionsMe = senderId !== me.id && ((Array.isArray(mentioned) && mentioned.includes(me.id)) || !!html?.mentions.includes(me.id));
    const reactions = reactionsOf(
      reactionsFor(room, base.id).map((e) => ({ key: String(e.getRelation()?.key ?? ''), sender: personOf(room, e.getSender() ?? ''), ts: e.getTs() })),
      me.id,
    );

    const message: Message = {
      ...base,
      body,
      kind,
      ...(ev.replacingEventId() ? { edited: true } : {}),
      ...(html && html.html ? { html: html.html } : {}),
      ...(file ? { media: file.media } : {}),
      ...(mentionsMe ? { mentionsMe } : {}),
      ...(reactions.length ? { reactions } : {}),
    };
    if (replyId && withReply) message.replyTo = replyOf(room, replyId, ev);
    return message;
  }

  function replyOf(room: Room, replyId: string, ev: MatrixEvent): NonNullable<Message['replyTo']> {
    const target = eventOf(room, replyId);
    const original = target && messageOf(target, room, false);
    if (original) return { id: replyId, sender: original.sender, body: original.body || original.media?.name || '', found: true };
    fetchOnce(room, replyId);
    const known = fetched.get(replyId);
    if (known) return { id: replyId, ...known, found: false };
    const originalBody = ev.getOriginalContent().body;
    const quote = typeof originalBody === 'string' ? stripReplyFallback(originalBody).quote : undefined;
    return { id: replyId, ...(quote?.senderId ? { sender: personOf(room, quote.senderId) } : {}), body: quote?.body ?? '', found: false };
  }

  const messagesOf = (room: Room): Message[] => {
    const out: Message[] = [];
    let run: MatrixEvent[] = [];
    const flush = () => {
      const first = run[0];
      const summary =
        first &&
        membershipSummary(
          run.map((e) => {
            const content = e.getContent();
            const prev = e.getPrevContent();
            const id = e.getStateKey() ?? '';
            const name = content.displayname ?? prev.displayname;
            return { person: { id, name: typeof name === 'string' && name ? name : localpart(id) }, prev: prev.membership, next: String(content.membership) };
          }),
        );
      if (first && summary) {
        out.push({ id: first.getId()!, channelId: room.roomId, sender: personOf(room, first.getSender() ?? ''), body: '', ts: run.at(-1)!.getTs(), status: 'sent', kind: 'system', system: summary });
      }
      run = [];
    };
    for (const ev of [...room.getLiveTimeline().getEvents(), ...room.getPendingEvents()]) {
      if (ev.getType() === EventType.RoomMember) {
        run.push(ev);
        continue;
      }
      const m = messageOf(ev, room);
      if (!m) continue;
      flush();
      out.push(withThread(room, m));
    }
    flush();
    return out;
  };

  const visibleCount = (room: Room) => room.getLiveTimeline().getEvents().filter((e) => e.getType() !== EventType.RoomMember && messageOf(e, room, false)).length;

  const timelineOf = (channelId: string, flags: Pick<Timeline, 'initialLoading' | 'loadingOlder'>): Timeline => {
    const room = client.getRoom(channelId);
    return { messages: room ? messagesOf(room) : [], ...flags, hasOlder: !!room && hasOlder(room) };
  };

  const typingOf = (channelId: string): Person[] =>
    (client.getRoom(channelId)?.currentState.getMembers() ?? [])
      .filter((m) => m.typing && m.userId !== me.id)
      .map((m) => person(m.userId, m.name))
      .sort(byName);

  // Threads
  const roomsJoined = () => client.getRooms().filter((r) => joined(r) && !r.isSpaceRoom());
  const spacesJoined = () => client.getRooms().filter((r) => joined(r) && r.isSpaceRoom());

  const scan = (): Scan => {
    if (scanCache) return scanCache;
    const s: Scan = { replies: new Map(), roots: new Map(), mine: new Map(), info: new Map() };
    const note = (room: Room, ev: MatrixEvent) => {
      const root = threadRootOf(ev);
      if (ev.getSender() === me.id && sent(ev)) {
        const key = `${room.roomId}|${root ?? MAIN}`;
        s.mine.set(key, Math.max(s.mine.get(key) ?? 0, ev.getTs()));
      }
      return root;
    };
    for (const room of roomsJoined()) {
      for (const ev of [...room.getLiveTimeline().getEvents(), ...room.getPendingEvents()]) {
        const root = note(room, ev);
        if (root) {
          s.replies.set(root, [...(s.replies.get(root) ?? []), ev]);
          s.roots.set(root, room);
        } else if (ev.getServerAggregatedRelation(THREAD)) s.roots.set(ev.getId()!, room);
      }
    }
    for (const [rootId, st] of threadStore) {
      const room = client.getRoom(st.roomId);
      if (!room || !joined(room)) continue;
      s.roots.set(rootId, room);
      st.replies.forEach((ev) => note(room, ev));
    }
    return (scanCache = s);
  };

  const storeFor = (roomId: string, rootId: string) => {
    let st = threadStore.get(rootId);
    if (!st) threadStore.set(rootId, (st = { roomId, replies: new Map() }));
    return st;
  };

  const fetchRoot = (room: Room, rootId: string) => {
    if (rootsRequested.has(rootId)) return;
    rootsRequested.add(rootId);
    client
      .fetchRoomEvent(room.roomId, rootId)
      .then((raw) => {
        storeFor(room.roomId, rootId).root = mapEvent(room.roomId, raw);
        schedule();
      })
      .catch(noop);
  };

  /** Replies in a thread, oldest first: live and pending ones plus fetched ones (live objects win). Redacted replies stay as deleted rows. */
  const repliesFor = (rootId: string): MatrixEvent[] => {
    const byId = new Map<string, MatrixEvent>();
    for (const ev of threadStore.get(rootId)?.replies.values() ?? []) byId.set(ev.getId()!, ev);
    for (const ev of scan().replies.get(rootId) ?? []) byId.set(ev.getId()!, ev);
    return [...byId.values()].filter((ev) => threadRootOf(ev) === rootId || ev.isRedacted()).sort((a, b) => a.getTs() - b.getTs());
  };

  /** The freshest bundled summary the server gave us on the root. */
  const bundleOf = (room: Room, rootId: string) => {
    let best: ThreadBundle | undefined;
    for (const ev of new Set([room.findEventById(rootId), threadStore.get(rootId)?.root])) {
      const b = ev?.getServerAggregatedRelation<ThreadBundle>(THREAD);
      if (b && (!best || (b.latest_event?.origin_server_ts ?? 0) > (best.latest_event?.origin_server_ts ?? 0))) best = b;
    }
    return best;
  };

  /** How far I've read in a room (main timeline) or a thread. An unthreaded receipt covers threads too; a 'main' one doesn't. */
  const readUpTo = (room: Room, rootId?: string) => {
    let ts = Math.max(receipts.get(`${room.roomId}|${rootId ?? MAIN}`) ?? 0, scan().mine.get(`${room.roomId}|${rootId ?? MAIN}`) ?? 0);
    for (const type of [ReceiptType.Read, ReceiptType.ReadPrivate]) {
      const r = room.getReadReceiptForUserId(me.id, false, type);
      if (!r || (rootId && r.data.thread_id === MAIN)) continue;
      ts = Math.max(ts, eventOf(room, r.eventId)?.getTs() ?? r.data.ts ?? 0);
    }
    return ts;
  };

  const threadOf = (room: Room, rootId: string): ThreadComputed | null => {
    const cache = scan().info;
    if (cache.has(rootId)) return cache.get(rootId)!;
    const replies = repliesFor(rootId).filter((ev) => !ev.isRedacted() && ev.status !== EventStatus.NOT_SENT && ev.status !== EventStatus.CANCELLED);
    const bundle = bundleOf(room, rootId);
    const latest = bundle?.latest_event?.event_id ? { id: bundle.latest_event.event_id, ts: bundle.latest_event.origin_server_ts, sender: bundle.latest_event.sender } : undefined;
    const stats = threadStats(bundle && { count: bundle.count, latest }, replies.map(replyOfEvent), threadStore.get(rootId)?.next === null);
    let result: ThreadComputed | null = null;
    if (stats) {
      const root = eventOf(room, rootId);
      const followed = root?.getSender() === me.id || !!bundle?.current_user_participated || replies.some((ev) => ev.getSender() === me.id);
      const readTs = readUpTo(room, rootId);
      const unread = followed && [...replies.map(replyOfEvent), ...(latest ? [latest] : [])].some((r) => r.sender !== me.id && r.ts > readTs);
      result = {
        info: { count: stats.count, lastTs: stats.lastTs, participants: stats.participants.map((id) => personOf(room, id)), unread },
        followed,
        latestId: stats.latest?.id,
      };
    }
    cache.set(rootId, result);
    return result;
  };

  const withThread = (room: Room, m: Message): Message => {
    const t = m.status === 'sent' ? threadOf(room, m.id) : null;
    return t ? { ...m, thread: t.info } : m;
  };

  /** The event a new thread reply's fallback points at: the latest reply, else the root. */
  const latestInThread = (room: Room, rootId: string) => {
    const latest = repliesFor(rootId).filter((ev) => sent(ev) && !ev.isRedacted()).at(-1);
    const bundled = bundleOf(room, rootId)?.latest_event;
    if (bundled?.event_id && (!latest || bundled.origin_server_ts > latest.getTs())) return bundled.event_id;
    return latest?.getId() ?? rootId;
  };

  const threadsOf = (): ThreadSummary[] => {
    const out: ThreadSummary[] = [];
    for (const [rootId, room] of scan().roots) {
      const rootEv = eventOf(room, rootId);
      if (!rootEv) {
        fetchRoot(room, rootId);
        continue;
      }
      const t = threadOf(room, rootId);
      const root = t?.followed && messageOf(rootEv, room);
      if (!t || !root) continue;
      const lastReply = t.latestId ? lastReplyOf(room, rootId, t.latestId) : undefined;
      out.push({ channelId: room.roomId, rootId, root: { ...root, thread: t.info }, ...(lastReply ? { lastReply } : {}), count: t.info.count, unread: t.info.unread, lastTs: t.info.lastTs });
    }
    return out.sort((a, b) => b.lastTs - a.lastTs);
  };

  const lastReplyOf = (room: Room, rootId: string, id: string) => {
    const raw = bundleOf(room, rootId)?.latest_event;
    const ev = eventOf(room, id) ?? (raw?.event_id === id ? mapEvent(room.roomId, raw) : undefined);
    return (ev && messageOf(ev, room, true, true)) ?? undefined;
  };

  const threadTimelineOf = (rootId: string, { roomId, ...flags }: Pick<Timeline, 'initialLoading' | 'loadingOlder' | 'failed'> & { roomId: string }): Timeline => {
    const room = client.getRoom(roomId);
    if (!room) return { messages: [], ...flags, hasOlder: false };
    const rootEv = eventOf(room, rootId);
    const root = rootEv && messageOf(rootEv, room);
    const replies = repliesFor(rootId)
      .map((ev) => messageOf(ev, room, true, true))
      .filter((m): m is Message => !!m);
    return { messages: [...(root ? [withThread(room, root)] : []), ...replies], ...flags, hasOlder: threadStore.get(rootId)?.next !== null };
  };

  const loadThreadPage = async (roomId: string, rootId: string) => {
    await ready;
    const room = client.getRoom(roomId);
    const st = storeFor(roomId, rootId);
    if (!room || st.next === null) return;
    if (!eventOf(room, rootId)) st.root = mapEvent(roomId, await client.fetchRoomEvent(roomId, rootId));
    const res = await client.fetchRelations(roomId, rootId, THREAD, null, { dir: Direction.Backward, limit: PAGE, ...(st.next ? { from: st.next } : {}) });
    for (const raw of res.chunk) st.replies.set(raw.event_id, mapEvent(roomId, raw));
    st.next = res.next_batch ?? null;
  };

  const setThreadFlags = (rootId: string, flags: Partial<Pick<Timeline, 'initialLoading' | 'loadingOlder' | 'failed'>>) => {
    const prev = openThreads.get(rootId);
    if (prev) openThreads.set(rootId, { ...prev, ...flags });
    schedule();
  };

  /** Followed threads beyond the loaded timelines (the server's thread list, once per room). */
  const listThreads = (room: Room) => {
    if (threadsListed.has(room.roomId)) return;
    threadsListed.add(room.roomId);
    client.http
      .authedRequest<{ chunk: IEvent[] }>(Method.Get, `/rooms/${enc(room.roomId)}/threads`, { include: 'participated', limit: String(PAGE) }, undefined, { prefix: ClientPrefix.V1 })
      .then(({ chunk }) => {
        for (const raw of chunk) storeFor(room.roomId, raw.event_id).root = mapEvent(room.roomId, raw);
        schedule();
      })
      .catch(() => threadsListed.delete(room.roomId));
  };

  /**
   * Continuwuity drops thread_id and keeps one read position per room, so a thread receipt also marks the channel read
   * up to that point. When that would skip unread channel messages, the thread is marked read on this device only.
   */
  const sendReceipt = (room: Room, ev: MatrixEvent, threadId: string) => {
    const channelRead = readUpTo(room);
    const skips =
      threadId !== MAIN &&
      room
        .getLiveTimeline()
        .getEvents()
        .some((e) => e.getType() === EventType.RoomMessage && !threadRootOf(e) && e.getSender() !== me.id && e.getTs() > channelRead && e.getTs() < ev.getTs());
    receipts.set(`${room.roomId}|${threadId}`, Math.max(receipts.get(`${room.roomId}|${threadId}`) ?? 0, ev.getTs()));
    schedule();
    if (skips) return;
    client.http.authedRequest(Method.Post, `/rooms/${enc(room.roomId)}/receipt/${ReceiptType.Read}/${enc(ev.getId()!)}`, undefined, { thread_id: threadId }).catch(noop);
  };

  // Activity
  const senderOf = (room: Room, eventId: string, isRoot: boolean) => {
    const ev = eventOf(room, eventId);
    if (ev) return ev.getSender();
    if (isRoot) fetchRoot(room, eventId);
    else {
      fetchOnce(room, eventId);
      return fetched.get(eventId)?.sender.id;
    }
  };

  const activityOf = (): ActivityItem[] => {
    const items: ActivityItem[] = [];
    const seen = new Set<string>();
    const consider = (room: Room, ev: MatrixEvent) => {
      const id = ev.getId()!;
      if (seen.has(id)) return;
      seen.add(id);
      if (ev.getSender() === me.id || !sent(ev) || ev.getType() !== EventType.RoomMessage || ev.isRedacted() || ev.isRelation(RelationType.Replace)) return;
      const content = ev.getContent();
      const root = threadRootOf(ev);
      const replyId = replyIdOf(ev);
      const quoted = replyId && typeof content.body === 'string' ? stripReplyFallback(content.body).quote?.senderId : undefined;
      const toMe = (!!replyId && (senderOf(room, replyId, false) ?? quoted) === me.id) || (!!root && senderOf(room, root, true) === me.id);
      const mentioned: unknown = content['m.mentions']?.user_ids;
      const maybeMention = (Array.isArray(mentioned) && mentioned.includes(me.id)) || (typeof content.formatted_body === 'string' && content.formatted_body.includes(me.id));
      if (!toMe && !maybeMention) return;
      const message = messageOf(ev, room, true, !!root);
      const kind = toMe ? 'reply' : message?.mentionsMe ? 'mention' : null;
      if (!message || !kind) return;
      const unread = !readItems.has(id) && ev.getTs() > readUpTo(room, root);
      items.push({ id, kind, channelId: room.roomId, ...(root ? { threadRootId: root } : {}), message: root ? message : withThread(room, message), unread });
    };
    for (const room of roomsJoined()) room.getLiveTimeline().getEvents().forEach((ev) => consider(room, ev));
    for (const st of threadStore.values()) {
      const room = client.getRoom(st.roomId);
      if (room && joined(room)) st.replies.forEach((ev) => consider(room, ev));
    }
    return items.sort((a, b) => b.message.ts - a.message.ts);
  };

  // DMs
  const directContent = () => (client.getAccountData(EventType.Direct)?.getContent() ?? {}) as Record<string, unknown>;
  /** m.direct inverted: room id → the people it's a DM with. */
  const directRooms = () => {
    const out = new Map<string, string[]>();
    for (const [userId, ids] of Object.entries(directContent())) {
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') out.set(id, [...(out.get(id) ?? []), userId]);
    }
    return out;
  };
  const isDirect = (room: Room, direct: Map<string, string[]>) => {
    if (room.isSpaceRoom()) return false;
    if (direct.has(room.roomId) || localDirect.has(room.roomId)) return true;
    const mine = room.getMember(me.id)?.events.member;
    return !!(mine?.getContent().is_direct || mine?.getPrevContent().is_direct);
  };
  /** The other people in a DM; for display, falls back to m.direct when everyone else has left. */
  const othersOf = (room: Room, direct?: Map<string, string[]>) => {
    const ids = room
      .getMembers()
      .filter((m) => m.userId !== me.id && (m.membership === KnownMembership.Join || m.membership === KnownMembership.Invite))
      .map((m) => m.userId);
    const inviter = room.getMyMembership() === KnownMembership.Invite ? room.getDMInviter() : undefined;
    if (inviter && !ids.includes(inviter)) ids.push(inviter);
    return ids.length || !direct ? ids : (direct.get(room.roomId) ?? []).filter((id) => id !== me.id);
  };
  const lastTsOf = (room: Room) => {
    const events = room.getLiveTimeline().getEvents();
    const last = events.findLast((ev) => ev.getType() === EventType.RoomMessage && !threadRootOf(ev)) ?? events.at(-1);
    return last?.getTs() ?? 0;
  };

  const lastMessageOf = (room: Room): Message | undefined => {
    const events = room.getLiveTimeline().getEvents();
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]!;
      if (ev.getType() !== EventType.RoomMessage || threadRootOf(ev)) continue;
      const m = messageOf(ev, room);
      if (m) return m;
    }
    return undefined;
  };

  const dmsOf = (spaces: Space[]): Dm[] => {
    const direct = directRooms();
    const spaceRooms = spaces.map((s) => client.getRoom(s.id)).filter((r): r is Room => !!r);
    return roomsJoined()
      .filter((room) => isDirect(room, direct))
      .map((room): Dm => {
        const others = othersOf(room, direct);
        return {
          id: room.roomId,
          people: others.map((id) => personOf(room, id)).sort(byName),
          unread: room.getUnreadNotificationCount(NotificationCountType.Total),
          mentions: room.getUnreadNotificationCount(NotificationCountType.Highlight),
          lastTs: lastTsOf(room),
          last: lastMessageOf(room),
          spaceIds: spaceRooms.filter((s) => others.length && others.every((id) => s.getMember(id)?.membership === KnownMembership.Join)).map((s) => s.roomId),
        };
      })
      .sort((a, b) => b.lastTs - a.lastTs);
  };

  const addDirect = async (roomId: string, userIds: string[]) => {
    localDirect.add(roomId);
    const content = { ...directContent() } as Record<string, string[]>;
    let changed = false;
    for (const id of userIds) {
      const list = Array.isArray(content[id]) ? content[id] : [];
      if (!list.includes(roomId)) {
        content[id] = [...list, roomId];
        changed = true;
      }
    }
    if (changed) await client.setAccountData(EventType.Direct, content);
  };

  const sharesSpace = (userId: string) => spacesJoined().some((s) => s.getMember(userId)?.membership === KnownMembership.Join);

  /** D-07: DMs from people I share a space with open without an accept step; other invites wait. */
  const acceptDmInvites = () => {
    for (const room of client.getRooms()) {
      if (room.getMyMembership() !== KnownMembership.Invite || room.isSpaceRoom() || joining.has(room.roomId)) continue;
      const inviter = room.getDMInviter();
      if (!inviter || !sharesSpace(inviter)) continue;
      joining.add(room.roomId);
      client
        .joinRoom(room.roomId)
        .then(() => addDirect(room.roomId, [inviter]))
        .catch(() => joining.delete(room.roomId));
    }
  };

  const ensureMembers = (room: Room) => {
    if (membersRequested.has(room.roomId)) return;
    membersRequested.add(room.roomId);
    room.loadMembersIfNeeded().then(
      () => {
        schedule();
        acceptDmInvites();
      },
      () => membersRequested.delete(room.roomId),
    );
  };

  /** After each sync: member lists for spaces and DMs (spaceIds, external, auto-join), the server's thread list per room. */
  const housekeeping = () => {
    const direct = directRooms();
    for (const room of client.getRooms()) {
      if (!joined(room)) continue;
      if (room.isSpaceRoom() || isDirect(room, direct)) ensureMembers(room);
      if (!room.isSpaceRoom()) listThreads(room);
    }
    acceptDmInvites();
  };

  const whenJoined = (roomId: string) =>
    new Promise<void>((resolve) => {
      const check = () => {
        const room = client.getRoom(roomId);
        if (!room || !joined(room)) return;
        done();
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

  const findOrCreateDm = async (want: string[]): Promise<string> => {
    const direct = directRooms();
    const candidates = client
      .getRooms()
      .filter((r) => !r.isSpaceRoom() && (joined(r) ? isDirect(r, direct) : r.getMyMembership() === KnownMembership.Invite && !!r.getDMInviter()));
    await Promise.all(candidates.filter(joined).map((r) => r.loadMembersIfNeeded().catch(noop)));
    const hits = candidates.filter((r) => sameMembers(othersOf(r), want)).sort((a, b) => Number(joined(b)) - Number(joined(a)) || lastTsOf(b) - lastTsOf(a));
    const hit = hits[0];
    if (hit) {
      if (!joined(hit)) await client.joinRoom(hit.roomId);
      await addDirect(hit.roomId, want).catch(noop);
      return hit.roomId;
    }
    // D-24: no m.room.encryption until M6.
    const { room_id } = await client.createRoom({ preset: Preset.PrivateChat, visibility: Visibility.Private, is_direct: true, invite: want });
    await addDirect(room_id, want).catch(noop);
    await whenJoined(room_id);
    return room_id;
  };

  const build = (): WorkspaceSnapshot => {
    scanCache = null;
    const rooms = client.getRooms();
    workspaceRoom = rooms.find((r) => r.isSpaceRoom() && joined(r) && !isClientSpace(r));
    const workspace = workspaceOf(rooms.map(factsOf));
    return {
      me,
      connection: connectionOf(syncState, synced),
      ...workspace,
      timelines: Object.fromEntries([...open].map(([id, flags]) => [id, timelineOf(id, flags)])),
      sessionExpired,
      typing: Object.fromEntries([...open.keys()].map((id) => [id, typingOf(id)] as const).filter(([, people]) => people.length)),
      uploads: Object.fromEntries([...trays].filter(([, items]) => items.length).map(([id, items]) => [id, items.map((i) => i.upload)])),
      dms: dmsOf(workspace.spaces),
      threads: threadsOf(),
      threadTimelines: Object.fromEntries([...openThreads].map(([id, flags]) => [id, threadTimelineOf(id, flags)])),
      activity: activityOf(),
      myRoles: {},
    };
  };

  let snapshot = build();
  let scheduled = false;
  function schedule() {
    scanCache = null;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const next = share(snapshot, build());
      if (next === snapshot) return;
      snapshot = next;
      listeners.forEach((l) => l());
    });
  }

  const setFlags = (channelId: string, flags: Partial<Pick<Timeline, 'initialLoading' | 'loadingOlder'>>) => {
    const prev = open.get(channelId);
    if (prev) open.set(channelId, { ...prev, ...flags });
    schedule();
  };

  const fill = async (channelId: string, want: number) => {
    await ready;
    const room = client.getRoom(channelId);
    while (room && visibleCount(room) < want && hasOlder(room)) {
      if (!(await client.paginateEventTimeline(room.getLiveTimeline(), { backwards: true, limit: PAGE }))) break;
    }
  };

  const pending = (channelId: string, messageId: string) => {
    const room = client.getRoom(channelId);
    const event = room?.getPendingEvents().find((e) => e.getId() === messageId);
    return room && event?.status === EventStatus.NOT_SENT ? { room, event } : null;
  };

  const loadMembers = (channelId: string) => {
    void ready.then(() => client.getRoom(channelId)?.loadMembersIfNeeded().then(schedule, noop));
  };

  // Uploads
  const updateUpload = (channelId: string, id: string, patch: Partial<Upload>, extra: Partial<TrayItem> = {}) => {
    const items = trays.get(channelId);
    const item = items?.find((i) => i.upload.id === id);
    if (!items || !item) return;
    trays.set(channelId, items.map((i) => (i === item ? { ...item, ...extra, upload: { ...item.upload, ...patch } } : i)));
    schedule();
  };

  const startUpload = (channelId: string, item: TrayItem) => {
    const abort = new AbortController();
    const id = item.upload.id;
    updateUpload(channelId, id, { status: 'uploading', progress: 0 }, { abort });
    client
      .uploadContent(item.file, {
        name: item.file.name,
        type: item.file.type || undefined,
        abortController: abort,
        progressHandler: ({ loaded, total }) => updateUpload(channelId, id, { progress: total ? Math.min(loaded / total, 1) : 0 }),
      })
      .then(async ({ content_uri }) => {
        const size = await imageSize(item.file);
        updateUpload(channelId, id, { status: 'done', progress: 1 }, { url: content_uri, info: size ?? {} });
      })
      .catch(() => {
        if (!abort.signal.aborted) updateUpload(channelId, id, { status: 'failed' });
      });
  };

  const dropUpload = (item: TrayItem) => {
    if (item.upload.status === 'uploading') item.abort?.abort();
    if (item.upload.previewUrl) URL.revokeObjectURL(item.upload.previewUrl);
  };

  // Typing
  const setTyping = (channelId: string, typing: boolean) => {
    const sent = typingSent.get(channelId);
    if (sent) clearTimeout(sent.idle);
    if (!typing) {
      if (sent) {
        typingSent.delete(channelId);
        client.sendTyping(channelId, false, 0).catch(noop);
      }
      return;
    }
    const now = Date.now();
    const fresh = !sent || now - sent.at >= TYPING_RESEND;
    if (fresh) client.sendTyping(channelId, true, TYPING_TIMEOUT).catch(noop);
    typingSent.set(channelId, { at: fresh ? now : sent!.at, idle: setTimeout(() => setTyping(channelId, false), TYPING_IDLE) });
  };

  const myReaction = (room: Room, messageId: string, key: string) =>
    reactionsFor(room, messageId).find((e) => e.getSender() === me.id && e.getRelation()?.key === key);

  client.on(ClientEvent.Sync, (state) => {
    syncState = state;
    if (state === SyncState.Prepared || state === SyncState.Syncing) {
      synced = true;
      markReady();
      housekeeping();
    }
    schedule();
  });
  client.on(RoomEvent.Timeline, (ev, room) => {
    if (ev.isRelation(RelationType.Replace)) {
      const id = ev.relationEventId ?? '';
      const target = room?.findEventById(id);
      // Edits are applied to their target asynchronously; refresh once that lands.
      if (target) target.once(MatrixEventEvent.Replaced, schedule);
      else if (known.get(id)?.getSender() === ev.getSender()) known.get(id)!.makeReplaced(ev);
    }
    schedule();
  });
  client.on(RoomEvent.LocalEchoUpdated, schedule);
  client.on(RoomEvent.Redaction, (ev, room) => {
    const target = known.get(ev.getAssociatedId() ?? '');
    if (target && !target.isRedacted() && !room.findEventById(target.getId()!)) target.makeRedacted(ev, room);
    schedule();
  });
  client.on(RoomEvent.MyMembership, () => {
    if (synced) housekeeping();
    schedule();
  });
  client.on(RoomEvent.Receipt, (ev, room) => {
    for (const [eventId, types] of Object.entries(ev.getContent() as Record<string, Record<string, Record<string, { ts?: number; thread_id?: string }>>>)) {
      for (const type of [ReceiptType.Read, ReceiptType.ReadPrivate]) {
        const threadId = types[type]?.[me.id]?.thread_id;
        if (!threadId || threadId === MAIN) continue;
        const key = `${room.roomId}|${threadId}`;
        receipts.set(key, Math.max(receipts.get(key) ?? 0, eventOf(room, eventId)?.getTs() ?? types[type]![me.id]!.ts ?? 0));
      }
    }
    schedule();
  });
  client.on(ClientEvent.AccountData, schedule);
  client.on(RoomMemberEvent.Typing, schedule);
  client.on(RoomStateEvent.Members, schedule);
  client.on(HttpApiEvent.SessionLoggedOut, () => {
    sessionExpired = true;
    client.stopClient();
    clearSession();
    schedule();
  });

  void client.startClient({ lazyLoadMembers: true, initialSyncLimit: PAGE, pendingEventOrdering: PendingEventOrdering.Detached });
  client
    .getProfileInfo(session.userId)
    .then((p) => {
      if (p.displayname) me = { ...me, name: p.displayname };
      schedule();
    })
    .catch(noop);

  const sendText = (channelId: string, message: TextMessage) => void send(client, channelId, message).catch(schedule);

  return {
    getSnapshot: () => snapshot,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
    openTimeline(channelId) {
      if (open.has(channelId)) return;
      open.set(channelId, { initialLoading: true, loadingOlder: false });
      schedule();
      loadMembers(channelId);
      void fill(channelId, PAGE)
        .catch(noop)
        .finally(() => setFlags(channelId, { initialLoading: false }));
    },
    loadOlder(channelId) {
      const flags = open.get(channelId);
      const room = client.getRoom(channelId);
      if (!flags || flags.initialLoading || flags.loadingOlder || !room) return;
      setFlags(channelId, { loadingOlder: true });
      void fill(channelId, visibleCount(room) + PAGE)
        .catch(noop)
        .finally(() => setFlags(channelId, { loadingOlder: false }));
    },
    sendText(channelId, body) {
      sendText(channelId, { body });
    },
    retry(channelId, messageId) {
      const p = pending(channelId, messageId);
      if (p) client.resendEvent(p.event, p.room).catch(schedule);
    },
    discard(channelId, messageId) {
      const p = pending(channelId, messageId);
      if (p) client.cancelPendingEvent(p.event);
    },
    markRead(channelId) {
      const room = client.getRoom(channelId);
      const last = room?.getLiveTimeline().getEvents().at(-1);
      if (!room || !last || room.hasUserReadEvent(session.userId, last.getId()!)) return;
      room.setUnreadNotificationCount(NotificationCountType.Total, 0);
      room.setUnreadNotificationCount(NotificationCountType.Highlight, 0);
      schedule();
      client.sendReadReceipt(last, ReceiptType.Read).catch(noop);
    },
    reconnectNow() {
      client.retryImmediately();
    },
    async signOut() {
      for (const items of trays.values()) items.forEach(dropUpload);
      trays.clear();
      typingSent.forEach((t) => clearTimeout(t.idle));
      for (const url of media.values()) url.then(URL.revokeObjectURL, noop);
      media.clear();
      await client.logout(true).catch(noop);
      client.stopClient();
      client.removeAllListeners();
      clearSession();
    },
    send(channelId, draft) {
      const room = client.getRoom(channelId);
      setTyping(channelId, false);
      let replyTo: TextMessage['replyTo'];
      let replySender: string | undefined;
      const target = draft.replyTo ? eventOf(room, draft.replyTo) : undefined;
      if (draft.replyTo) {
        const original = room && target && messageOf(target, room, false);
        replySender = original ? original.sender.id : undefined;
        replyTo = {
          eventId: draft.replyTo,
          ...(original
            ? { fallback: replyFallback({ roomId: channelId, eventId: draft.replyTo, senderId: original.sender.id, body: original.body || original.media?.name || '', html: original.html }) }
            : {}),
        };
      }
      const withReply = (mentions: string[]) => [...new Set([...mentions, ...(replySender && replySender !== me.id ? [replySender] : [])])];
      const thread = room && draft.threadRootId ? { rootId: draft.threadRootId, latestId: latestInThread(room, draft.threadRootId) } : undefined;
      if (draft.body.trim()) {
        sendText(channelId, { body: draft.body, html: draft.html, mentions: withReply(draft.mentions), replyTo, thread });
        replyTo = undefined;
      }
      const items = trays.get(channelId) ?? [];
      for (const item of items) {
        if (item.upload.status !== 'done' || !item.url) continue;
        const { name, mimetype, size } = item.upload;
        sendText(channelId, {
          msgtype: msgtypeOf(mimetype),
          body: name,
          file: { url: item.url, info: { ...(mimetype ? { mimetype } : {}), size, ...item.info } },
          mentions: replyTo ? withReply([]) : [],
          replyTo,
          thread,
        });
        replyTo = undefined;
      }
      // Clears the tray; uploads still in flight stay so they aren't lost.
      items.filter((i) => i.upload.status !== 'uploading').forEach(dropUpload);
      trays.set(channelId, items.filter((i) => i.upload.status === 'uploading'));
      schedule();
    },
    edit(channelId, messageId, draft) {
      const room = client.getRoom(channelId);
      const ev = eventOf(room, messageId);
      if (!ev) return;
      const content = ev.getContent();
      const before: unknown = content['m.mentions']?.user_ids;
      const was = new Set(Array.isArray(before) ? before : []);
      const msgtype = TEXT_KINDS.has(content.msgtype ?? '') ? (content.msgtype as MsgType) : 'm.text';
      const message = { msgtype, body: draft.body, html: draft.html, mentions: draft.mentions };
      sendEdit(client, channelId, messageId, message, draft.mentions.filter((id) => !was.has(id))).catch(schedule);
    },
    remove(channelId, messageId) {
      const p = pending(channelId, messageId);
      if (p) client.cancelPendingEvent(p.event);
      else if (messageId.startsWith('$')) client.redactEvent(channelId, messageId).catch(schedule);
    },
    react(channelId, messageId, key) {
      const room = client.getRoom(channelId);
      if (!room || myReaction(room, messageId, key)) return;
      sendReaction(client, channelId, messageId, key).catch(schedule);
    },
    unreact(channelId, messageId, key) {
      const room = client.getRoom(channelId);
      const mine = room && myReaction(room, messageId, key);
      const id = mine && mine.getId();
      if (id?.startsWith('$')) client.redactEvent(channelId, id).catch(schedule);
    },
    attach(channelId, files) {
      const added = files.map((file): TrayItem => {
        const mimetype = file.type || 'application/octet-stream';
        return {
          file,
          info: {},
          upload: {
            id: `upload-${uploadSeq++}`,
            name: file.name,
            size: file.size,
            mimetype,
            progress: 0,
            status: file.size > MAX_UPLOAD ? 'too-large' : 'uploading',
            ...(mimetype.startsWith('image/') ? { previewUrl: URL.createObjectURL(file) } : {}),
          },
        };
      });
      trays.set(channelId, [...(trays.get(channelId) ?? []), ...added]);
      schedule();
      added.filter((i) => i.upload.status !== 'too-large').forEach((i) => startUpload(channelId, i));
    },
    retryUpload(channelId, uploadId) {
      const item = trays.get(channelId)?.find((i) => i.upload.id === uploadId);
      if (item?.upload.status === 'failed') startUpload(channelId, item);
    },
    removeUpload(channelId, uploadId) {
      const items = trays.get(channelId) ?? [];
      const item = items.find((i) => i.upload.id === uploadId);
      if (!item) return;
      dropUpload(item);
      trays.set(channelId, items.filter((i) => i !== item));
      schedule();
    },
    setTyping,
    members(channelId) {
      const room = client.getRoom(channelId);
      if (!room) return [];
      loadMembers(channelId);
      return room
        .getJoinedMembers()
        .map((m) => person(m.userId, m.name))
        .sort(byName);
    },
    mediaUrl(ref, opts) {
      const key = `${ref}|${opts?.thumbnail ? 'thumbnail' : 'download'}`;
      let url = media.get(key);
      if (!url) {
        const http = opts?.thumbnail
          ? client.mxcUrlToHttp(ref, THUMBNAIL.width, THUMBNAIL.height, 'scale', false, true, true)
          : client.mxcUrlToHttp(ref, undefined, undefined, undefined, false, true, true);
        url = (async () => {
          if (!http) throw new Error('not a media reference');
          const res = await fetch(http, { headers: { Authorization: `Bearer ${session.accessToken}` } });
          if (!res.ok) throw new Error(String(res.status));
          return URL.createObjectURL(await res.blob());
        })();
        url.catch(() => media.delete(key));
        media.set(key, url);
      }
      return url;
    },
    messageLink: (channelId, messageId) => `${location.origin}/m/${encodeURIComponent(channelId)}/${encodeURIComponent(messageId)}`,
    openThread(channelId, rootId) {
      if (openThreads.has(rootId) && !openThreads.get(rootId)?.failed) return;
      openThreads.set(rootId, { roomId: channelId, initialLoading: true, loadingOlder: false, failed: false });
      schedule();
      loadMembers(channelId);
      void loadThreadPage(channelId, rootId)
        .then(() => setThreadFlags(rootId, { initialLoading: false }))
        .catch(() => setThreadFlags(rootId, { initialLoading: false, failed: true }));
    },
    loadOlderInThread(channelId, rootId) {
      const flags = openThreads.get(rootId);
      if (!flags || flags.initialLoading || flags.loadingOlder || threadStore.get(rootId)?.next === null) return;
      setThreadFlags(rootId, { loadingOlder: true });
      void loadThreadPage(channelId, rootId)
        .catch(noop)
        .finally(() => setThreadFlags(rootId, { loadingOlder: false }));
    },
    markThreadRead(channelId, rootId) {
      const room = client.getRoom(channelId);
      const last = room && repliesFor(rootId).filter(sent).at(-1);
      if (room && last && last.getTs() > readUpTo(room, rootId)) sendReceipt(room, last, rootId);
    },
    markActivityRead(itemId) {
      const item = snapshot.activity.find((a) => a.id === itemId);
      readItems.add(itemId);
      schedule();
      const room = item && client.getRoom(item.channelId);
      const ev = room && eventOf(room, itemId);
      if (room && ev && ev.getTs() > readUpTo(room, item.threadRootId)) sendReceipt(room, ev, item.threadRootId ?? MAIN);
    },
    async searchPeople(query) {
      // Continuwuity's user directory finds next to no one, so people come from the spaces and DMs I'm in (their member
      // lists are what the server lets me see: a client sees only their client space) plus whatever the directory adds.
      await ready;
      const term = query.trim().toLowerCase();
      const spaces = spacesJoined();
      await Promise.all(spaces.map((s) => s.loadMembersIfNeeded().catch(noop)));
      const people = new Map<string, Person>();
      for (const s of spaces) for (const m of s.getJoinedMembers()) people.set(m.userId, person(m.userId, m.name));
      for (const dm of snapshot.dms) for (const p of dm.people) people.set(p.id, p);
      const matches = [...people.values()].filter((p) => !term || p.name.toLowerCase().includes(term) || localpart(p.id).includes(term));
      if (term) {
        const { results } = await client.searchUserDirectory({ term, limit: 20 }).catch(() => ({ results: [] }));
        for (const r of results) if (!matches.some((p) => p.id === r.user_id)) matches.push(person(r.user_id, r.display_name, r.avatar_url));
      }
      return matches.filter((p) => p.id !== me.id).sort(byName);
    },
    async openDm(userIds) {
      await ready;
      const want = [...new Set(userIds)].filter((id) => id !== me.id);
      if (!want.length) throw new Error('no one to message');
      const key = [...want].sort().join(' ');
      let request = dmRequests.get(key);
      if (!request) {
        request = findOrCreateDm(want).finally(() => dmRequests.delete(key));
        dmRequests.set(key, request);
      }
      return request;
    },
    async profile(userId) {
      const raw = (await client.getProfileInfo(userId).catch(() => ({}))) as Record<string, unknown>;
      const timeZone = str(raw['m.tz']) ?? str(raw['us.cloke.msc4175.tz']);
      return {
        person: person(userId, str(raw.displayname) ?? client.getUser(userId)?.displayName, str(raw.avatar_url)),
        email: str(raw['work.pasodrum.email']) ?? emailFromId(userId),
        ...(timeZone ? { timeZone } : {}),
      };
    },
    // M4: implemented in task M4-02.
    createChannel: () => Promise.reject(new Error('M4')),
    browseChannels: () => Promise.resolve([]),
    joinChannel: () => Promise.reject(new Error('M4')),
    leaveChannel: () => Promise.reject(new Error('M4')),
    setTopic: () => Promise.reject(new Error('M4')),
    channelMembers: () => Promise.resolve([]),
    setRole: () => Promise.reject(new Error('M4')),
    removeFromChannel: () => Promise.reject(new Error('M4')),
    addPeople: () => Promise.reject(new Error('M4')),
    pendingInvites: () => Promise.resolve([]),
    resendInvite: () => Promise.reject(new Error('M4')),
    revokeInvite: () => Promise.reject(new Error('M4')),
    updateProfile: () => Promise.reject(new Error('M4')),
    devices: () => Promise.resolve([]),
    signOutDevice: () => Promise.reject(new Error('M4')),
    signOutOtherDevices: () => Promise.reject(new Error('M4')),
    notifyLevel: () => 'all',
    setNotifyLevel: () => Promise.reject(new Error('M4')),
    setSetting: () => Promise.resolve(),
  };
}
