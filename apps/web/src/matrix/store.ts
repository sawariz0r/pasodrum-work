import {
  ClientEvent,
  createClient,
  Direction,
  EventStatus,
  EventType,
  HttpApiEvent,
  KnownMembership,
  MatrixEventEvent,
  NotificationCountType,
  PendingEventOrdering,
  ReceiptType,
  RelationType,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  SyncState,
  THREAD_RELATION_TYPE,
  type MatrixEvent,
  type Room,
} from 'matrix-js-sdk';
import { sanitizeHtml, type SanitizedHtml } from './html';
import { connectionOf, mediaOf, membershipSummary, reactionsOf, replyFallback, share, stripReplyFallback, workspaceOf, type RoomFacts } from './map';
import { send, sendEdit, sendReaction, type MsgType, type TextMessage } from './send';
import { clearSession } from './session';
import type { Message, MessageKind, Person, Session, Timeline, Upload, WorkspaceSnapshot, WorkspaceStore } from './types';

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
  let me: Person = { id: session.userId, name: localpart(session.userId) };
  let syncState: SyncState | null = null;
  let synced = false;
  let sessionExpired = false;
  let uploadSeq = 0;
  let markReady = noop;
  const ready = new Promise<void>((resolve) => (markReady = resolve));

  const eventOf = (room: Room | null, id: string) => room?.findEventById(id) ?? room?.getPendingEvent(id) ?? undefined;
  const personOf = (room: Room | null, userId: string): Person => ({ id: userId, name: room?.getMember(userId)?.name ?? localpart(userId) });

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

  function messageOf(ev: MatrixEvent, room: Room, withReply = true): Message | null {
    if (ev.isState() || ev.isRelation(RelationType.Replace) || ev.isRelation(THREAD_RELATION_TYPE.name)) return null;
    const type = ev.getType();
    const senderId = ev.getSender() ?? '';
    const base = { id: ev.getId()!, channelId: room.roomId, sender: { id: senderId, name: ev.sender?.name ?? localpart(senderId) }, ts: ev.getTs(), status: statusOf(ev) };
    const content = ev.getContent() as Record<string, unknown>;

    if (type !== EventType.RoomMessage && type !== EventType.Sticker) {
      // D-05: unknown content with a text fallback shows it; anything else (reactions, encrypted, poll votes…) is hidden.
      const text = content.body ?? content['org.matrix.msc1767.text'];
      return typeof text === 'string' && text && !ev.isRelation() && !ev.isRedacted() ? { ...base, body: text, kind: 'unsupported' } : null;
    }
    if (ev.isRedacted()) return { ...base, body: '', kind: 'deleted' };
    if (typeof content.body !== 'string') return null;

    const msgtype = String(content.msgtype ?? '');
    const replyId = ev.replyEventId;
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
    const target = room.findEventById(replyId);
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
      out.push(m);
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
      .map((m) => ({ id: m.userId, name: m.name }))
      .sort(byName);

  const build = (): WorkspaceSnapshot => ({
    me,
    connection: connectionOf(syncState, synced),
    ...workspaceOf(client.getRooms().map(factsOf)),
    timelines: Object.fromEntries([...open].map(([id, flags]) => [id, timelineOf(id, flags)])),
    sessionExpired,
    typing: Object.fromEntries([...open.keys()].map((id) => [id, typingOf(id)] as const).filter(([, people]) => people.length)),
    uploads: Object.fromEntries([...trays].filter(([, items]) => items.length).map(([id, items]) => [id, items.map((i) => i.upload)])),
  });

  let snapshot = build();
  let scheduled = false;
  function schedule() {
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
    }
    schedule();
  });
  client.on(RoomEvent.Timeline, (ev, room) => {
    // Edits are applied to their target asynchronously; refresh once that lands.
    if (ev.isRelation(RelationType.Replace)) room?.findEventById(ev.relationEventId ?? '')?.once(MatrixEventEvent.Replaced, schedule);
    schedule();
  });
  client.on(RoomEvent.LocalEchoUpdated, schedule);
  client.on(RoomEvent.Redaction, schedule);
  client.on(RoomEvent.MyMembership, schedule);
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
      if (draft.body.trim()) {
        sendText(channelId, { body: draft.body, html: draft.html, mentions: withReply(draft.mentions), replyTo });
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
        .map((m) => ({ id: m.userId, name: m.name }))
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
  };
}
