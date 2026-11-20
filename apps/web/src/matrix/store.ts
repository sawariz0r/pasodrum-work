import {
  ClientEvent,
  createClient,
  Direction,
  EventStatus,
  EventType,
  HttpApiEvent,
  KnownMembership,
  NotificationCountType,
  PendingEventOrdering,
  ReceiptType,
  RelationType,
  RoomEvent,
  SyncState,
  THREAD_RELATION_TYPE,
  type MatrixEvent,
  type Room,
} from 'matrix-js-sdk';
import { connectionOf, share, workspaceOf, type RoomFacts } from './map';
import { send } from './send';
import { clearSession } from './session';
import type { Message, Person, Session, Timeline, WorkspaceSnapshot, WorkspaceStore } from './types';

const PAGE = 30;
const TEXT = new Set(['m.text', 'm.emote', 'm.notice']);
const noop = () => {};
const localpart = (userId: string) => userId.slice(1).split(':')[0] ?? userId;

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

function messageOf(ev: MatrixEvent, channelId: string): Message | null {
  if (ev.getType() !== EventType.RoomMessage || ev.isRedacted() || ev.isRelation(RelationType.Replace)) return null;
  // Thread replies belong in the thread panel (M3), not the channel timeline.
  if (ev.isRelation(THREAD_RELATION_TYPE.name)) return null;
  const content = ev.getContent();
  if (!TEXT.has(content.msgtype ?? '') || typeof content.body !== 'string') return null;
  const senderId = ev.getSender() ?? '';
  return {
    id: ev.getId()!,
    channelId,
    sender: { id: senderId, name: ev.sender?.name ?? localpart(senderId) },
    body: content.body,
    ts: ev.getTs(),
    status: ev.status === EventStatus.NOT_SENT ? 'failed' : ev.status && ev.status !== EventStatus.SENT ? 'sending' : 'sent',
    ...(ev.replacingEventId() ? { edited: true } : {}),
  };
}

const hasOlder = (room: Room) => {
  const live = room.getLiveTimeline();
  return live.getPaginationToken(Direction.Backward) !== null && !live.getEvents().some((e) => e.getType() === EventType.RoomCreate);
};

const textCount = (room: Room) => room.getLiveTimeline().getEvents().filter((e) => messageOf(e, room.roomId)).length;

export function createWorkspaceStore(session: Session): WorkspaceStore {
  const client = createClient({ baseUrl: session.baseUrl, userId: session.userId, deviceId: session.deviceId, accessToken: session.accessToken, disableVoip: true });
  const listeners = new Set<() => void>();
  const open = new Map<string, Pick<Timeline, 'initialLoading' | 'loadingOlder'>>();
  let me: Person = { id: session.userId, name: localpart(session.userId) };
  let syncState: SyncState | null = null;
  let synced = false;
  let sessionExpired = false;
  let markReady = noop;
  const ready = new Promise<void>((resolve) => (markReady = resolve));

  const timelineOf = (channelId: string, flags: Pick<Timeline, 'initialLoading' | 'loadingOlder'>): Timeline => {
    const room = client.getRoom(channelId);
    const events = room ? [...room.getLiveTimeline().getEvents(), ...room.getPendingEvents()] : [];
    return {
      messages: events.map((e) => messageOf(e, channelId)).filter((m): m is Message => !!m),
      ...flags,
      hasOlder: !!room && hasOlder(room),
    };
  };

  const build = (): WorkspaceSnapshot => ({
    me,
    connection: connectionOf(syncState, synced),
    ...workspaceOf(client.getRooms().map(factsOf)),
    timelines: Object.fromEntries([...open].map(([id, flags]) => [id, timelineOf(id, flags)])),
    sessionExpired,
    typing: {},
    uploads: {},
  });

  let snapshot = build();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const next = share(snapshot, build());
      if (next === snapshot) return;
      snapshot = next;
      listeners.forEach((l) => l());
    });
  };

  const setFlags = (channelId: string, flags: Partial<Pick<Timeline, 'initialLoading' | 'loadingOlder'>>) => {
    const prev = open.get(channelId);
    if (prev) open.set(channelId, { ...prev, ...flags });
    schedule();
  };

  const fill = async (channelId: string, want: number) => {
    await ready;
    const room = client.getRoom(channelId);
    while (room && textCount(room) < want && hasOlder(room)) {
      if (!(await client.paginateEventTimeline(room.getLiveTimeline(), { backwards: true, limit: PAGE }))) break;
    }
  };

  const pending = (channelId: string, messageId: string) => {
    const room = client.getRoom(channelId);
    const event = room?.getPendingEvents().find((e) => e.getId() === messageId);
    return room && event?.status === EventStatus.NOT_SENT ? { room, event } : null;
  };

  client.on(ClientEvent.Sync, (state) => {
    syncState = state;
    if (state === SyncState.Prepared || state === SyncState.Syncing) {
      synced = true;
      markReady();
    }
    schedule();
  });
  client.on(RoomEvent.Timeline, schedule);
  client.on(RoomEvent.LocalEchoUpdated, schedule);
  client.on(RoomEvent.MyMembership, schedule);
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
      void fill(channelId, PAGE)
        .catch(noop)
        .finally(() => setFlags(channelId, { initialLoading: false }));
    },
    loadOlder(channelId) {
      const flags = open.get(channelId);
      const room = client.getRoom(channelId);
      if (!flags || flags.initialLoading || flags.loadingOlder || !room) return;
      setFlags(channelId, { loadingOlder: true });
      void fill(channelId, textCount(room) + PAGE)
        .catch(noop)
        .finally(() => setFlags(channelId, { loadingOlder: false }));
    },
    sendText(channelId, body) {
      send(client, channelId, { body }).catch(schedule);
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
      await client.logout(true).catch(noop);
      client.stopClient();
      client.removeAllListeners();
      clearSession();
    },
    // M2: implemented in task M2-01; until then the composer only uses sendText.
    send(channelId, draft) {
      this.sendText(channelId, draft.body);
    },
    edit: noop,
    remove: noop,
    react: noop,
    unreact: noop,
    attach: noop,
    retryUpload: noop,
    removeUpload: noop,
    setTyping: noop,
    members: () => [],
    mediaUrl: () => Promise.reject(new Error('M2')),
    messageLink: (channelId, messageId) => `${location.origin}/m/${encodeURIComponent(channelId)}/${encodeURIComponent(messageId)}`,
  };
}
