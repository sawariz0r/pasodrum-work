import {
  ClientEvent,
  ClientPrefix,
  createClient,
  Direction,
  EventStatus,
  EventType,
  HttpApiEvent,
  KnownMembership,
  MatrixError,
  MatrixEventEvent,
  Method,
  NotificationCountType,
  PendingEventOrdering,
  Preset,
  PushRuleKind,
  ReceiptType,
  RelationType,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  RoomType,
  SyncState,
  THREAD_RELATION_TYPE,
  Visibility,
  type AuthDict,
  type IEvent,
  type HierarchyRoom,
  type MatrixEvent,
  type Room,
} from 'matrix-js-sdk';
import { CryptoEvent, DecryptionFailureCode } from 'matrix-js-sdk/lib/crypto-api';
import { decryptAttachment, encryptAttachment, sealedFileOf, type SealedFile } from './attachments';
import { createEmailConfirm } from './confirm';
import { CRYPTO_DB, createSecurity, cryptoCallbacks, withTimeout, type KeyHolder } from './crypto';
import { sanitizeHtml, type SanitizedHtml } from './html';
import { translateSegments } from './translate';
import { createInvite, InviteError, listInvites, normalizeEmail, removePersonFor, resendInvite, revokeInvitesFor, revokeInvitesForSpace, revokeInvite, type NewInvite } from './invites';
import {
  connectionOf, emailFromId, hydra, looksExternal, mayChangeRole, mediaOf, membershipSummary, powerLevel, reactionsOf, replyFallback, roleOf, sameMembers, share,
  accessRoleOf, externalRecordOf, knownSpacesOf, linkPreviewOf, linksOf, pinnedIdsOf, stripReplyFallback, threadStats, workspaceOf,
  type ExternalRecord, type PowerFacts, type RoomFacts, type ThreadReply,
} from './map';
import { ACCESS_ROLE, archivedLevels, channelUsers, dmLevels, EXTERNAL, externalKey, LEVEL, PINS, powerLevels, withLevel } from './levels';
import { defaultLevel, defaultOps, roomLevel, roomOps, type PushOp, type PushRules } from './push';
import { createSearch } from './search';
import { askAssistant, assistantStatus, findRefs, placesOf } from './assistant';
import { createDocsBoards, pageRoomsOf } from './docsBoards';
import { issueActivityOf, PROJECT_TYPE } from './issueActivity';
import { send, sendEdit, sendReaction, type MsgType, type TextMessage } from './send';
import { createBundleReceiver, markerFor, shareHistory } from './shareHistory';
import { clearSession } from './session';
import {
  PasswordRequired,
  type AccessChange, type AccessRole, type ActivityItem, type AddPeopleResult, type Channel, type ExternalAccess, type Dm, type FilesPage, type HelpCard, type HelpReason, type JoinableChannel, type LinkPreview, type Media, type Member, type Message, type MessageKind, type Person, type Role, type SearchHit, type Session, type Space,
  type ThreadInfo, type ThreadSummary, type Timeline, type Upload, type WorkspaceSnapshot, type WorkspaceStore,
} from './types';

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
const SPACE_STATE = 'work.pasodrum.space';
const spaceStateOf = (room: Room): Record<string, unknown> => room.currentState.getStateEvents(SPACE_STATE, '')?.getContent() ?? {};
const isClientSpace = (room: Room) => spaceStateOf(room).kind === 'client';
const joined = (room: Room) => room.getMyMembership() === KnownMembership.Join;
const SETTINGS = 'work.pasodrum.settings';
/** E2: `{archived: true}` on an archived channel; the same flag rides on its m.space.child so Browse knows without joining. */
const CHANNEL_STATE = 'work.pasodrum.channel';
const ARCHIVED_CHILD = 'work.pasodrum.archived';
const channelArchived = (room: Room) => room.currentState.getStateEvents(CHANNEL_STATE, '')?.getContent().archived === true;
/** Where people added to the workspace land (found by its name): it keeps its name and is never archived (RulesE2). */
const isGeneral = (room: Room) => room.name.trim().toLowerCase() === 'general';
const MEGOLM = { algorithm: 'm.megolm.v1.aes-sha2' };
/** RulesM6: an undecryptable message shimmers this long while its key may still come. */
const ARRIVING = 10_000;
const ENCRYPT_AFTER = 15_000;
const NO_KEY_COMING = new Set<string>([
  DecryptionFailureCode.MEGOLM_KEY_WITHHELD,
  DecryptionFailureCode.MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE,
  DecryptionFailureCode.HISTORICAL_MESSAGE_USER_NOT_JOINED,
]);
const SPACES = 'work.pasodrum.spaces';
/** D-36. Written by the invite service at claim: the only rooms a fresh account auto-accepts. */
const INVITED = 'work.pasodrum.invited';
/** M7. Files tab: events per /messages request, and requests per page when scanning an encrypted conversation. */
const FILES_PAGE = 30;
const SCAN = 100;
const SCAN_PAGES = 5;
const NO_PINS = new Set<string>();
/** M8. Everything that can be a message (or an edit of one), encrypted or not. */
const MESSAGES_FILTER = { types: [EventType.RoomMessageEncrypted, EventType.RoomMessage, EventType.Sticker] };
/** D-38. The system sender's localpart (help DMs); the invite service logs in as it. */
const SYSTEM = 'pasodrum';
const HELP = 'work.pasodrum.help';
const HELP_REASONS = new Set<HelpReason>(['email-missing', 'stuck', 'link-broken']);
function helpCardOf(raw: unknown, personOf: (id: string, name: string) => Person): HelpCard | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const h = raw as Record<string, unknown>;
  const id = str(h.user_id);
  const email = str(h.email);
  if (!id?.startsWith('@') || !email || !HELP_REASONS.has(h.reason as HelpReason)) return undefined;
  const spaceName = str(h.space_name);
  const localTime = str(h.local_time);
  return { who: personOf(id, str(h.name) ?? localpart(id)), reason: h.reason as HelpReason, email, ...(spaceName ? { spaceName } : {}), ...(localTime ? { localTime } : {}) };
}
const isMember = (room: Room | null | undefined, userId: string) => {
  const m = room?.getMember(userId)?.membership;
  return m === KnownMembership.Join || m === KnownMembership.Invite;
};

function powerFacts(room: Room): PowerFacts {
  const create = room.currentState.getStateEvents(EventType.RoomCreate, '');
  const c = create?.getContent() ?? {};
  const pl = room.currentState.getStateEvents(EventType.RoomPowerLevels, '')?.getContent() ?? {};
  const creators = create && hydra(c.room_version) ? [create.getSender()!, ...(Array.isArray(c.additional_creators) ? (c.additional_creators as string[]) : [])] : [];
  return { creators, users: pl.users as Record<string, unknown> | undefined, usersDefault: pl.users_default };
}
const levelIn = (room: Room | null | undefined, userId: string) => (room ? powerLevel(powerFacts(room), userId) : 0);
/** The level a state event needs, judged by our own power math (room v12 creators outrank every level). */
const mayState = (room: Room, userId: string, type: string) => {
  const pl = room.currentState.getStateEvents(EventType.RoomPowerLevels, '')?.getContent() ?? {};
  const need = (pl.events as Record<string, unknown> | undefined)?.[type];
  return levelIn(room, userId) >= (typeof need === 'number' ? need : typeof pl.state_default === 'number' ? pl.state_default : LEVEL.admin);
};

/** The UIA session when the server wants the user to authenticate again. */
const uiaSession = (e: unknown) => (e instanceof MatrixError && e.httpStatus === 401 && Array.isArray(e.data.flows) ? String(e.data.session ?? '') : undefined);

type Relation = { rel_type?: string; event_id?: string; is_falling_back?: boolean; 'm.in_reply_to'?: { event_id?: string } };
const relationOf = (ev: MatrixEvent) => ev.getWireContent()['m.relates_to'] as Relation | undefined;
/** The thread an event replies in (not the root itself). */
const threadRootOf = (ev: MatrixEvent) => (!ev.isState() && relationOf(ev)?.rel_type === THREAD ? relationOf(ev)?.event_id : undefined);
/** A real reply; the m.in_reply_to a thread reply carries for clients without threads doesn't count. */
const replyIdOf = (ev: MatrixEvent) => (relationOf(ev)?.is_falling_back ? undefined : ev.replyEventId);
const sent = (ev: MatrixEvent) => !ev.status && !!ev.getId()?.startsWith('$');
const isMessage = (ev: MatrixEvent) => ev.getType() === EventType.RoomMessage || ev.getType() === EventType.RoomMessageEncrypted;
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
  const space = spaceStateOf(room);
  return {
    id: room.roomId,
    name: room.name,
    joined: room.getMyMembership() === KnownMembership.Join,
    isSpace: room.isSpaceRoom(),
    otherType: !!room.getType() && !room.isSpaceRoom(),
    clientSpace: space.kind === 'client',
    ...(typeof space.colour === 'string' && space.colour ? { colour: space.colour } : {}),
    ...(space.archived === true ? { archived: true } : {}),
    ...(Array.isArray(space.contacts) ? { contacts: space.contacts.filter((id): id is string => typeof id === 'string') } : {}),
    joinRule: room.getJoinRule(),
    ...(typeof topic === 'string' && topic ? { topic } : {}),
    children: state
      .getStateEvents(EventType.SpaceChild)
      .filter((e) => Array.isArray(e.getContent().via) && e.getContent().via.length > 0)
      .map((e) => e.getStateKey()!),
    parents: state
      .getStateEvents(EventType.SpaceParent)
      .filter((e) => Array.isArray(e.getContent().via) && e.getContent().via.length > 0)
      .map((e) => e.getStateKey()!),
    unread: room.getUnreadNotificationCount(NotificationCountType.Total),
    mentions: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    memberCount: room.getJoinedMemberCount(),
  };
}

const statusOf = (ev: MatrixEvent): Message['status'] =>
  ev.status === EventStatus.NOT_SENT ? 'failed' : ev.status && ev.status !== EventStatus.SENT ? 'sending' : 'sent';

const hasOlder = (room: Room, start?: { index: number }) => {
  const live = room.getLiveTimeline();
  return !start && live.getPaginationToken(Direction.Backward) !== null && !live.getEvents().some((e) => e.getType() === EventType.RoomCreate);
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
  sealed?: SealedFile;
  abort?: AbortController;
}

/**
 * Continuwuity (26.9) drops about 1 in 30 to-device messages that reach a device at the same moment as another, so ours
 * go out one at a time (verification start + cancel to my other devices were going out together and getting lost).
 */
function serialToDeviceFetch(): typeof fetch {
  let queue: Promise<unknown> = Promise.resolve();
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/sendToDevice/')) return fetch(input, init);
    const sent = queue.catch(noop).then(() => fetch(input, init));
    queue = sent;
    return sent;
  };
}

export function createWorkspaceStore(session: Session): WorkspaceStore {
  const serialToDevice = serialToDeviceFetch();
  const keys: KeyHolder = { current: null };
  const client = createClient({
    baseUrl: session.baseUrl,
    userId: session.userId,
    deviceId: session.deviceId,
    accessToken: session.accessToken,
    disableVoip: true,
    cryptoCallbacks: cryptoCallbacks(keys),
    fetchFn: serialToDevice,
    verificationMethods: ['m.sas.v1'],
  });
  const listeners = new Set<() => void>();
  const security = createSecurity(
    client,
    keys,
    session.userId,
    session.deviceId,
    () => {
      schedule();
      email.kick();
    },
    (id) => person(id, client.getUser(id)?.displayName),
  );
  const email = createEmailConfirm({
    token: session.accessToken,
    eligible: () => confirmByEmail(),
    device: () => security.state().device,
    needsRecoveryKey: () => security.state().needsRecoveryKey,
    defaultKeyId: () => client.secretStorage.getDefaultKeyId(),
    newRecoveryKey: () => security.newRecoveryKey(),
    useRecoveryKey: (key) => security.useRecoveryKey(key),
    person: (id, name) => person(id, name),
    spaceId: () => clientSpaces()[0]?.roomId,
    locale: () => inviteLocale(),
    onChange: () => schedule(),
  });
  let cryptoReady = false;
  const encrypting = new Set<string>();
  /** M7. Rooms whose pin level openPins has handled (once per room). */
  const lifted = new Set<string>();
  /** Encrypted media by its per-message ref (`mxc#eventId`): key, iv, hash and MIME type from that message. */
  const sealed = new Map<string, { file: SealedFile; mimetype?: string }>();
  /** When each undecryptable message was first seen (for `arriving`). */
  const failedAt = new Map<string, number>();
  const open = new Map<string, Pick<Timeline, 'initialLoading' | 'loadingOlder'>>();
  const sanitized = new WeakMap<object, SanitizedHtml>();
  /** Reply originals outside the loaded timeline: fetched once; null while fetching or when unavailable. */
  const fetched = new Map<string, { sender: Person; body: string } | null>();
  const trays = new Map<string, TrayItem[]>();
  const typingSent = new Map<string, { at: number; idle: ReturnType<typeof setTimeout> }>();
  const media = new Map<string, Promise<string>>();
  const previews = new Map<string, Promise<LinkPreview | null>>();
  const pinCache = new WeakMap<MatrixEvent, Set<string>>();
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
  /** Thread roots where I'm known to have replied, from checkParticipation. */
  const participated = new Set<string>();
  const participationChecked = new Set<string>();
  const rootsRequested = new Set<string>();
  const joining = new Set<string>();
  const dmRequests = new Map<string, Promise<string>>();
  const server = session.userId.slice(session.userId.indexOf(':') + 1);
  const SYSTEM_ID = `@${SYSTEM}:${server}`;
  /** D-38. Made by the system sender (help DMs): only that account can create such a room. */
  const systemRoom = (room: Room) => room.currentState.getStateEvents(EventType.RoomCreate, '')?.getSender() === SYSTEM_ID;
  /** Continuwuity's admin room (its bot answers `!admin` there): Element's business, never shown in ours. */
  const adminRoom = (room: Room) =>
    room.currentState.getStateEvents(EventType.RoomCreate, '')?.getSender() === `@conduit:${server}` || room.getCanonicalAlias() === `#admins:${server}`;
  const ours = (room: Room) => joined(room) && !adminRoom(room);
  let workspaceRoom: Room | undefined;
  let scanCache: Scan | null = null;
  let me: Person = { id: session.userId, name: localpart(session.userId) };
  let syncState: SyncState | null = null;
  let synced = false;
  let sessionExpired = false;
  let uploadSeq = 0;
  let stopped = false;
  let markReady = noop;
  const ready = new Promise<void>((resolve) => (markReady = resolve));

  const eventOf = (room: Room | null, id: string) => room?.findEventById(id) ?? room?.getPendingEvent(id) ?? known.get(id);
  const mapper = client.getEventMapper();
  const mapEvent = (roomId: string, raw: Partial<IEvent>) => {
    const ev = mapper({ ...raw, room_id: roomId });
    known.set(ev.getId()!, ev);
    return ev;
  };

  /** D-36. Who I am to the outside mark: in the workspace, an External (level 1 somewhere, no workspace), or a client. Set by build(). */
  let viewer: 'team' | 'external' | 'client' = 'team';
  /** Per build: everyone's highest level in my team rooms (see teamRooms). */
  let metCache: Map<string, number> | null = null;
  const metLevel = (userId: string) => {
    if (!metCache) {
      const met = new Map<string, number>();
      for (const room of teamRooms()) {
        const f = powerFacts(room);
        for (const id of new Set([...f.creators, ...Object.keys(f.users ?? {}), ...room.getMembers().map((m) => m.userId)])) met.set(id, Math.max(met.get(id) ?? 0, powerLevel(f, id)));
      }
      metCache = met;
    }
    return metCache.get(userId);
  };
  /**
   * D-36 outside mark. Team: anyone not joined to the workspace (by ID until its member list loads). Externals: anyone below
   * Staff level where we meet. Clients: only other clients (level 0 where we meet); Externals are team to them.
   */
  const isExternal = (userId: string) => {
    if (viewer === 'team') return workspaceRoom?.membersLoaded() ? workspaceRoom.getMember(userId)?.membership !== KnownMembership.Join : looksExternal(userId);
    const level = metLevel(userId);
    if (viewer === 'client') return (level ?? 0) < LEVEL.external;
    return level === undefined ? looksExternal(userId) : level < LEVEL.staff;
  };
  /** Per build: the client space each client is in, from client spaces I'm joined to, so I never learn a name I can't see. Clients get none (D-36). */
  let clientCache: Map<string, string> | null = null;
  const clientSpaceOf = (userId: string) => {
    if (viewer === 'client') return undefined;
    if (!clientCache) {
      const map = new Map<string, string>();
      for (const room of spacesJoined()) {
        if (!isClientSpace(room)) continue;
        for (const m of room.getMembers()) if (!map.has(m.userId) && isMember(room, m.userId) && levelIn(room, m.userId) < LEVEL.external) map.set(m.userId, room.roomId);
      }
      clientCache = map;
    }
    return clientCache.get(userId);
  };
  const person = (userId: string, name?: string | null, avatarUrl?: string): Person => {
    const outside = userId !== me.id && isExternal(userId);
    const client = outside ? clientSpaceOf(userId) : undefined;
    return {
      id: userId,
      name: name || localpart(userId),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(outside ? { external: true } : {}),
      ...(client ? { client } : {}),
    };
  };
  /** Someone as they are now (current member state), not as an event saw them; `fallback` when the room doesn't know them. */
  const personOf = (room: Room | null, userId: string, fallback?: string | null): Person => {
    const m = room?.getMember(userId);
    return person(userId, m?.name ?? fallback, m?.getMxcAvatarUrl());
  };

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

  /** M7. Pinned event ids, newest pin first. */
  const pinsOf = (room: Room): Set<string> => {
    const ev = room.currentState.getStateEvents(PINS, '');
    if (!ev) return NO_PINS;
    let ids = pinCache.get(ev);
    if (!ids) pinCache.set(ev, (ids = new Set(pinnedIdsOf(ev.getContent()))));
    return ids;
  };

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
    const base = { id: ev.getId()!, channelId: room.roomId, sender: personOf(room, senderId, ev.sender?.name), ts: ev.getTs(), status: statusOf(ev) };
    const content = ev.getContent() as Record<string, unknown>;

    // A failed decryption reads as m.room.message / m.bad.encrypted; one still decrypting as m.room.encrypted.
    if (ev.isDecryptionFailure() || type === EventType.RoomMessageEncrypted) {
      if (ev.isRedacted()) return { ...base, body: '', kind: 'deleted' };
      if (ev.isRelation() && !ev.isRelation(THREAD)) return null;
      return { ...base, body: '', kind: 'undecryptable', ...(arriving(ev) ? { arriving: true } : {}) };
    }
    if (type !== EventType.RoomMessage && type !== EventType.Sticker) {
      // D-05: unknown content with a text fallback shows it; anything else (reactions, encrypted, poll votes…) is hidden.
      const text = content.body ?? content['org.matrix.msc1767.text'];
      return typeof text === 'string' && text && !ev.isRelation() && !ev.isRedacted() ? { ...base, body: text, kind: 'unsupported' } : null;
    }
    if (ev.isRedacted()) return { ...base, body: '', kind: 'deleted' };
    // SIDE-03: the "history shared" marker is a row; in-chat verification requests (their fallback text names keys) are hidden.
    if (markerFor(content) && byMemberOfOneToOne(room, senderId)) return { ...base, body: '', kind: 'system', system: { joined: [], left: [], historyShared: { by: base.sender } } };
    if (content.msgtype === 'm.key.verification.request') return null;
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
    if (file) seal(file.media, content, base.id);
    const html = !file || file.caption ? htmlOf(content) : null;
    const links = file || kind === 'unsupported' ? [] : linksOf(body, html?.links ?? null, room.hasEncryptionStateEvent() || ev.isEncrypted());
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
      ...(pinsOf(room).has(base.id) ? { pinned: true } : {}),
      ...(links.length ? { links } : {}),
      ...(ev.getKeyForwardingUser() ? { restored: true } : {}),
    };
    const help = senderId === SYSTEM_ID ? helpCardOf(content[HELP], person) : undefined;
    if (help) message.help = help;
    if (replyId && withReply) message.replyTo = replyOf(room, replyId, ev);
    return message;
  }

  /** SIDE-03: a "history shared" marker is a row only in a 1:1 DM, from one of its two people; anywhere else it's a plain message. */
  function byMemberOfOneToOne(room: Room, senderId: string) {
    const others = othersOf(room);
    return others.length === 1 && (senderId === me.id || senderId === others[0]) && isDirect(room, directRooms());
  }

  /** Still decrypting, or failed but a key may yet come (backup, another device): at most ARRIVING after first sight. */
  function arriving(ev: MatrixEvent) {
    if (ev.isDecryptionFailure() && NO_KEY_COMING.has(ev.decryptionFailureReason ?? '')) return false;
    const id = ev.getId()!;
    let at = failedAt.get(id);
    if (at === undefined) {
      failedAt.set(id, (at = Date.now()));
      setTimeout(schedule, ARRIVING + 50);
    }
    return Date.now() - at < ARRIVING;
  }

  /** Encrypted media gets a ref of its own per message, so one message's key never opens (or breaks) another's file. */
  function seal(m: Media, content: Record<string, unknown>, eventId: string) {
    const info = (content.info ?? {}) as Record<string, unknown>;
    const main = sealedFileOf(content.file);
    const thumb = sealedFileOf(info.thumbnail_file);
    if (main) {
      m.ref = `${main.url}#${eventId}`;
      sealed.set(m.ref, { file: main, ...(str(info.mimetype) ? { mimetype: str(info.mimetype) } : {}) });
    }
    if (thumb) {
      m.thumbnailRef = `${thumb.url}#${eventId}:thumbnail`;
      const thumbType = str((info.thumbnail_info as Record<string, unknown> | undefined)?.mimetype);
      sealed.set(m.thumbnailRef, { file: thumb, ...(thumbType ? { mimetype: thumbType } : {}) });
    }
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
    const from = startOf(room)?.index ?? 0;
    for (const ev of [...room.getLiveTimeline().getEvents().slice(from), ...room.getPendingEvents()]) {
      if (ev.getType() === EventType.RoomMember) {
        run.push(ev);
        continue;
      }
      if (ev.getType() === EventType.RoomName || ev.getType() === CHANNEL_STATE) {
        const row = stateRowOf(ev, room);
        if (row) {
          flush();
          out.push(row);
        }
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

  /** E2: one row per rename (not the first name) and per archive/unarchive. */
  const stateRowOf = (ev: MatrixEvent, room: Room): Message | null => {
    const by = personOf(room, ev.getSender() ?? '');
    const base = { id: ev.getId()!, channelId: room.roomId, sender: by, body: '', ts: ev.getTs(), status: 'sent' as const, kind: 'system' as const };
    if (ev.getType() === EventType.RoomName) {
      const from = str(ev.getPrevContent().name);
      const to = str(ev.getContent().name);
      return from && to && from !== to ? { ...base, system: { joined: [], left: [], renamed: { from, to, by } } } : null;
    }
    const now = ev.getContent().archived === true;
    return now !== (ev.getPrevContent().archived === true) ? { ...base, system: { joined: [], left: [], archived: { by, archived: now } } } : null;
  };

  /**
   * Encrypted private channels start at my join (D-31): the timeline position of my latest change to "joined", once
   * it's loaded. The previous membership comes from prev_content, else from my earlier member event in the timeline.
   */
  function startOf(room: Room): { index: number } | undefined {
    if (!room.hasEncryptionStateEvent() || isDirect(room, directRooms())) return undefined;
    const events = room.getLiveTimeline().getEvents();
    let index: number | undefined;
    let last: string | undefined;
    events.forEach((e, i) => {
      if (e.getType() !== EventType.RoomMember || e.getStateKey() !== me.id) return;
      const next = e.getContent().membership as string | undefined;
      const prev = (e.getPrevContent().membership as string | undefined) ?? last;
      if (next === KnownMembership.Join && prev !== KnownMembership.Join) index = i;
      last = next;
    });
    return index === undefined ? undefined : { index };
  }

  const visibleCount = (room: Room) => {
    const from = startOf(room)?.index ?? 0;
    return room.getLiveTimeline().getEvents().slice(from).filter((e) => e.getType() !== EventType.RoomMember && messageOf(e, room, false)).length;
  };

  const timelineOf = (channelId: string, flags: Pick<Timeline, 'initialLoading' | 'loadingOlder'>): Timeline => {
    const room = client.getRoom(channelId);
    return { messages: room ? messagesOf(room) : [], ...flags, hasOlder: !!room && hasOlder(room, startOf(room)) };
  };

  const typingOf = (channelId: string): Person[] =>
    (client.getRoom(channelId)?.currentState.getMembers() ?? [])
      .filter((m) => m.typing && m.userId !== me.id)
      .map((m) => person(m.userId, m.name, m.getMxcAvatarUrl()))
      .sort(byName);

  // Threads
  // D-37: typed rooms (spaces, pages, projects) aren't conversations.
  const roomsJoined = () => client.getRooms().filter((r) => ours(r) && !r.getType());
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
    // Project rooms too: issue comments are threads (their live replies), kept out of Threads and Activity below.
    for (const room of client.getRooms().filter((r) => ours(r) && !r.isSpaceRoom())) {
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
      if (!room || !ours(room)) continue;
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
      // Not the bundle's current_user_participated: Continuwuity says true to everyone.
      const followed = root?.getSender() === me.id || latest?.sender === me.id || participated.has(rootId) || replies.some((ev) => ev.getSender() === me.id);
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
      if (room.getType()) continue;
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
  /** A listed root I didn't write: did I reply? (the server's list ignores include=participated, so it's only candidates) */
  const checkParticipation = (roomId: string, raw: IEvent) => {
    if (raw.sender === me.id || participationChecked.has(raw.event_id)) return;
    participationChecked.add(raw.event_id);
    client
      .fetchRelations(roomId, raw.event_id, THREAD, null, { dir: Direction.Backward, limit: 50 })
      .then(({ chunk }) => {
        if (!chunk.some((e) => e.sender === me.id)) return;
        participated.add(raw.event_id);
        schedule();
      })
      .catch(() => participationChecked.delete(raw.event_id));
  };
  const listThreads = (room: Room) => {
    if (threadsListed.has(room.roomId)) return;
    threadsListed.add(room.roomId);
    client.http
      .authedRequest<{ chunk: IEvent[] }>(Method.Get, `/rooms/${enc(room.roomId)}/threads`, { include: 'participated', limit: String(PAGE) }, undefined, { prefix: ClientPrefix.V1 })
      .then(({ chunk }) => {
        for (const raw of chunk) {
          storeFor(room.roomId, raw.event_id).root = mapEvent(room.roomId, raw);
          checkParticipation(room.roomId, raw);
        }
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

  /** My real (not synthesized) unthreaded receipt: the one read position the server keeps for a project room. A synthesized
   * one for something I sent (moving a card) is 'main' and would hide it from readUpTo's thread check. */
  const unthreadedRead = (room: Room) => {
    const r = room.getReadReceiptForUserId(me.id, true);
    return r && r.data.thread_id !== MAIN ? (eventOf(room, r.eventId)?.getTs() ?? r.data.ts ?? 0) : 0;
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
      if (room && ours(room) && !room.getType()) st.replies.forEach((ev) => consider(room, ev));
    }
    const projects = client.getRooms().filter((r) => joined(r) && r.getType() === PROJECT_TYPE);
    items.push(
      ...issueActivityOf(projects, {
        me: me.id,
        message: (ev, room) => messageOf(ev, room, false, true),
        person: (room, userId) => personOf(room, userId),
        unread: (room, ev, root) => !readItems.has(ev.getId()!) && ev.getTs() > Math.max(readUpTo(room, root), unthreadedRead(room)),
      }),
    );
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
    const last = events.findLast((ev) => isMessage(ev) && !threadRootOf(ev)) ?? events.at(-1);
    return last?.getTs() ?? 0;
  };

  const lastMessageOf = (room: Room): Message | undefined => {
    const events = room.getLiveTimeline().getEvents();
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]!;
      if (!isMessage(ev) || threadRootOf(ev)) continue;
      const m = messageOf(ev, room);
      if (m && m.kind !== 'system') return m;
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
        const system = systemRoom(room);
        return {
          id: room.roomId,
          people: others.map((id) => personOf(room, id)).sort(byName),
          unread: room.getUnreadNotificationCount(NotificationCountType.Total),
          mentions: room.getUnreadNotificationCount(NotificationCountType.Highlight),
          lastTs: lastTsOf(room),
          last: lastMessageOf(room),
          spaceIds: system
            ? workspaceRoom ? [workspaceRoom.roomId] : []
            : spaceRooms.filter((s) => others.length && others.every((id) => s.getMember(id)?.membership === KnownMembership.Join)).map((s) => s.roomId),
          ...(room.hasEncryptionStateEvent() ? { encrypted: true } : {}),
          ...(mayState(room, me.id, PINS) ? { canPin: true } : {}),
          ...(system ? { system: true } : {}),
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

  const childOfMySpace = (roomId: string) =>
    spacesJoined().some((s) => (s.currentState.getStateEvents(EventType.SpaceChild, roomId)?.getContent().via?.length ?? 0) > 0);
  /** Channels auto-accepted this session: listed with the next write of `work.pasodrum.invited`. */
  const anchored = new Set<string>();
  const invitedNow = () => {
    const content: Record<string, unknown> = client.getAccountData(INVITED as never)?.getContent() ?? {};
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { content, rooms: new Set([...list(content.rooms), ...anchored]), people: new Set(list(content.people)), first: !Array.isArray(content.people) };
  };
  /**
   * The rooms whose levels I trust: joined spaces, and joined channels a joined space lists or `work.pasodrum.invited`
   * lists (an External's workspace channels). Never DMs, typed rooms (pages, projects) or other loose rooms: whoever
   * makes a room outranks everyone in it.
   */
  const teamRooms = (except?: Room) => {
    const { rooms } = invitedNow();
    return client.getRooms().filter((r) => r !== except && joined(r) && (r.isSpaceRoom() || (!r.getType() && (rooms.has(r.roomId) || childOfMySpace(r.roomId)))));
  };
  /**
   * D-36 trust anchor for when nothing is joined any more (removed and added again): `work.pasodrum.invited` also keeps
   * my team rooms and the people at Staff level or above in them. It only grows. An account that never wrote it starts
   * from the spaces and channels it's in.
   */
  let remembering: ReturnType<typeof setTimeout> | undefined;
  const rememberTeam = () => {
    remembering ??= setTimeout(() => {
      remembering = undefined;
      if (stopped) return;
      const was = invitedNow();
      const direct = directRooms();
      const team = was.first ? client.getRooms().filter((r) => ours(r) && !visiting.has(r.roomId) && (r.isSpaceRoom() || (!r.getType() && !isDirect(r, direct)))) : teamRooms();
      const rooms = new Set([...was.rooms, ...team.map((r) => r.roomId)]);
      const people = new Set(was.people);
      for (const r of team) {
        const f = powerFacts(r);
        for (const id of [...f.creators, ...Object.keys(f.users ?? {})]) if (id !== me.id && powerLevel(f, id) >= LEVEL.staff) people.add(id);
      }
      const listed = Array.isArray(was.content.rooms) ? new Set(was.content.rooms).size : -1;
      if (!was.first && rooms.size === listed && people.size === was.people.size) return;
      client.setAccountData(INVITED as never, { ...was.content, rooms: [...rooms], people: [...people] } as never).catch(noop);
    }, 2_000);
  };
  const holdsStaff = (userId: string) => teamRooms().some((r) => levelIn(r, userId) >= LEVEL.staff);
  const sharesRoom = async (userId: string, except?: Room) => {
    const rooms = teamRooms(except);
    await Promise.all(rooms.map((r) => r.loadMembersIfNeeded().catch(noop)));
    return rooms.some((r) => r.getMember(userId)?.membership === KnownMembership.Join);
  };
  const othersIn = (room: Room) =>
    room.getMembers().filter((m) => m.userId !== me.id && (m.membership === KnownMembership.Join || m.membership === KnownMembership.Invite)).map((m) => m.userId);
  /** MSC3266 joined count of a room I'm invited to; undefined = the server can't say (skip), null = failed (wait). */
  const joinedCount = (roomId: string) =>
    client.http
      .authedRequest<{ num_joined_members?: unknown }>(Method.Get, `/rooms/${enc(roomId)}/summary`, undefined, undefined, { prefix: '/_matrix/client/unstable/im.nheko.summary' })
      .then(
        (r) => (typeof r.num_joined_members === 'number' ? r.num_joined_members : null),
        (e: unknown) => (e instanceof MatrixError && e.errcode === 'M_UNRECOGNIZED' ? undefined : null),
      );

  /**
   * D-07/D-36: no accept step, but only from inside. Spaces and channels: the ones `work.pasodrum.invited` lists (the
   * invite service at claim, then my team rooms); with no team room left, also from the people it lists. Spaces: from
   * someone at Staff level or above in a team room of mine. Channels: inside one of my spaces; with no workspace
   * (Externals, clients) also from someone at Staff level in a team room of mine. DMs: everyone in them shares a team
   * room with me (no bridge between client spaces) and nobody joined is hidden from the invite; a group only when I'm
   * in the workspace or the inviter is at Staff level or above. Anything else waits unanswered.
   */
  const trusts = async (room: Room, inviter: string, dm: boolean) => {
    const inWorkspace = spacesJoined().some((s) => !isClientSpace(s));
    if (!dm) {
      const known = invitedNow();
      if (known.rooms.has(room.roomId) || (!teamRooms().length && known.people.has(inviter))) return true;
      return room.isSpaceRoom() ? holdsStaff(inviter) : childOfMySpace(room.roomId) || (!inWorkspace && holdsStaff(inviter));
    }
    const others = othersIn(room);
    // D-38: help DMs from the system sender, for the team only; nobody else in them.
    if (inviter === SYSTEM_ID) return inWorkspace && others.every((id) => id === SYSTEM_ID);
    if (!others.includes(inviter)) others.push(inviter);
    for (const id of others) if (!(await sharesRoom(id))) return false;
    // The invite shows only some members; a joined one it doesn't show could be anyone.
    const count = await joinedCount(room.roomId);
    if ((others.length > 1 || (count ?? 0) > 1) && !inWorkspace && !holdsStaff(inviter)) return false;
    return count === undefined || (count !== null && count <= room.getMembers().filter((m) => m.userId !== me.id && m.membership === KnownMembership.Join).length);
  };
  /**
   * After joining a DM: two invited at once both pass the count check, and someone who joined and left since isn't counted,
   * so anyone in it (or who was) not sharing a room with me means it's a bridge.
   */
  const bridged = async (room: Room) => {
    if (systemRoom(room)) return false;
    await room.loadMembersIfNeeded().catch(noop);
    for (const m of room.getMembers()) if (m.userId !== me.id && !(await sharesRoom(m.userId, room))) return true;
    return false;
  };
  /** DM invites that waited: checked again after a while, not on every sync (each check asks the server). */
  const waited = new Map<string, number>();
  /** One join at a time, spaces first: Continuwuity's sync can miss a space join that lands together with a channel join. */
  let joinQueue = Promise.resolve();
  const acceptInvites = () => {
    const invites = client.getRooms().filter((r) => r.getMyMembership() === KnownMembership.Invite && !joining.has(r.roomId) && Date.now() - (waited.get(r.roomId) ?? 0) > 30_000);
    for (const room of invites.sort((a, b) => Number(b.isSpaceRoom()) - Number(a.isSpaceRoom()))) {
      const dmInviter = room.isSpaceRoom() ? undefined : room.getDMInviter();
      const inviter = dmInviter ?? room.getMember(me.id)?.events.member?.getSender();
      if (!inviter) continue;
      joining.add(room.roomId);
      joinQueue = joinQueue.then(async () => {
        try {
          if (!(await trusts(room, inviter, !!dmInviter))) {
            if (dmInviter) waited.set(room.roomId, Date.now());
            throw new Error('waits');
          }
          visiting.delete(room.roomId);
          await client.joinRoom(room.roomId, { viaServers: [server] });
          await whenJoined(room.roomId);
          if (dmInviter && (await bridged(room))) {
            discarded.add(room.roomId);
            await client.leave(room.roomId).catch(noop);
            await client.forget(room.roomId, true).catch(noop);
            return;
          }
          if (dmInviter) await addDirect(room.roomId, [dmInviter]);
          else if (!room.getType()) anchored.add(room.roomId);
        } catch {
          joining.delete(room.roomId);
        }
      });
    }
  };

  const ensureMembers = (room: Room) => {
    if (membersRequested.has(room.roomId)) return;
    membersRequested.add(room.roomId);
    room.loadMembersIfNeeded().then(
      () => {
        schedule();
        acceptInvites();
      },
      () => membersRequested.delete(room.roomId),
    );
  };

  /** After each sync: member lists for spaces and DMs (spaceIds, external, auto-join) and, for the team, channels (outside mark); the server's thread list per room. */
  const housekeeping = () => {
    const direct = directRooms();
    const team = client.getRooms().some((r) => r.isSpaceRoom() && joined(r) && !isClientSpace(r));
    for (const room of client.getRooms()) {
      if (!ours(room) || discarded.has(room.roomId) || visiting.has(room.roomId)) continue;
      if (team || room.isSpaceRoom() || isDirect(room, direct)) ensureMembers(room);
      if (!room.getType()) listThreads(room);
    }
    acceptInvites();
    rememberTeam();
    encryptRooms(direct);
    openPins(direct);
    healStaff();
  };

  /** D-36: Staff sit at 10 in the workspace and its channels; where I may set levels, whoever joined below that is lifted (one write per room, then a pause). */
  const healing = new Set<string>();
  const healStaff = () => {
    if (!workspaceRoom?.membersLoaded()) return;
    const staff = workspaceRoom.getJoinedMembers().map((m) => m.userId);
    for (const room of [workspaceRoom, ...childRooms(workspaceRoom)]) {
      if (healing.has(room.roomId) || discarded.has(room.roomId) || visiting.has(room.roomId)) continue;
      const low = staff.filter((id) => levelIn(room, id) < LEVEL.staff && mayEditLevel(room, id, LEVEL.staff));
      if (!low.length) continue;
      healing.add(room.roomId);
      void writeState(room.roomId, EventType.RoomPowerLevels, (c) => withLevel(c, low, LEVEL.staff))
        .catch(noop)
        .finally(() => setTimeout(() => healing.delete(room.roomId), 30_000));
    }
  };

  /**
   * M7 (D-33): rooms made before M7 let only Admins pin; lift pins to 0 once per room, where I may change levels.
   * Archived rooms (events_default at Admin, D-28) keep pins at Admin; the server's copy decides.
   */
  const pinsOpen = (pl: Record<string, unknown>) => {
    const level = (pl.events as Record<string, unknown> | undefined)?.[PINS];
    return typeof level === 'number' && level <= LEVEL.client;
  };
  const archivedPl = (pl: Record<string, unknown>) => typeof pl.events_default === 'number' && pl.events_default >= LEVEL.admin;
  const openPins = (direct: Map<string, string[]>) => {
    for (const room of roomsJoined()) {
      if (lifted.has(room.roomId) || discarded.has(room.roomId) || visiting.has(room.roomId)) continue;
      const pl = room.currentState.getStateEvents(EventType.RoomPowerLevels, '')?.getContent() ?? {};
      if (pinsOpen(pl) || archivedPl(pl) || channelArchived(room)) continue;
      const created = room.currentState.getStateEvents(EventType.RoomCreate, '')?.getTs();
      if (!created || Date.now() - created < ENCRYPT_AFTER) continue;
      const space = spaceOf(room.roomId);
      if (!(space ? spaceStateOf(space).archived !== true : isDirect(room, direct)) || !mayState(room, me.id, EventType.RoomPowerLevels)) continue;
      lifted.add(room.roomId);
      void writeState(room.roomId, EventType.RoomPowerLevels, (c) =>
        pinsOpen(c) || archivedPl(c) ? c : { ...c, events: { ...((c.events as Record<string, unknown> | undefined) ?? {}), [PINS]: LEVEL.client } },
      ).catch(noop);
    }
  };

  /** D-11: every DM and every private workspace channel; client-space and public channels never. */
  const wantsEncryption = (room: Room, direct: Map<string, string[]>) => {
    if (room.isSpaceRoom() || systemRoom(room)) return false;
    if (isDirect(room, direct)) return true;
    const space = spaceOf(room.roomId);
    return room.getJoinRule() === 'invite' && !!space && !isClientSpace(space);
  };
  /**
   * D-31: turns encryption on once, where I may (irreversible, D-24); the server's copy decides, not a lagging sync.
   * Rooms younger than ENCRYPT_AFTER are left alone: Continuwuity writes a new room's initial state after createRoom
   * returns (it 404s meanwhile), and ours are made encrypted anyway.
   */
  const encryptRooms = (direct: Map<string, string[]>) => {
    if (!cryptoReady) return;
    for (const room of roomsJoined()) {
      if (encrypting.has(room.roomId) || discarded.has(room.roomId) || visiting.has(room.roomId) || room.hasEncryptionStateEvent()) continue;
      const created = room.currentState.getStateEvents(EventType.RoomCreate, '')?.getTs();
      if (!created || Date.now() - created < ENCRYPT_AFTER) continue;
      if (!wantsEncryption(room, direct) || !room.currentState.maySendStateEvent(EventType.RoomEncryption, me.id)) continue;
      encrypting.add(room.roomId);
      void ensureEncrypted(room.roomId).catch(() => encrypting.delete(room.roomId));
    }
  };
  const ensureEncrypted = async (roomId: string) => {
    const present = await client.getStateEvent(roomId, EventType.RoomEncryption, '').then(
      () => true,
      (e: unknown) => {
        if (e instanceof MatrixError && e.httpStatus === 404) return false;
        throw e;
      },
    );
    if (!present) await client.sendStateEvent(roomId, EventType.RoomEncryption, MEGOLM as never, '');
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
    const { room_id } = await client.createRoom({
      preset: Preset.PrivateChat,
      visibility: Visibility.Private,
      is_direct: true,
      invite: want,
      power_level_content_override: dmLevels(),
      initial_state: [{ type: EventType.RoomEncryption, state_key: '', content: MEGOLM }],
    });
    await addDirect(room_id, want).catch(noop);
    await whenJoined(room_id);
    return room_id;
  };

  /** D-06/D-36: a client space takes my workspace role; outside the workspace, the External mark (1) there comes before "its client"; in channels only, an External. */
  const myRolesOf = (spaces: Space[]): Record<string, Role> =>
    Object.fromEntries(
      spaces.map((s) => {
        const room = client.getRoom(s.id);
        if (!room || !joined(room)) return [s.id, 'external'];
        if (s.kind === 'workspace') return [s.id, roleOf(levelIn(room, me.id), 'workspace')];
        if (workspaceRoom) return [s.id, roleOf(levelIn(workspaceRoom, me.id), 'workspace')];
        return [s.id, levelIn(room, me.id) >= LEVEL.external ? 'external' : 'client'];
      }),
    );

  /** D-36. Access roles and External records from workspace state (only when I'm joined to it); empty content = deleted. */
  const rolesNow = (): AccessRole[] =>
    (workspaceRoom?.currentState.getStateEvents(ACCESS_ROLE) ?? [])
      .map((e) => accessRoleOf(e.getStateKey()!, e.getContent()))
      .filter((r): r is AccessRole => !!r)
      .sort((a, b) => a.name.localeCompare(b.name));
  const recordsNow = (): Record<string, ExternalRecord> => {
    const out: Record<string, ExternalRecord> = {};
    for (const e of workspaceRoom?.currentState.getStateEvents(EXTERNAL) ?? []) {
      const record = externalRecordOf(e.getContent());
      if (record) out[`@${e.getStateKey()!}`] = record;
    }
    return out;
  };

  /** D-28: clients and Externals in a channel (joined or invited), only for the team. */
  const withOutside = (channels: Record<string, Channel[]>, roles: Record<string, Role>) =>
    Object.fromEntries(
      Object.entries(channels).map(([spaceId, list]) => {
        const role = roles[spaceId];
        if (role !== 'owner' && role !== 'admin' && role !== 'staff') return [spaceId, list];
        return [
          spaceId,
          list.map((c) => {
            const room = client.getRoom(c.id);
            const pending = !room?.membersLoaded();
            const outside = (room?.getMembers() ?? [])
              .filter((m) => m.userId !== me.id && (m.membership === KnownMembership.Join || m.membership === KnownMembership.Invite) && isExternal(m.userId))
              .map((m) => person(m.userId, m.name, m.getMxcAvatarUrl()))
              .sort(byName);
            return outside.length || pending ? { ...c, ...(outside.length ? { outside } : {}), ...(pending ? { outsidePending: true } : {}) } : c;
          }),
        ];
      }),
    );

  /** E2: Owners, Admins and the channel's creator (exactly who may set its name and levels, D-27); never #general. */
  const manageable = (room: Room) => joined(room) && !isGeneral(room) && mayState(room, me.id, EventType.RoomName) && mayState(room, me.id, EventType.RoomPowerLevels);
  const withFlags = (channels: Record<string, Channel[]>) =>
    Object.fromEntries(
      Object.entries(channels).map(([spaceId, list]) => [
        spaceId,
        list.map((c) => {
          const room = client.getRoom(c.id);
          if (!room) return c;
          const archived = channelArchived(room);
          const spaceArchived = spaceStateOf(client.getRoom(spaceId) ?? room).archived === true;
          const flags = {
            ...(room.hasEncryptionStateEvent() ? { encrypted: true } : {}),
            ...(archived ? { archived: true } : {}),
            ...(manageable(room) ? { manageable: true } : {}),
            ...(!archived && !spaceArchived && mayState(room, me.id, PINS) ? { canPin: true } : {}),
          };
          return Object.keys(flags).length ? { ...c, ...flags } : c;
        }),
      ]),
    );

  /**
   * createClientSpace: a space I made stays out of the snapshot (with its channels) until it is whole, i.e. every channel
   * joined and listed. While one is being made, so does any new space of mine: it first syncs with only its create event.
   * Rolled-back rooms stay out for good: a sync still in flight can bring them back as joined after they were forgotten.
   * Channels removeFromSpace passed through stay out until I join them on purpose: our local leave lands before a
   * lagging sync that still says joined.
   */
  const halfMade = (rooms: Room[]) => {
    const ids = new Set(discarded);
    for (const id of visiting) ids.add(id);
    for (const r of rooms) {
      if (!r.isSpaceRoom() || snapshot.spaces.some((s) => s.id === r.roomId)) continue;
      const expected = expecting.get(r.roomId);
      if (expected) {
        const whole = expected.every((id) => {
          const channel = client.getRoom(id);
          return !!channel && joined(channel) && !!r.currentState.getStateEvents(EventType.SpaceChild, id);
        });
        if (!whole) ids.add(r.roomId);
      } else if (creating && r.currentState.getStateEvents(EventType.RoomCreate, '')?.getSender() === me.id) ids.add(r.roomId);
    }
    for (const r of rooms) if (r.currentState.getStateEvents(EventType.SpaceParent).some((e) => ids.has(e.getStateKey()!))) ids.add(r.roomId);
    return ids;
  };

  /**
   * D-38. Clients and Externals (not joined to the workspace) confirm by email. Unknown until the first sync, and while an
   * invite the invite service listed is still being accepted (a fresh Staff account's workspace invite).
   */
  function confirmByEmail(): boolean | undefined {
    if (!synced) return undefined;
    if (client.getRooms().some((r) => r.isSpaceRoom() && joined(r) && !isClientSpace(r))) return false;
    const listed = invitedNow().rooms;
    if (client.getRooms().some((r) => r.getMyMembership() === KnownMembership.Invite && listed.has(r.roomId))) return undefined;
    return true;
  }
  const securityOf = () => {
    const byEmail = confirmByEmail();
    return { ...security.state(), ...(byEmail === undefined ? {} : { confirmByEmail: byEmail }), ...(byEmail ? email.state() : {}) };
  };

  const build = (): WorkspaceSnapshot => {
    scanCache = null;
    const hidden = halfMade(client.getRooms());
    const rooms = client.getRooms().filter((r) => !hidden.has(r.roomId));
    metCache = null;
    clientCache = null;
    workspaceRoom = rooms.find((r) => r.isSpaceRoom() && joined(r) && !isClientSpace(r));
    const workspace = workspaceOf(rooms.map(factsOf), knownSpacesOf(client.getAccountData(SPACES as never)?.getContent()));
    const myRoles = myRolesOf(workspace.spaces);
    viewer = workspaceRoom ? 'team' : Object.values(myRoles).includes('external') ? 'external' : 'client';
    return {
      me,
      connection: connectionOf(syncState, synced),
      spaces: workspace.spaces,
      channels: withFlags(withOutside(workspace.channels, myRoles)),
      timelines: Object.fromEntries([...open].map(([id, flags]) => [id, timelineOf(id, flags)])),
      sessionExpired,
      typing: Object.fromEntries([...open.keys()].map((id) => [id, typingOf(id)] as const).filter(([, people]) => people.length)),
      uploads: Object.fromEntries([...trays].filter(([, items]) => items.length).map(([id, items]) => [id, items.map((i) => i.upload)])),
      dms: dmsOf(workspace.spaces),
      threads: threadsOf(),
      threadTimelines: Object.fromEntries([...openThreads].map(([id, flags]) => [id, threadTimelineOf(id, flags)])),
      activity: activityOf(),
      myRoles,
      security: securityOf(),
      accessRoles: rolesNow(),
      externals: recordsNow(),
    };
  };

  let creating = 0;
  /** Spaces made by createClientSpace → their channels. */
  const expecting = new Map<string, string[]>();
  const discarded = new Set<string>();
  const visiting = new Set<string>();
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
    while (room && visibleCount(room) < want && hasOlder(room, startOf(room))) {
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
    const encrypted = !!client.getRoom(channelId)?.hasEncryptionStateEvent();
    (async () => {
      const box = encrypted ? await encryptAttachment(await item.file.arrayBuffer()) : null;
      const { content_uri } = await client.uploadContent(box ? new Blob([box.data]) : item.file, {
        name: box ? undefined : item.file.name,
        type: box ? 'application/octet-stream' : item.file.type || undefined,
        includeFilename: !box,
        abortController: abort,
        progressHandler: ({ loaded, total }) => updateUpload(channelId, id, { progress: total ? Math.min(loaded / total, 1) : 0 }),
      });
      return { content_uri, sealed: box && { ...box.file, url: content_uri } };
    })()
      .then(async ({ content_uri, sealed: file }) => {
        const size = await imageSize(item.file);
        updateUpload(channelId, id, { status: 'done', progress: 1 }, { url: content_uri, info: size ?? {}, ...(file ? { sealed: file } : {}) });
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
      if (!synced) security.refresh();
      synced = true;
      markReady();
      housekeeping();
      email.kick();
    }
    schedule();
  });
  // D-38: another device rotated the key, or the backup key arrived after an emoji confirmation.
  client.on(ClientEvent.AccountData, (ev) => ev.getType().startsWith('m.secret_storage') && email.kick(true));
  client.on(CryptoEvent.KeyBackupDecryptionKeyCached, () => email.kick(true));
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
  // M7: pins, levels and archive flags can arrive only in a gappy sync's state, with no timeline event.
  const PIN_STATE = new Set<string>([PINS, EventType.RoomPowerLevels, CHANNEL_STATE, SPACE_STATE]);
  client.on(RoomStateEvent.Events, (ev) => {
    if (PIN_STATE.has(ev.getType())) schedule();
  });
  client.on(HttpApiEvent.SessionLoggedOut, (e) => {
    sessionExpired = true;
    client.stopClient();
    clearSession();
    // A soft logout keeps the device on the server, so its keys stay too.
    const soft = !!(e as MatrixError | undefined)?.data?.soft_logout;
    email.stop();
    void (soft ? Promise.resolve() : withTimeout(client.clearStores({ cryptoDatabasePrefix: CRYPTO_DB }))).finally(() => security.stop());
    schedule();
  });

  // SIDE-03: a "history shared" marker for me, from the other person in a 1:1 encrypted DM, makes this device take the keys.
  const bundles = createBundleReceiver(
    client,
    session.userId,
    (room, sender) => joined(room) && room.hasEncryptionStateEvent() && isDirect(room, directRooms()) && sameMembers(othersOf(room), [sender]),
    schedule,
  );
  client.on(MatrixEventEvent.Decrypted, (ev) => {
    bundles.seen(ev, client.getRoom(ev.getRoomId()));
    schedule();
  });
  void security.init().then((ok) => {
    cryptoReady = ok;
    if (sessionExpired || stopped) return;
    void client.startClient({ lazyLoadMembers: true, initialSyncLimit: PAGE, pendingEventOrdering: PendingEventOrdering.Detached });
  });
  client
    .getProfileInfo(session.userId)
    .then((p) => {
      me = { ...me, ...(p.displayname ? { name: p.displayname } : {}), ...(p.avatar_url ? { avatarUrl: p.avatar_url } : {}) };
      schedule();
    })
    .catch(noop);

  const sendText = (channelId: string, message: TextMessage) => void send(client, channelId, message).catch(schedule);

  // M4
  /** Resolves once `cond` holds for the snapshot (or after `ms`, so a slow sync never hangs the caller). */
  const settle = (cond: () => boolean, ms = 10_000) =>
    new Promise<void>((resolve) => {
      const check = () => void (cond() && done());
      const done = () => {
        listeners.delete(check);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, ms);
      listeners.add(check);
      check();
    });
  const inSnapshot = (channelId: string) => Object.values(snapshot.channels).some((list) => list.some((c) => c.id === channelId));

  /** The joined space a channel belongs to: one listing it as a child, else one it names as parent. */
  const spaceOf = (channelId: string) => {
    const parents = client.getRoom(channelId)?.currentState.getStateEvents(EventType.SpaceParent).map((e) => e.getStateKey()) ?? [];
    return (
      spacesJoined().find((s) => (s.currentState.getStateEvents(EventType.SpaceChild, channelId)?.getContent().via?.length ?? 0) > 0) ??
      spacesJoined().find((s) => parents.includes(s.roomId))
    );
  };

  const hierarchy = async (spaceId: string) => {
    const rooms: HierarchyRoom[] = [];
    let from: string | undefined;
    do {
      const res = await client.getRoomHierarchy(spaceId, 100, 1, false, from);
      rooms.push(...res.rooms);
      from = res.next_batch;
    } while (from && rooms.length < 1000);
    return rooms.filter((r) => r.room_id !== spaceId && !r.room_type);
  };

  /**
   * Members' roles (D-36). In the workspace: its members by their level there; then Externals (a record, or level 1 where we
   * meet) BEFORE "in a client space → client". Outside it, levels in `rooms` decide: 10+ team, 1 External (team to a
   * client: no tag), 0 client.
   */
  const roleFor = (userId: string, ...rooms: (Room | undefined)[]): Role => {
    if (workspaceRoom) {
      if (isMember(workspaceRoom, userId)) return roleOf(levelIn(workspaceRoom, userId), 'workspace');
      if (recordsNow()[userId] || (metLevel(userId) ?? 0) >= LEVEL.external) return 'external';
      return spacesJoined().some((s) => isClientSpace(s) && isMember(s, userId)) ? 'client' : 'external';
    }
    const level = Math.max(0, ...rooms.map((r) => levelIn(r, userId)));
    if (level >= LEVEL.staff) return roleOf(level, 'workspace');
    if (level >= LEVEL.external) return viewer === 'client' ? 'staff' : 'external';
    return 'client';
  };

  const chains = new Map<string, Promise<unknown>>();
  /**
   * Read-modify-write of a state event, one at a time per room and built from the server's copy: the synced one lags
   * our own last write, so two quick edits (colour, then archive) would otherwise undo each other.
   */
  const writeState = (roomId: string, type: string, change: (content: Record<string, unknown>) => Record<string, unknown>, stateKey = '') => {
    const next = (chains.get(roomId) ?? Promise.resolve())
      .catch(noop)
      .then(async () => {
        const current = (await client.getStateEvent(roomId, type, stateKey).catch((e: unknown) => {
          if (e instanceof MatrixError && e.httpStatus === 404) return {};
          throw e;
        })) as Record<string, unknown>;
        const changed = change(current);
        if (JSON.stringify(changed) === JSON.stringify(current)) return false;
        await client.sendStateEvent(roomId, type as never, changed as never, stateKey);
        return true;
      });
    chains.set(roomId, next);
    return next;
  };

  const setLevel = (room: Room, userId: string, level: number) =>
    writeState(room.roomId, EventType.RoomPowerLevels, (content) => {
      const users = { ...((content.users as Record<string, number> | undefined) ?? {}) };
      if (level === (typeof content.users_default === 'number' ? content.users_default : 0)) delete users[userId];
      else users[userId] = level;
      return { ...content, users };
    });
  const mayEditLevel = (room: Room, userId: string, level: number) => {
    const mine = levelIn(room, me.id);
    return room.currentState.maySendStateEvent(EventType.RoomPowerLevels, me.id) && level <= mine && (userId === me.id || levelIn(room, userId) < mine);
  };

  /** M7. An event fetched on its own (not in the timeline) gets its latest edit by the same sender. */
  const applyLatestEdit = async (roomId: string, ev: MatrixEvent) => {
    if (ev.isRedacted() || ev.replacingEventId()) return;
    const res = await client.fetchRelations(roomId, ev.getId()!, RelationType.Replace, null, { dir: Direction.Backward, limit: 1 }).catch(() => null);
    const raw = res?.chunk[0];
    if (!raw || raw.sender !== ev.getSender()) return;
    const edit = mapper({ ...raw, room_id: roomId });
    await client.decryptEventIfNeeded(edit).catch(noop);
    if (!edit.isDecryptionFailure()) ev.makeReplaced(edit);
  };

  /** M7/M8. Older history from the server, newest first, decrypted here (the server can't see inside encrypted messages). */
  const history = async (room: Room, from: string | undefined, limit: number, filter: object, signal?: AbortSignal) => {
    const res = await client.http.authedRequest<{ chunk: IEvent[]; end?: string }>(
      Method.Get,
      `/rooms/${enc(room.roomId)}/messages`,
      { dir: Direction.Backward, limit: String(limit), filter: JSON.stringify(filter), ...(from ? { from } : {}) },
      undefined,
      signal ? { abortSignal: signal } : undefined,
    );
    const events = res.chunk.map((raw) => room.findEventById(raw.event_id) ?? mapper({ ...raw, room_id: room.roomId }));
    await Promise.all(events.map((ev) => client.decryptEventIfNeeded(ev).catch(noop)));
    return { events, ...(res.end ? { end: res.end } : {}) };
  };

  // M8 (D-13)
  const search = createSearch({
    rooms(channelId) {
      // The gate: an unconfirmed device can't read encrypted conversations, so it doesn't search them.
      const confirmed = security.state().device === 'confirmed';
      const ids = channelId ? [channelId] : [...Object.values(snapshot.channels).flat().map((c) => c.id), ...snapshot.dms.map((d) => d.id)];
      return ids
        .map((id) => client.getRoom(id))
        .filter((r): r is Room => !!r && joined(r) && (confirmed || !r.hasEncryptionStateEvent()))
        .sort((a, b) => lastTsOf(b) - lastTsOf(a));
    },
    loaded: (room) => room.getLiveTimeline().getEvents().slice(startOf(room)?.index ?? 0),
    start: (room) => (hasOlder(room, startOf(room)) ? room.getLiveTimeline().getPaginationToken(Direction.Backward) : null),
    page: (room, from, limit, signal) => history(room, from, limit, MESSAGES_FILTER, signal),
    message: (ev, room) => messageOf(ev, room, false, true),
    threadRoot: threadRootOf,
  });

  /** SIDE-03: the encrypted 1:1 DM with someone, most recent first. */
  const dmWith = (userId: string) => {
    const direct = directRooms();
    return roomsJoined()
      .filter((r) => r.hasEncryptionStateEvent() && isDirect(r, direct) && sameMembers(othersOf(r), [userId]))
      .sort((a, b) => lastTsOf(b) - lastTsOf(a))[0];
  };

  /** M7. Pin or unpin, then wait (at most 10 s) until the change has synced. */
  const setPinned = async (channelId: string, messageId: string, on: boolean) => {
    await ready;
    if (!messageId.startsWith('$')) throw new Error('not-sent');
    const room = client.getRoom(channelId);
    if (!room || !joined(room) || !mayState(room, me.id, PINS)) throw new Error('not-allowed');
    await writeState(channelId, PINS, (content) => {
      const ids = (Array.isArray(content.pinned) ? content.pinned : []).filter((id): id is string => typeof id === 'string');
      if (ids.includes(messageId) === on) return content;
      return { ...content, pinned: on ? [...ids, messageId] : ids.filter((id) => id !== messageId) };
    }).catch((e: unknown) => Promise.reject(forbidden(e)));
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        client.off(RoomStateEvent.Events, check);
        clearTimeout(timer);
        schedule();
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        const r = client.getRoom(channelId);
        if (!r || pinsOf(r).has(messageId) === on) finish();
      };
      const timer = setTimeout(() => finish(new Error('timeout')), 10_000);
      client.on(RoomStateEvent.Events, check);
      check();
    });
  };

  /** D-27: a colleague (joined in the workspace) added to a client space joins its team: staff level (or their Owner/Admin level) where I may set it. */
  const inWorkspace = (userId: string) => workspaceRoom?.getMember(userId)?.membership === KnownMembership.Join;
  const teamLevel = (userId: string) => Math.max(LEVEL.staff, Math.min(levelIn(workspaceRoom, userId), LEVEL.owner));
  const joinTeam = async (space: Room, channel: Room, userId: string) => {
    await workspaceRoom?.loadMembersIfNeeded().catch(noop);
    if (!inWorkspace(userId)) return;
    const level = teamLevel(userId);
    for (const r of [space, channel]) if (levelIn(r, userId) < level && mayEditLevel(r, userId, level)) await setLevel(r, userId, level).catch(noop);
  };

  type Failure = AddPeopleResult['failed'][number]['reason'];
  const reasonOf = (e: unknown): Failure => (e instanceof MatrixError && e.errcode === 'M_FORBIDDEN') || (e instanceof Error && e.message === 'not-allowed') ? 'not-allowed' : 'other';
  /** Invites to the channel, and to its space unless they're an External (who get spaces only through roles, D-36). */
  /** `target` is what they're added to (the channel, or the space with `channel` as its home channel). */
  const inviteTo = async (target: Room, channel: Room | undefined, space: Room | undefined, userId: string, role: 'staff' | 'external' | 'client', again = false): Promise<Failure | null> => {
    const membership = target.getMember(userId)?.membership;
    if (membership === KnownMembership.Join || (membership === KnownMembership.Invite && !again)) return 'already-member';
    try {
      if (space && role !== 'external' && !isMember(space, userId)) await client.invite(space.roomId, userId);
      if (channel && !isMember(channel, userId)) await client.invite(channel.roomId, userId);
      if (space && channel && isClientSpace(space) && role === 'staff') await joinTeam(space, channel, userId);
      return null;
    } catch (e) {
      return reasonOf(e);
    }
  };

  const inviteLocale = (): 'en' | 'ja' => {
    const lang = client.getAccountData(SETTINGS as never)?.getContent<{ language?: string }>().language ?? (typeof navigator === 'undefined' ? 'en' : navigator.language);
    return lang?.startsWith('ja') ? 'ja' : 'en';
  };

  /** Runs a request that may need the password again (UIA); see PasswordRequired. */
  const withPassword = async (run: (auth?: AuthDict) => Promise<unknown>) => {
    try {
      await run();
    } catch (e) {
      let uia = uiaSession(e);
      if (uia === undefined) throw e;
      throw new PasswordRequired(async (password) => {
        try {
          await run({ type: 'm.login.password', identifier: { type: 'm.id.user', user: me.id }, password, ...(uia ? { session: uia } : {}) });
        } catch (err) {
          const again = uiaSession(err);
          if (again === undefined) throw err;
          uia = again || uia;
          throw new Error('wrong-password');
        }
      });
    }
  };

  const applyPush = async (ops: PushOp[]) => {
    for (const op of ops) {
      const kind = op.kind as PushRuleKind;
      if (op.op === 'delete') await client.deletePushRule('global', kind, op.ruleId);
      else if (op.op === 'enable') await client.setPushRuleEnabled('global', kind, op.ruleId, op.enabled).catch((e) => {
        // Older servers lack .m.rule.encrypted; nothing to switch then.
        if (!(e instanceof MatrixError && e.httpStatus === 404)) throw e;
      });
      else await client.addPushRule('global', kind, op.ruleId, { actions: op.actions, ...(op.conditions ? { conditions: op.conditions } : {}) } as never);
    }
    await client.getPushRules();
    schedule();
  };

  // M5
  const forbidden = (e: unknown) => (e instanceof MatrixError && e.errcode === 'M_FORBIDDEN' ? new Error('not-allowed', { cause: e }) : e);
  /** Joined channels a space lists. Channels I'm not in can't be changed by me. */
  const childRooms = (space: Room) =>
    space.currentState
      .getStateEvents(EventType.SpaceChild)
      .filter((e) => (e.getContent().via?.length ?? 0) > 0)
      .map((e) => client.getRoom(e.getStateKey()))
      .filter((r): r is Room => !!r && joined(r) && !r.isSpaceRoom());
  /** Where someone added to a whole space lands: the workspace's #general (else its first public channel), a client space's first channel. */
  const homeOf = (space: Room) => {
    const made = (r: Room) => r.currentState.getStateEvents(EventType.RoomCreate, '')?.getTs() ?? 0;
    const rooms = childRooms(space)
      .filter((r) => !channelArchived(r))
      .sort((a, b) => made(a) - made(b));
    if (isClientSpace(space)) return rooms[0];
    return rooms.find((r) => r.name.toLowerCase() === 'general') ?? rooms.find((r) => r.getJoinRule() === 'restricted' || r.getJoinRule() === 'public');
  };
  /** Over the client spaces my account knows (in, invited, or noted by the invite service): nothing on the server lists the others. */
  const nameTaken = (name: string, except?: string) => {
    const wanted = name.trim().toLowerCase();
    const known = knownSpacesOf(client.getAccountData(SPACES as never)?.getContent());
    return [
      ...client.getRooms().filter((r) => r.roomId !== except && r.isSpaceRoom() && isClientSpace(r) && isMember(r, me.id)).map((r) => r.name),
      ...Object.entries(known).filter(([id, k]) => id !== except && k.kind === 'client').map(([, k]) => k.name),
    ].some((n) => n.trim().toLowerCase() === wanted);
  };
  /** In a client space: workspace people by their workspace role, then Externals, everyone else is a client (pending ones too). Outside the workspace, the space's levels decide. */
  const spaceRole = (userId: string, space: Room): Role => (isClientSpace(space) ? roleFor(userId, space) : roleOf(levelIn(space, userId), 'workspace'));
  const isTeam = (role: Role) => role === 'owner' || role === 'admin' || role === 'staff';

  // D-36 people and access. Owners and Admins write access state; membership follows in their app (no background job).
  type Want = { channels: Set<string>; spaces: Set<string> };
  type Failed = AccessChange['failed'];
  const present = (m: string | undefined) => m === KnownMembership.Join || m === KnownMembership.Invite;
  /** From the server: membership is the access, so a lagging sync must not decide what to invite or kick. */
  const membershipOf = async (roomId: string, userId: string) =>
    ((await client.getStateEvent(roomId, EventType.RoomMember, userId).catch(() => ({}))) as { membership?: string }).membership;
  const usersOf = (room: Room) => (room.currentState.getStateEvents(EventType.RoomPowerLevels, '')?.getContent().users ?? {}) as Record<string, unknown>;
  const levelNeeded = (room: Room, key: 'invite' | 'kick', fallback: number) => {
    const v: unknown = room.currentState.getStateEvents(EventType.RoomPowerLevels, '')?.getContent()[key];
    return typeof v === 'number' ? v : fallback;
  };
  /** Workspace channels and client spaces I'm in: everything I can change for someone. */
  const workspaceChannels = () => (workspaceRoom ? childRooms(workspaceRoom) : []);
  const clientSpaces = () => spacesJoined().filter(isClientSpace);
  const mayEditAccess = () => !!workspaceRoom && mayState(workspaceRoom, me.id, EXTERNAL);
  const wantOf = (record: ExternalRecord | undefined, roles: AccessRole[]): Want => {
    const held = roles.filter((r) => record?.roles.includes(r.id));
    return { channels: new Set([...(record?.channels ?? []), ...held.flatMap((r) => r.channels)]), spaces: new Set(held.flatMap((r) => r.spaces)) };
  };
  /** A client: no External record, at level 0 in a client space of mine. Never made an External (they'd be put out of their own space). */
  const isClient = async (userId: string) => {
    if (recordsNow()[userId]) return false;
    const spaces = clientSpaces();
    await Promise.all(spaces.map((s) => s.loadMembersIfNeeded().catch(noop)));
    return spaces.some((s) => isMember(s, userId) && levelIn(s, userId) < LEVEL.external);
  };
  const writeRecord = (userId: string, record: ExternalRecord | null) =>
    writeState(workspaceRoom!.roomId, EXTERNAL, () => (record ? { roles: record.roles, channels: record.channels } : {}), externalKey(userId));
  const dropLevel = (roomId: string, userId: string) =>
    writeState(roomId, EventType.RoomPowerLevels, (c) => {
      const users = { ...((c.users as Record<string, number> | undefined) ?? {}) };
      if (!(userId in users)) return c;
      delete users[userId];
      return { ...c, users };
    });

  /** Out of one room, level entry cleared. A room I'm not in I pass through (join, kick, leave) when its join rule lets me; one that won't let me in goes into `shut`. */
  const evict = async (roomId: string, userId: string, stay = false, shut?: Set<string>) => {
    const room = client.getRoom(roomId);
    const passing = !room || !joined(room);
    let entered = false;
    if (passing) visiting.add(roomId);
    try {
      if (passing) {
        await client.joinRoom(roomId, { viaServers: [server] }).catch((e: unknown) => {
          shut?.add(roomId);
          throw e;
        });
        entered = true;
      }
      if (present(await membershipOf(roomId, userId))) await client.kick(roomId, userId);
      if (passing || userId in usersOf(room!)) await dropLevel(roomId, userId).catch(noop);
    } finally {
      if (entered && !stay) await client.leave(roomId).catch(noop);
      else if (passing) visiting.delete(roomId);
    }
  };
  /**
   * D-36 removal order: out of the space first (its restricted channels can't be rejoined after), then every channel it
   * lists; channels I'm not in only when they were in the space. Throws when the space refuses; resolves to the channels
   * that couldn't be done.
   */
  const outOfSpace = async (space: Room, userId: string, shut?: Set<string>) => {
    const wasIn = present(await membershipOf(space.roomId, userId));
    if (wasIn) await client.kick(space.roomId, userId);
    if (userId in usersOf(space)) await dropLevel(space.roomId, userId).catch(noop);
    const unreached: string[] = [];
    for (const e of space.currentState.getStateEvents(EventType.SpaceChild)) {
      const id = e.getStateKey()!;
      const room = client.getRoom(id);
      if (!e.getContent().via?.length || room?.isSpaceRoom() || (!wasIn && !(room && joined(room)))) continue;
      await evict(id, userId, false, shut).catch(() => unreached.push(id));
    }
    // Page rooms (D-37) aren't children; one I pass through stays joined, since the last member leaving would close it for good.
    for (const id of pageRoomsOf(space)) if (wasIn || client.getRoom(id)?.getMyMembership() === KnownMembership.Join) await evict(id, userId, true, shut).catch(() => unreached.push(id));
    return unreached;
  };

  /**
   * DES-05: a room of a client space being deleted: its `m.space.parent` names the space and was set by the room's
   * creator; never a DM, never a room the workspace lists.
   */
  const belongsTo = (room: Room, space: Room, ws: Room) => {
    const parent = room.currentState.getStateEvents(EventType.SpaceParent, space.roomId);
    if (!parent?.getContent().via?.length || parent.getSender() !== room.currentState.getStateEvents(EventType.RoomCreate, '')?.getSender()) return false;
    if ((ws.currentState.getStateEvents(EventType.SpaceChild, room.roomId)?.getContent().via?.length ?? 0) > 0) return false;
    return !room.isSpaceRoom() && !isDirect(room, directRooms());
  };

  /**
   * D-36: one External's rooms follow their access. Wanted client spaces: invited to the space and its home channel (its
   * other channels are restricted joins), level 1 in the space and its channels I can edit. Wanted workspace channels:
   * invited, level 1. Workspace channels and client spaces I'm in that aren't wanted: out (a space first, then its
   * channels). Steps already true are skipped; failures are collected, never thrown halfway.
   */
  const syncExternal = async (userId: string, want: Want): Promise<Failed> => {
    const failed: Failed = [];
    if (!workspaceRoom) return failed;
    await workspaceRoom.loadMembersIfNeeded().catch(noop);
    if (isMember(workspaceRoom, userId)) return failed;
    if (await isClient(userId)) return [{ userId, roomId: workspaceRoom.roomId }];
    const attempt = async (roomId: string, run: () => Promise<unknown>) => {
      try {
        await run();
      } catch {
        failed.push({ userId, roomId });
      }
    };
    const admit = async (room: Room) => {
      if (!present(await membershipOf(room.roomId, userId))) await client.invite(room.roomId, userId);
    };
    const mark = async (room: Room) => {
      if (levelIn(room, userId) === LEVEL.external) return;
      if (!mayEditLevel(room, userId, LEVEL.external)) throw new Error('not-allowed');
      await setLevel(room, userId, LEVEL.external);
    };
    const mine = (id: string) => {
      const r = client.getRoom(id);
      return r && joined(r) ? r : undefined;
    };
    for (const id of want.spaces) {
      const space = mine(id);
      if (!space || !isClientSpace(space)) {
        failed.push({ userId, roomId: id });
        continue;
      }
      await attempt(id, async () => {
        await admit(space);
        await mark(space);
      });
      const home = homeOf(space);
      for (const channel of childRooms(space))
        await attempt(channel.roomId, async () => {
          if (channel === home) await admit(channel);
          await mark(channel);
        });
    }
    for (const id of want.channels) {
      const room = mine(id);
      if (!room || room.isSpaceRoom()) {
        failed.push({ userId, roomId: id });
        continue;
      }
      await attempt(id, async () => {
        await admit(room);
        await mark(room);
      });
    }
    for (const space of clientSpaces()) {
      if (!want.spaces.has(space.roomId)) await attempt(space.roomId, async () => failed.push(...(await outOfSpace(space, userId)).map((roomId) => ({ userId, roomId }))));
    }
    for (const room of workspaceChannels()) if (!want.channels.has(room.roomId)) await attempt(room.roomId, () => evict(room.roomId, userId));
    // Back in step with the server before anyone reads externalAccess again.
    const skip = new Set(failed.map((f) => f.roomId));
    await settle(
      () =>
        [...want.channels, ...want.spaces].every((id) => skip.has(id) || !mine(id) || isMember(mine(id), userId)) &&
        [...workspaceChannels(), ...clientSpaces()].every((r) => skip.has(r.roomId) || want.channels.has(r.roomId) || want.spaces.has(r.roomId) || !isMember(r, userId)),
      5_000,
    );
    return failed;
  };
  const follow = async (records: Record<string, ExternalRecord>, roles: AccessRole[], which: (record: ExternalRecord) => boolean) => {
    const failed: Failed = [];
    for (const [userId, record] of Object.entries(records)) if (which(record)) failed.push(...(await syncExternal(userId, wantOf(record, roles))));
    return failed;
  };

  /** Everyone the access screens list as an External: records, level 1 in a room of mine (outside the workspace), pending email invites. */
  const externalsOf = async (only?: string, codes?: Awaited<ReturnType<typeof listInvites>>): Promise<ExternalAccess[]> => {
    const ws = workspaceRoom;
    if (!ws) return [];
    const channels = workspaceChannels();
    const spaces = clientSpaces();
    const rooms = [...channels, ...spaces];
    await Promise.all([ws, ...rooms].map((r) => r.loadMembersIfNeeded().catch(noop)));
    const records = recordsNow();
    const roles = rolesNow();
    const pending = (codes ?? (await listInvites(session.accessToken, ws.roomId).catch(() => []))).filter((i) => i.role === 'external' && i.userId);
    const ids = new Set([...Object.keys(records), ...pending.map((i) => i.userId!)]);
    for (const r of rooms) {
      for (const m of r.getMembers()) {
        const level = levelIn(r, m.userId);
        if (present(m.membership) && level >= LEVEL.external && level < LEVEL.staff) ids.add(m.userId);
      }
    }
    return [...ids]
      .filter((id) => (!only || id === only) && id !== me.id && !isMember(ws, id))
      .map((id): ExternalAccess => {
        const want = wantOf(records[id], roles);
        const at = (r: Room) => present(r.getMember(id)?.membership);
        const now = { channels: channels.filter(at).map((r) => r.roomId), spaces: spaces.filter(at).map((r) => r.roomId) };
        const differ = new Set<string>();
        const stuck = new Set<string>();
        for (const rid of [...want.channels, ...want.spaces]) {
          const r = client.getRoom(rid);
          if (!r || !joined(r)) {
            differ.add(rid);
            stuck.add(rid);
            continue;
          }
          const inIt = at(r);
          const marked = levelIn(r, id) === LEVEL.external;
          if (inIt && marked) continue;
          differ.add(rid);
          if ((!inIt && levelIn(r, me.id) < levelNeeded(r, 'invite', 0)) || (!marked && !mayEditLevel(r, id, LEVEL.external))) stuck.add(rid);
        }
        for (const rid of [...now.channels, ...now.spaces]) {
          if (want.channels.has(rid) || want.spaces.has(rid)) continue;
          differ.add(rid);
          const r = client.getRoom(rid)!;
          if (levelIn(r, me.id) < levelNeeded(r, 'kick', LEVEL.admin) || levelIn(r, id) >= levelIn(r, me.id)) stuck.add(rid);
        }
        const code = pending.find((i) => i.userId === id);
        const member = rooms.map((r) => r.getMember(id)).find((m) => !!m);
        const joinedSomewhere = rooms.some((r) => r.getMember(id)?.membership === KnownMembership.Join);
        const isPending = !joinedSomewhere && (!!code || now.channels.length + now.spaces.length > 0);
        return {
          person: person(id, member?.name ?? client.getUser(id)?.displayName ?? code?.name, member?.getMxcAvatarUrl()),
          ...(code ? { email: code.email } : {}),
          ...(isPending ? { pending: true } : {}),
          roles: (records[id]?.roles ?? []).filter((r) => roles.some((x) => x.id === r)),
          channels: records[id]?.channels ?? [],
          ...(differ.size ? { notApplied: true } : {}),
          ...(stuck.size ? { stuck: [...stuck] } : {}),
          rooms: now,
        };
      })
      .sort((a, b) => byName(a.person, b.person));
  };

  /** Put on a client space's team (as createClientSpace does): invited to the space and every channel of it I'm in, at their team level where I may set it. */
  const onTeam = async (space: Room, userId: string) => {
    const level = teamLevel(userId);
    const rooms = [space, ...childRooms(space)];
    await Promise.all(rooms.map((r) => r.loadMembersIfNeeded().catch(noop)));
    for (const r of rooms) {
      if (!isMember(r, userId)) await client.invite(r.roomId, userId);
      if (levelIn(r, userId) < level && mayEditLevel(r, userId, level)) await setLevel(r, userId, level).catch(noop);
    }
  };

  const docsBoards = createDocsBoards({ client, userId: session.userId, server, ready, person: (id, roomId) => personOf(roomId ? client.getRoom(roomId) : null, id, client.getUser(id)?.displayName) });
  // D-37: issue mentions and assignments reach Activity only through joined project rooms (few and quiet), so join them
  // after the first sync and again when a space gains a child, not only when Boards opens.
  void docsBoards.ensureProjects().catch(noop);
  let projectsLater: ReturnType<typeof setTimeout> | undefined;
  client.on(RoomStateEvent.Events, (ev) => {
    if (!synced || ev.getType() !== EventType.SpaceChild || !client.getRoom(ev.getRoomId())?.isSpaceRoom()) return;
    clearTimeout(projectsLater);
    projectsLater = setTimeout(() => void docsBoards.ensureProjects().catch(noop), 2000);
  });

  return {
    getSnapshot: () => snapshot,
    docsBoards,
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
    useHere() {
      security.useHere();
    },
    async signOut() {
      for (const items of trays.values()) items.forEach(dropUpload);
      trays.clear();
      typingSent.forEach((t) => clearTimeout(t.idle));
      for (const url of media.values()) url.then(URL.revokeObjectURL, noop);
      media.clear();
      stopped = true;
      bundles.stop();
      await docsBoards.stop();
      email.stop();
      const loggedOut = await client.logout(true).then(
        () => true,
        () => false,
      );
      client.stopClient();
      client.removeAllListeners();
      clearSession();
      // The server forgot this device, so its keys go too. If it couldn't be told (offline), they stay.
      if (loggedOut) await withTimeout(client.clearStores({ cryptoDatabasePrefix: CRYPTO_DB }));
      security.stop();
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
      // Encryption is decided now: a file uploaded in the clear before the room turned encrypted isn't sent; it
      // stays in the tray as failed, and Retry uploads it encrypted.
      const encrypted = !!room?.hasEncryptionStateEvent();
      const unsafe = items.filter((i) => i.upload.status === 'done' && encrypted && !i.sealed);
      for (const item of items) {
        if (item.upload.status !== 'done' || !item.url || unsafe.includes(item)) continue;
        const { name, mimetype, size } = item.upload;
        sendText(channelId, {
          msgtype: msgtypeOf(mimetype),
          body: name,
          file: { url: item.url, info: { ...(mimetype ? { mimetype } : {}), size, ...item.info }, ...(item.sealed ? { sealed: item.sealed } : {}) },
          mentions: replyTo ? withReply([]) : [],
          replyTo,
          thread,
        });
        replyTo = undefined;
      }
      // Clears the tray; uploads still in flight stay so they aren't lost.
      const keep = (i: TrayItem) => i.upload.status === 'uploading' || unsafe.includes(i);
      items.filter((i) => !keep(i)).forEach(dropUpload);
      trays.set(channelId, items.filter(keep).map((i) => (unsafe.includes(i) ? { ...i, url: undefined, upload: { ...i.upload, status: 'failed' as const } } : i)));
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
        .map((m) => person(m.userId, m.name, m.getMxcAvatarUrl()))
        .sort(byName);
    },
    mediaUrl(ref, opts) {
      const key = `${ref}|${opts?.thumbnail ? 'thumbnail' : 'download'}`;
      let url = media.get(key);
      const box = sealed.get(ref);
      if (!url && box) {
        // Encrypted media: the server only has ciphertext, so no thumbnails; download, check and decrypt here.
        const http = client.mxcUrlToHttp(box.file.url, undefined, undefined, undefined, false, true, true);
        url = (async () => {
          if (!http) throw new Error('not a media reference');
          const res = await fetch(http, { headers: { Authorization: `Bearer ${session.accessToken}` } });
          if (!res.ok) throw new Error(String(res.status));
          const plain = await decryptAttachment(await res.arrayBuffer(), box.file);
          return URL.createObjectURL(new Blob([plain], box.mimetype ? { type: box.mimetype } : {}));
        })();
        url.catch(() => media.delete(key));
        media.set(key, url);
      }
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
      if (item?.issue) {
        // It opens the issue, which reads all of it. The server keeps one read position per project room: move it only
        // when no older item about another issue there is still unread.
        const issueId = item.issue.id;
        const unread = snapshot.activity.filter((a) => a.unread && a.channelId === item.channelId);
        const newest = unread.filter((a) => a.issue?.id === issueId).reduce((x, a) => (a.message.ts > x.message.ts ? a : x), item);
        unread.forEach((a) => a.issue?.id === issueId && readItems.add(a.id));
        const last = room && eventOf(room, newest.id);
        const older = unread.some((a) => a.issue?.id !== issueId && a.message.ts <= newest.message.ts);
        if (!room || !last || older || last.getTs() <= unthreadedRead(room)) return;
        // Known here before the echo, so the issue panel's thread receipt doesn't move the position back.
        for (const key of [MAIN, issueId]) receipts.set(`${room.roomId}|${key}`, Math.max(receipts.get(`${room.roomId}|${key}`) ?? 0, last.getTs()));
        client.http.authedRequest(Method.Post, `/rooms/${enc(room.roomId)}/receipt/${ReceiptType.Read}/${enc(newest.id)}`, undefined, {}).catch(noop);
        return;
      }
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
      for (const s of spaces) for (const m of s.getJoinedMembers()) people.set(m.userId, person(m.userId, m.name, m.getMxcAvatarUrl()));
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
    async createChannel({ spaceId, name, private: isPrivate, topic }) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!space || !joined(space) || !space.currentState.maySendStateEvent(EventType.SpaceChild, me.id)) throw new Error('not-allowed');
      const wanted = name.trim();
      const known = [...(await hierarchy(spaceId)).map((r) => r.name ?? ''), ...(snapshot.channels[spaceId] ?? []).map((c) => c.name)];
      if (known.some((n) => n.toLowerCase() === wanted.toLowerCase())) throw new Error('taken');
      // D-27: the space's Owners, Admins and team keep their level; I'm the creator (room version 12: not listed).
      const facts = powerFacts(space);
      const levels = powerLevels(isClientSpace(space) ? 'client' : 'workspace', 'channel', channelUsers(facts.users ?? {}, facts.creators, me.id));
      const encrypted = isPrivate && !isClientSpace(space);
      const { room_id } = await client.createRoom({
        name: wanted,
        ...(topic?.trim() ? { topic: topic.trim() } : {}),
        preset: Preset.PrivateChat,
        visibility: Visibility.Private,
        power_level_content_override: levels,
        initial_state: [
          { type: EventType.SpaceParent, state_key: spaceId, content: { via: [server], canonical: true } },
          { type: EventType.RoomHistoryVisibility, state_key: '', content: { history_visibility: 'shared' } },
          // Private = invite-only, encrypted in the workspace (D-11). Public = restricted to the space (D-06).
          { type: EventType.RoomJoinRules, state_key: '', content: isPrivate ? { join_rule: 'invite' } : { join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: spaceId }] } },
          ...(encrypted ? [{ type: EventType.RoomEncryption, state_key: '', content: MEGOLM }] : []),
        ],
      });
      await client.sendStateEvent(spaceId, EventType.SpaceChild, { via: [server] }, room_id);
      // A new room syncs a piece at a time; wait until it shows as made, not just present.
      const made = () => snapshot.channels[spaceId]?.find((c) => c.id === room_id);
      await settle(() => made()?.private === isPrivate && (made()?.topic ?? '') === (topic?.trim() ?? ''));
      return room_id;
    },
    async browseChannels(spaceId) {
      await ready;
      const rooms = await hierarchy(spaceId);
      return rooms
        .map((r): JoinableChannel | null => {
          const room = client.getRoom(r.room_id);
          const isJoined = !!room && joined(room);
          const rule: string | undefined = r.join_rule;
          const isPrivate = rule !== 'restricted' && rule !== 'public';
          if (isPrivate && !isJoined) return null;
          return {
            id: r.room_id,
            spaceId,
            name: r.name ?? room?.name ?? '',
            ...(r.topic ? { topic: r.topic } : {}),
            private: isPrivate,
            memberCount: r.num_joined_members,
            joined: isJoined,
            ...((room && isJoined ? channelArchived(room) : client.getRoom(spaceId)?.currentState.getStateEvents(EventType.SpaceChild, r.room_id)?.getContent()[ARCHIVED_CHILD] === true)
              ? { archived: true }
              : {}),
          };
        })
        .filter((c): c is JoinableChannel => !!c)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async joinChannel(channelId) {
      visiting.delete(channelId);
      await client.joinRoom(channelId, { viaServers: [server] });
      await settle(() => inSnapshot(channelId));
    },
    async leaveChannel(channelId) {
      await client.leave(channelId);
      await settle(() => !inSnapshot(channelId));
    },
    async setTopic(channelId, topic) {
      await client.setRoomTopic(channelId, topic.trim());
    },
    async channelMembers(channelId) {
      await ready;
      const room = client.getRoom(channelId);
      if (!room) return [];
      await Promise.all([room, ...spacesJoined()].map((r) => r.loadMembersIfNeeded().catch(noop)));
      const space = spaceOf(channelId);
      return room
        .getMembers()
        .filter((m) => m.membership === KnownMembership.Join || m.membership === KnownMembership.Invite)
        .map((m): Member => ({
          person: person(m.userId, m.name, m.getMxcAvatarUrl()),
          role: roleFor(m.userId, space, room),
          ...(m.membership === KnownMembership.Invite ? { pending: true } : {}),
        }))
        .sort((a, b) => Number(!!a.pending) - Number(!!b.pending) || byName(a.person, b.person));
    },
    async setRole(spaceId, userId, role) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!space || !mayChangeRole(levelIn(space, me.id), levelIn(space, userId), role, userId === me.id)) throw new Error('not-allowed');
      // D-27/D-36: the role is carried into every space of mine they're in (Staff = 10 everywhere) and those spaces' channels.
      const spaces = [space, ...spacesJoined().filter((s) => s !== space && isMember(s, userId))];
      const plan: [Room, number][] = [];
      for (const s of spaces) {
        const level = LEVEL[role];
        plan.push([s, level]);
        for (const e of s.currentState.getStateEvents(EventType.SpaceChild)) {
          const r = client.getRoom(e.getStateKey());
          if (r && joined(r) && !r.isSpaceRoom()) plan.push([r, level]);
        }
        for (const r of pageRoomsOf(s).map((id) => client.getRoom(id))) if (r && joined(r)) plan.push([r, level]);
      }
      if (!mayEditLevel(space, userId, plan[0]![1])) throw new Error('not-allowed');
      const changes = plan.filter(([r, level]) => levelIn(r, userId) !== level && mayEditLevel(r, userId, level));
      // The space first: when the server refuses there (my view was stale), nothing else changes.
      await setLevel(space, userId, plan[0]![1]).catch((e: unknown) => {
        throw e instanceof MatrixError && e.errcode === 'M_FORBIDDEN' ? new Error('not-allowed') : e;
      });
      await Promise.allSettled(changes.filter(([r]) => r !== space).map(([r, level]) => setLevel(r, userId, level)));
      await settle(() => userId !== me.id || snapshot.myRoles[spaceId] === roleOf(plan[0]![1], 'workspace'));
    },
    async removeFromChannel(channelId, userId) {
      await client.kick(channelId, userId);
    },
    async addPeople(targetId, req) {
      await ready;
      const result: AddPeopleResult = { added: [], invited: [], failed: [] };
      const target = client.getRoom(targetId);
      if (!target) throw new Error('not-allowed');
      const space = target.isSpaceRoom() ? target : spaceOf(targetId);
      const channel = target.isSpaceRoom() ? homeOf(target) : target;
      const ws = workspaceRoom;
      await Promise.all([target, channel, space, ws].filter((r): r is Room => !!r).map((r) => r.loadMembersIfNeeded().catch(noop)));
      const ids = [...new Set(req.userIds)];
      const emails = [...new Set(req.emails.map((e) => e.trim()).filter(Boolean))];
      const refuseAll = (reason: Failure) => {
        for (const who of [...ids, ...emails]) result.failed.push({ who, reason });
        return result;
      };
      /**
       * Each id, then each email: its account comes from the invite service (`exists` = an account already there), then
       * it's added the same way. `fresh` = a code for a new or still-unclaimed account (their pending invites stand).
       */
      const each = async (add: (userId: string, by: { email: boolean; fresh: boolean }) => Promise<Failure | null>, invite: Omit<NewInvite, 'email' | 'locale'> | null) => {
        for (const id of ids) {
          const failure = await add(id, { email: false, fresh: false });
          if (failure) result.failed.push({ who: id, reason: failure });
          else result.added.push(id);
        }
        for (const email of emails) {
          if (!invite) {
            result.failed.push({ who: email, reason: 'not-allowed' });
            continue;
          }
          let userId: string;
          let fresh = true;
          try {
            ({ userId } = await createInvite(session.accessToken, { ...invite, email, locale: inviteLocale() }));
          } catch (e) {
            if (!(e instanceof InviteError && e.code === 'exists' && e.userId)) {
              const code = e instanceof InviteError ? e.code : 'other';
              result.failed.push({ who: email, reason: code === 'invalid-email' || code === 'not-allowed' ? code : 'other' });
              continue;
            }
            userId = e.userId;
            fresh = false;
          }
          const failure = await add(userId, { email: true, fresh });
          if (failure) result.failed.push({ who: email, reason: failure });
          else if (fresh) result.invited.push(email);
          else result.added.push(userId);
        }
        return result;
      };

      if (req.type === 'staff') {
        // Owner/Admin: into the workspace and its home channel at Staff level, and onto these client spaces' teams.
        if (!ws || target !== ws || levelIn(ws, me.id) < LEVEL.admin) return refuseAll('not-allowed');
        const home = homeOf(ws);
        const spaces = req.spaces.map((id) => client.getRoom(id)).filter((r): r is Room => !!r && joined(r) && isClientSpace(r));
        await Promise.all(spaces.map((r) => r.loadMembersIfNeeded().catch(noop)));
        return each(
          async (userId, by) => {
            if (!by.fresh && isMember(ws, userId) && spaces.every((s) => isMember(s, userId))) return 'already-member';
            try {
              for (const r of [ws, home]) if (r && !isMember(r, userId)) await client.invite(r.roomId, userId);
              for (const r of [ws, ...childRooms(ws)]) if (levelIn(r, userId) < LEVEL.staff && mayEditLevel(r, userId, LEVEL.staff)) await setLevel(r, userId, LEVEL.staff).catch(noop);
              for (const s of spaces) await onTeam(s, userId);
              return null;
            } catch (e) {
              return reasonOf(e);
            }
          },
          { role: 'staff', spaceId: ws.roomId, channelIds: home ? [home.roomId] : [] },
        );
      }

      if (req.type === 'external') {
        // Owner/Admin: the record first (what they should reach), then membership follows.
        if (!ws || target !== ws || !mayEditAccess()) return refuseAll('not-allowed');
        const roles = rolesNow();
        const records = recordsNow();
        const granted = wantOf({ roles: req.roles, channels: req.channels }, roles);
        const rooms = [...granted.channels, ...granted.spaces].filter((id) => {
          const r = client.getRoom(id);
          return !!r && joined(r);
        });
        await Promise.all(workspaceChannels().map((r) => r.loadMembersIfNeeded().catch(noop)));
        return each(
          async (userId, by) => {
            if (isMember(ws, userId)) return 'already-member';
            const prev = records[userId];
            if (!prev && (await isClient(userId))) return 'not-allowed';
            // Someone with no record yet keeps the workspace channels they're already in (nobody loses access).
            const had = prev?.channels ?? workspaceChannels().filter((r) => isMember(r, userId)).map((r) => r.roomId);
            const record = { roles: [...new Set([...(prev?.roles ?? []), ...req.roles])], channels: [...new Set([...had, ...req.channels])] };
            if (!by.fresh && prev && JSON.stringify(prev) === JSON.stringify(record)) return 'already-member';
            try {
              await writeRecord(userId, record);
            } catch (e) {
              return reasonOf(e);
            }
            records[userId] = record;
            return (await syncExternal(userId, wantOf(record, roles))).length ? 'other' : null;
          },
          { role: 'external', spaceId: ws.roomId, channelIds: rooms },
        );
      }

      if (req.type === 'client') {
        // The team of that client space (Staff and up there).
        if (!space || !isClientSpace(space) || levelIn(space, me.id) < LEVEL.staff) return refuseAll('not-allowed');
        return each((userId, by) => inviteTo(target, channel, space, userId, 'client', by.fresh), { role: 'client', spaceId: space.roomId, channelIds: channel ? [channel.roomId] : [] });
      }

      if (target.isSpaceRoom()) return refuseAll('other');
      const colleague = (userId: string) => !!ws && isMember(ws, userId);
      if (space && isClientSpace(space)) {
        // A client space's channel: colleagues join its team, others are added to the channel, new emails are its clients.
        return each(
          (userId, by) => inviteTo(target, target, colleague(userId) || by.email ? space : undefined, userId, colleague(userId) ? 'staff' : 'client', by.fresh),
          levelIn(space, me.id) >= LEVEL.staff ? { role: 'client', spaceId: space.roomId, channelIds: [target.roomId] } : null,
        );
      }
      // A workspace channel: colleagues as they are; Externals also get the mark and the channel as a one-off when I may
      // write access (Owner/Admin); new emails are new Externals, Owner/Admin only.
      const editor = mayEditAccess();
      const external = async (userId: string, again: boolean): Promise<Failure | null> => {
        if (await isClient(userId)) return 'not-allowed';
        const failure = await inviteTo(target, target, undefined, userId, 'external', again);
        if (failure || !editor) return failure;
        try {
          const prev = recordsNow()[userId];
          if (!prev?.channels.includes(target.roomId)) await writeRecord(userId, { roles: prev?.roles ?? [], channels: [...(prev?.channels ?? []), target.roomId] });
          if (levelIn(target, userId) !== LEVEL.external) await setLevel(target, userId, LEVEL.external);
          return null;
        } catch (e) {
          return reasonOf(e);
        }
      };
      return each(
        (userId, by) => (!by.email && colleague(userId) ? inviteTo(target, target, space, userId, 'staff') : external(userId, by.fresh)),
        editor && ws ? { role: 'external', spaceId: ws.roomId, channelIds: [target.roomId] } : null,
      );
    },
    async pendingInvites(channelId) {
      return listInvites(session.accessToken, channelId).catch(() => []);
    },
    resendInvite: (code) => resendInvite(session.accessToken, code),
    revokeInvite: (code) => revokeInvite(session.accessToken, code),
    async updateProfile(patch) {
      const name = patch.name?.trim();
      if (name) await client.setDisplayName(name);
      let avatarUrl: string | undefined;
      if (patch.avatar) {
        ({ content_uri: avatarUrl } = await client.uploadContent(patch.avatar, { name: patch.avatar.name, type: patch.avatar.type || undefined }));
        await client.setAvatarUrl(avatarUrl);
      }
      if (patch.timeZone) await client.http.authedRequest(Method.Put, `/profile/${enc(me.id)}/m.tz`, undefined, { 'm.tz': patch.timeZone });
      me = { ...me, ...(name ? { name } : {}), ...(avatarUrl ? { avatarUrl } : {}) };
      schedule();
    },
    async devices() {
      const { devices } = await client.getDevices();
      const confirmed = await security.confirmed(devices.map((d) => d.device_id)).catch(() => new Set<string>());
      return devices
        .map((d) => ({
          id: d.device_id,
          name: d.display_name || d.device_id,
          ...(d.last_seen_ts ? { lastSeenTs: d.last_seen_ts } : {}),
          current: d.device_id === session.deviceId,
          confirmed: confirmed.has(d.device_id),
        }))
        .sort((a, b) => Number(b.current) - Number(a.current) || (b.lastSeenTs ?? 0) - (a.lastSeenTs ?? 0));
    },
    async signOutDevice(deviceId) {
      await withPassword((auth) => client.deleteDevice(deviceId, auth));
    },
    async signOutOtherDevices() {
      const { devices } = await client.getDevices();
      const others = devices.map((d) => d.device_id).filter((id) => id !== session.deviceId);
      if (others.length) await withPassword((auth) => client.deleteMultipleDevices(others, auth));
    },
    notifyLevel(channelId) {
      const rules = client.pushRules as PushRules | undefined;
      return channelId === 'default' ? defaultLevel(rules) : roomLevel(rules, channelId);
    },
    async setNotifyLevel(channelId, level) {
      await ready;
      await applyPush(channelId === 'default' ? defaultOps(level) : roomOps(client.pushRules as PushRules | undefined, channelId, level));
    },
    async setSetting(key, value) {
      await ready;
      const prev = client.getAccountData(SETTINGS as never)?.getContent<Record<string, unknown>>() ?? {};
      await client.setAccountData(SETTINGS as never, { ...prev, [key]: value } as never);
    },
    async createClientSpace({ name, colour, channels: channelNames, team, clientEmails }) {
      await ready;
      if (!workspaceRoom || levelIn(workspaceRoom, me.id) < LEVEL.admin) throw new Error('not-allowed');
      const wanted = name.trim();
      const names = channelNames.map((n) => n.trim()).filter((n, i, all) => n && all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
      if (!wanted || !names.length) throw new Error('other');
      const emails = [...new Set(clientEmails.map((e) => e.trim()).filter(Boolean))];
      if (emails.some((e) => !normalizeEmail(e))) throw new Error('invalid-email');
      if (nameTaken(wanted)) throw new Error('name-taken');
      await workspaceRoom.loadMembersIfNeeded().catch(noop);
      const teamIds = [...new Set(team)].filter((id) => id !== me.id && inWorkspace(id));
      const users = Object.fromEntries(teamIds.map((id) => [id, teamLevel(id)]));
      const made: string[] = [];
      const invited: [string, string][] = [];

      // The team's invites go out once everything exists, so nobody sees the space half-made.
      const make = async () => {
        const { room_id: spaceId } = await client.createRoom({
          name: wanted,
          preset: Preset.PrivateChat,
          visibility: Visibility.Private,
          creation_content: { type: RoomType.Space },
          power_level_content_override: powerLevels('client', 'space', users),
          initial_state: [{ type: SPACE_STATE, state_key: '', content: { kind: 'client', colour } }],
        });
        made.push(spaceId);
        const levels = powerLevels('client', 'channel', channelUsers(users, [], me.id));
        // One at a time: room version 12 derives the ID from the create event, so two made in the same millisecond collide.
        for (const n of names) {
          const { room_id } = await client.createRoom({
            name: n,
            preset: Preset.PrivateChat,
            visibility: Visibility.Private,
            power_level_content_override: levels,
            initial_state: [
              { type: EventType.SpaceParent, state_key: spaceId, content: { via: [server], canonical: true } },
              { type: EventType.RoomHistoryVisibility, state_key: '', content: { history_visibility: 'shared' } },
              { type: EventType.RoomJoinRules, state_key: '', content: { join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: spaceId }] } },
            ],
          });
          made.push(room_id);
        }
        const channelIds = made.slice(1);
        await Promise.all(channelIds.map((id) => client.sendStateEvent(spaceId, EventType.SpaceChild, { via: [server] }, id)));
        // Settled, so a rollback only starts once no invite is still on its way.
        const sent = await Promise.allSettled(
          teamIds.map(async (userId) => {
            for (const roomId of made) {
              await client.invite(roomId, userId);
              invited.push([roomId, userId]);
            }
          }),
        );
        const refused = sent.find((r) => r.status === 'rejected');
        if (refused) throw refused.reason;
        return { spaceId, channelIds };
      };

      const before = new Set((await client.getJoinedRooms()).joined_rooms);
      const started = Date.now() - 60_000;
      creating++;
      let result: { spaceId: string; channelIds: string[] };
      try {
        result = await make();
        expecting.set(result.spaceId, result.channelIds);
      } catch (e) {
        // A createRoom that fails part way still leaves a room behind, without telling us its ID.
        for (const id of (await client.getJoinedRooms().catch(() => ({ joined_rooms: [] as string[] }))).joined_rooms) {
          if (before.has(id) || made.includes(id)) continue;
          const create = (await client.roomState(id).catch(() => [])).find((ev) => ev.type === EventType.RoomCreate);
          if (create?.sender === me.id && create.origin_server_ts >= started) made.push(id);
        }
        await Promise.allSettled(invited.map(([roomId, userId]) => client.kick(roomId, userId)));
        for (const id of [...made].reverse()) {
          discarded.add(id);
          await client.leave(id).catch(noop);
          await client.forget(id, true).catch(noop);
        }
        throw new Error(e instanceof MatrixError && e.errcode === 'M_FORBIDDEN' ? 'not-allowed' : 'other', { cause: e });
      } finally {
        creating--;
        schedule();
      }
      // The space stands from here on; mail may already be out, so a failing email never undoes it. Whoever didn't get
      // a code or an invite simply isn't pending (the UI can add them again); an unsent mail still has its join link.
      const { spaceId, channelIds } = result;
      for (const email of emails) {
        let userId: string;
        try {
          ({ userId } = await createInvite(session.accessToken, { email, role: 'client', spaceId, channelIds, locale: inviteLocale() }));
        } catch (e) {
          if (!(e instanceof InviteError && e.code === 'exists' && e.userId)) continue;
          userId = e.userId;
        }
        if (userId === me.id) continue;
        for (const roomId of [spaceId, ...channelIds]) await client.invite(roomId, userId).catch(noop);
      }
      await settle(() => snapshot.spaces.some((s) => s.id === spaceId));
      return { spaceId, channelId: channelIds[0]! };
    },
    async updateSpace(spaceId, patch) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!space || !joined(space)) throw new Error('not-allowed');
      const name = patch.name?.trim();
      if (name && isClientSpace(space) && nameTaken(name, spaceId)) throw new Error('name-taken');
      try {
        if (name && name !== space.name) await client.setRoomName(spaceId, name);
        if (patch.colour !== undefined) {
          await writeState(spaceId, SPACE_STATE, (content) => {
            const next = { ...content };
            if (patch.colour) next.colour = patch.colour;
            else delete next.colour;
            return next;
          });
        }
      } catch (e) {
        throw forbidden(e);
      }
      await settle(() => {
        const s = snapshot.spaces.find((x) => x.id === spaceId);
        return !!s && (!name || s.name === name) && (patch.colour === undefined || (s.colour ?? '') === patch.colour);
      });
    },
    async setMainContact(spaceId, userId, on) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!space || !joined(space) || !isClientSpace(space)) throw new Error('not-allowed');
      // The help lookup only trusts contacts at staff level in the space; a colleague added by Staff may still sit at 0 (D-36).
      if (on) {
        await workspaceRoom?.loadMembersIfNeeded().catch(noop);
        const level = teamLevel(userId);
        if (inWorkspace(userId) && levelIn(space, userId) < LEVEL.staff && mayEditLevel(space, userId, level)) await setLevel(space, userId, level).catch(noop);
      }
      try {
        await writeState(spaceId, SPACE_STATE, (content) => {
          const was = Array.isArray(content.contacts) ? content.contacts.filter((id): id is string => typeof id === 'string') : [];
          const contacts = !on ? was.filter((id) => id !== userId) : was.includes(userId) ? was : [...was, userId];
          const next: Record<string, unknown> = { ...content, contacts };
          if (!contacts.length) delete next.contacts;
          return next;
        });
      } catch (e) {
        throw forbidden(e);
      }
      await settle(() => !!snapshot.spaces.find((x) => x.id === spaceId)?.contacts?.includes(userId) === on);
    },
    async spaceMembers(spaceId) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!space || !joined(space)) return [];
      await Promise.all([space, ...(workspaceRoom ? [workspaceRoom] : [])].map((r) => r.loadMembersIfNeeded().catch(noop)));
      return space
        .getMembers()
        .filter((m) => m.membership === KnownMembership.Join || m.membership === KnownMembership.Invite)
        .map((m): Member => ({
          person: person(m.userId, m.name, m.getMxcAvatarUrl()),
          role: spaceRole(m.userId, space),
          ...(m.membership === KnownMembership.Invite ? { pending: true } : {}),
        }))
        .sort((a, b) => Number(!isTeam(a.role)) - Number(!isTeam(b.role)) || Number(!!a.pending) - Number(!!b.pending) || byName(a.person, b.person));
    },
    async removeFromSpace(spaceId, userId) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!space || !joined(space)) throw new Error('not-allowed');
      await space.loadMembersIfNeeded().catch(noop);
      const mine = levelIn(space, me.id);
      const kick: unknown = space.currentState.getStateEvents(EventType.RoomPowerLevels, '')?.getContent().kick;
      if (userId === me.id || mine < (typeof kick === 'number' ? kick : LEVEL.admin) || levelIn(space, userId) >= mine) throw new Error('not-allowed');
      // A pending person's join link dies before anything else changes; for anyone else there's nothing open to revoke.
      const pending = space.getMember(userId)?.membership === KnownMembership.Invite;
      await revokeInvitesFor(session.accessToken, spaceId, userId).catch((e: unknown) => {
        if (pending) throw new Error('other', { cause: e });
      });
      // D-36: the space first, then its channels.
      const unreached = await outOfSpace(space, userId).catch((e: unknown) => Promise.reject(forbidden(e)));
      if (unreached.length) throw new Error('partial');
    },
    async setArchived(spaceId, archived) {
      await ready;
      const space = client.getRoom(spaceId);
      if (!space || !joined(space) || !isClientSpace(space) || !space.currentState.maySendStateEvent(EventType.RoomPowerLevels, me.id)) throw new Error('not-allowed');
      // Every channel first, the flag last; if any channel refuses, the ones already changed go back. A channel archived on its own stays so.
      const rooms = childRooms(space).filter((r) => archived || !channelArchived(r));
      const results = await Promise.allSettled(rooms.map((r) => writeState(r.roomId, EventType.RoomPowerLevels, (c) => archivedLevels(c, 'client', archived))));
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) {
        const changed = rooms.filter((_, i) => results[i]!.status === 'fulfilled' && (results[i] as PromiseFulfilledResult<boolean>).value);
        await Promise.allSettled(changed.map((r) => writeState(r.roomId, EventType.RoomPowerLevels, (c) => archivedLevels(c, 'client', !archived))));
        throw forbidden(failed.reason);
      }
      await writeState(spaceId, SPACE_STATE, (content) => {
        const next = { ...content };
        if (archived) next.archived = true;
        else delete next.archived;
        return next;
      }).catch((e: unknown) => Promise.reject(forbidden(e)));
      await settle(() => !!snapshot.spaces.find((s) => s.id === spaceId)?.archived === archived);
    },
    async deleteSpace(spaceId) {
      await ready;
      const space = client.getRoom(spaceId);
      const wsId = (await client.getRoomIdForAlias(`#workspace:${server}`).catch(() => null))?.room_id;
      const ws = wsId ? client.getRoom(wsId) : null;
      if (
        !space ||
        !ws ||
        !joined(space) ||
        space.roomId === ws.roomId ||
        !isClientSpace(space) ||
        spaceStateOf(space).archived !== true ||
        levelIn(ws, me.id) < LEVEL.owner ||
        levelIn(space, me.id) < LEVEL.owner ||
        !mayState(space, me.id, SPACE_STATE)
      )
        throw new Error('not-allowed');
      // Its join links die before anything else changes.
      await revokeInvitesForSpace(session.accessToken, spaceId).catch((e: unknown) => {
        throw new Error('other', { cause: e });
      });
      // An access role that still names it would bring its Externals back.
      for (const role of rolesNow().filter((r) => r.spaces.includes(spaceId)))
        await writeState(ws.roomId, ACCESS_ROLE, (c) => ({ ...c, spaces: role.spaces.filter((id) => id !== spaceId) }), role.id).catch(noop);
      const ids = [...space.currentState.getStateEvents(EventType.SpaceChild).map((ev) => ev.getStateKey()!), ...pageRoomsOf(space)];
      const rooms = [...new Set(ids)].map((id) => client.getRoom(id)).filter((r): r is Room => !!r && joined(r) && belongsTo(r, space, ws));
      // Its rooms, then the space: whoever is below me goes. Those I can't kick (a co-Owner, a v12 creator) keep it, archived.
      for (const room of [...rooms, space]) {
        await room.loadMembersIfNeeded().catch(noop);
        const mine = levelIn(room, me.id);
        for (const m of room.getMembers()) if (m.userId !== me.id && present(m.membership) && levelIn(room, m.userId) < mine) await client.kick(room.roomId, m.userId).catch(noop);
      }
      for (const room of rooms) await client.sendStateEvent(spaceId, EventType.SpaceChild, {} as never, room.roomId).catch(noop);
      for (const id of [...rooms.map((r) => r.roomId), spaceId]) {
        discarded.add(id);
        await client.leave(id).catch(noop);
        await client.forget(id, true).catch(noop);
      }
      await settle(() => !snapshot.spaces.some((s) => s.id === spaceId));
    },
    translate: (segments, to) => translateSegments(session.accessToken, segments, to),
    async assistantAsk(request, opts) {
      await ready;
      const deps = {
        base: location.origin,
        token: session.accessToken,
        find: (query: string, within: Parameters<typeof findRefs>[3], signal: AbortSignal) => findRefs(search, snapshot, query, within, signal),
        places: () => placesOf(snapshot, docsBoards.getSnapshot()),
      };
      return askAssistant(deps, request, opts);
    },
    assistantStatus: () => assistantStatus(location.origin, session.accessToken),
    async messagesByRef(refs) {
      await ready;
      const found = await Promise.all(
        refs.map(async (r) => {
          const room = r.k === 'message' ? client.getRoom(r.room) : null;
          if (r.k !== 'message' || !room) return null;
          const local = eventOf(room, r.event);
          const ev = local ?? (await client.fetchRoomEvent(r.room, r.event).then((raw) => mapEvent(r.room, raw), () => null));
          if (!ev) return null;
          await client.decryptEventIfNeeded(ev).catch(noop);
          if (!local) await applyLatestEdit(r.room, ev);
          const m = messageOf(ev, room, false, true);
          const root = threadRootOf(ev);
          return m && m.kind !== 'deleted' ? (root ? { message: m, threadRootId: root } : { message: m }) : null;
        }),
      );
      return found.filter((h): h is SearchHit => !!h);
    },
    anotherApp: () => ({ server: new URL(client.baseUrl).host, username: client.getUserId()!.slice(1, client.getUserId()!.indexOf(':')) }),
    // E2
    async renameChannel(channelId, name) {
      await ready;
      const room = client.getRoom(channelId);
      if (!room || !manageable(room)) throw new Error('not-allowed');
      const wanted = name.trim();
      const space = spaceOf(channelId);
      if (space) {
        const known = [...(await hierarchy(space.roomId)).filter((r) => r.room_id !== channelId).map((r) => r.name ?? ''), ...(snapshot.channels[space.roomId] ?? []).filter((c) => c.id !== channelId).map((c) => c.name)];
        if (known.some((n) => n.toLowerCase() === wanted.toLowerCase())) throw new Error('name-taken');
      }
      await client.setRoomName(channelId, wanted).catch((e: unknown) => Promise.reject(forbidden(e)));
      await settle(() => Object.values(snapshot.channels).some((list) => list.some((c) => c.id === channelId && c.name === wanted)));
    },
    async setChannelArchived(channelId, archived) {
      await ready;
      const room = client.getRoom(channelId);
      if (!room || !manageable(room)) throw new Error('not-allowed');
      const space = spaceOf(channelId);
      const kind = space && isClientSpace(space) ? 'client' : 'workspace';
      // D-28 levels, then the flag; inside an archived client space the levels stay archived.
      if (archived || !(space && spaceStateOf(space).archived === true)) {
        await writeState(channelId, EventType.RoomPowerLevels, (c) => archivedLevels(c, kind, archived)).catch((e: unknown) => Promise.reject(forbidden(e)));
      }
      await writeState(channelId, CHANNEL_STATE, (content) => {
        const next = { ...content };
        if (archived) next.archived = true;
        else delete next.archived;
        return next;
      }).catch(async (e: unknown) => {
        await writeState(channelId, EventType.RoomPowerLevels, (c) => archivedLevels(c, kind, !archived)).catch(noop);
        throw forbidden(e);
      });
      if (space) {
        await writeState(
          space.roomId,
          EventType.SpaceChild,
          (content) => {
            if (!Array.isArray(content.via) || !content.via.length) return content;
            const next = { ...content };
            if (archived) next[ARCHIVED_CHILD] = true;
            else delete next[ARCHIVED_CHILD];
            return next;
          },
          channelId,
        ).catch(noop);
      }
      await settle(() => Object.values(snapshot.channels).some((list) => list.some((c) => c.id === channelId && !!c.archived === archived)));
    },
    // M6
    requestConfirmation: () => security.requestConfirmation(),
    acceptConfirmation: () => security.acceptConfirmation(),
    declineConfirmation: () => security.declineConfirmation(),
    confirmEmoji: (match) => security.confirmEmoji(match),
    dismissConfirmation: () => security.dismissConfirmation(),
    useRecoveryKey: (key) => security.useRecoveryKey(key),
    newRecoveryKey: (password) => security.newRecoveryKey(password),
    async resetEncryption(password) {
      const key = await security.resetEncryption(password);
      // D-38: the service gets the new key; the app shows no save step. If this fails, the reconcile loop rotates later.
      if (confirmByEmail()) await email.handOver(key).catch(() => email.kick(true));
      return key;
    },
    async signOutRisk() {
      if (confirmByEmail() && (await email.held().catch(() => false))) return 'none';
      return security.signOutRisk(roomsJoined().some((r) => r.hasEncryptionStateEvent()));
    },
    // M7 (D-33)
    async pins(channelId) {
      await ready;
      const room = client.getRoom(channelId);
      if (!room) return [];
      const found = await Promise.all(
        [...pinsOf(room)].map(async (id) => {
          const local = eventOf(room, id);
          const ev = local ?? (await client.fetchRoomEvent(channelId, id).then((raw) => mapEvent(channelId, raw), () => null));
          if (!ev) return null;
          await client.decryptEventIfNeeded(ev).catch(noop);
          if (!local) await applyLatestEdit(channelId, ev);
          const m = messageOf(ev, room, false, true);
          return m && m.kind !== 'deleted' ? m : null;
        }),
      );
      return found.filter((m): m is Message => !!m);
    },
    pin: (channelId, messageId) => setPinned(channelId, messageId, true),
    unpin: (channelId, messageId) => setPinned(channelId, messageId, false),
    async files(channelId, from) {
      await ready;
      const room = client.getRoom(channelId);
      if (!room) return { items: [] };
      // The server can't see inside encrypted messages: fetch history, decrypt here, keep the media.
      const encrypted = room.hasEncryptionStateEvent();
      const filter = encrypted ? MESSAGES_FILTER : { types: [EventType.RoomMessage, EventType.Sticker], contains_url: true };
      const page: FilesPage = { items: [] };
      let token = from;
      for (let i = 0; i < (encrypted ? SCAN_PAGES : 1); i++) {
        const res = await history(room, token, encrypted ? SCAN : FILES_PAGE, filter);
        for (const ev of res.events) {
          const m = messageOf(ev, room, false, true);
          if (m?.media) page.items.push(m);
        }
        token = res.events.length && res.end && res.end !== token ? res.end : undefined;
        if (!token || page.items.length >= FILES_PAGE) break;
      }
      if (token) page.next = token;
      return page;
    },
    async search(query, opts) {
      await ready;
      return search(query, opts);
    },
    // SIDE-03
    requestPersonConfirmation(userId) {
      if (security.state().device !== 'confirmed') return;
      const dm = dmWith(userId);
      void (dm ? Promise.resolve(dm.roomId) : findOrCreateDm([userId])).then((roomId) => security.requestPersonConfirmation(userId, roomId), noop);
    },
    personConfirmed: (userId) => security.personConfirmed(userId),
    async shareHistory(dmId, userId) {
      await ready;
      const room = client.getRoom(dmId);
      // Team = in the workspace; the other person must be outside it (its member list decides, not the ID).
      await Promise.all([workspaceRoom?.loadMembersIfNeeded(), room?.loadMembersIfNeeded()].map((p) => p?.catch(noop)));
      const outside = !!workspaceRoom && joined(workspaceRoom) && workspaceRoom.getMember(userId)?.membership !== KnownMembership.Join;
      const allowed = !!room && joined(room) && room.hasEncryptionStateEvent() && isDirect(room, directRooms()) && sameMembers(othersOf(room), [userId]) && outside;
      await shareHistory(client, dmId, userId, personOf(room, userId).name, {
        allowed,
        deviceConfirmed: () => security.deviceVerified(),
        personConfirmed: () => security.personConfirmed(userId),
        recipientReady: () => security.hasSignedDevice(userId),
      });
    },
    // D-36
    async workspacePeople() {
      await ready;
      const ws = workspaceRoom;
      if (!ws) return [];
      await ws.loadMembersIfNeeded().catch(noop);
      const codes = await listInvites(session.accessToken, ws.roomId).catch(() => []);
      const team = ws
        .getMembers()
        .filter((m) => present(m.membership))
        .map((m): Member => {
          const pending = m.membership === KnownMembership.Invite;
          const email = pending ? codes.find((i) => i.userId === m.userId)?.email : undefined;
          return { person: person(m.userId, m.name, m.getMxcAvatarUrl()), role: roleOf(levelIn(ws, m.userId), 'workspace'), ...(pending ? { pending: true } : {}), ...(email ? { email } : {}) };
        });
      const externals = (await externalsOf(undefined, codes)).map((x): Member => ({ person: x.person, role: 'external', ...(x.pending ? { pending: true } : {}), ...(x.email ? { email: x.email } : {}), roles: x.roles }));
      return [...team, ...externals].sort((a, b) => Number(!!a.pending) - Number(!!b.pending) || byName(a.person, b.person));
    },
    async externalAccess(userId) {
      await ready;
      return externalsOf(userId);
    },
    async saveAccessRole(role) {
      await ready;
      if (!workspaceRoom || !mayState(workspaceRoom, me.id, ACCESS_ROLE)) throw new Error('not-allowed');
      const id = role.id ?? crypto.randomUUID();
      const saved: AccessRole = { id, name: role.name.trim(), colour: role.colour, channels: [...new Set(role.channels)], spaces: [...new Set(role.spaces)] };
      if (!saved.name) throw new Error('other');
      await writeState(workspaceRoom.roomId, ACCESS_ROLE, () => ({ name: saved.name, colour: saved.colour, channels: saved.channels, spaces: saved.spaces }), id).catch((e: unknown) =>
        Promise.reject(forbidden(e)),
      );
      const failed = await follow(recordsNow(), [...rolesNow().filter((r) => r.id !== id), saved], (record) => record.roles.includes(id));
      await settle(() => JSON.stringify(snapshot.accessRoles.find((r) => r.id === id)) === JSON.stringify(saved));
      return { id, failed };
    },
    async deleteAccessRole(id) {
      await ready;
      if (!workspaceRoom || !mayState(workspaceRoom, me.id, ACCESS_ROLE)) throw new Error('not-allowed');
      const ws = workspaceRoom;
      const records = recordsNow();
      await writeState(ws.roomId, ACCESS_ROLE, () => ({}), id).catch((e: unknown) => Promise.reject(forbidden(e)));
      const failed: Failed = [];
      const held: Record<string, ExternalRecord> = {};
      for (const [userId, record] of Object.entries(records)) {
        if (!record.roles.includes(id)) continue;
        held[userId] = { ...record, roles: record.roles.filter((r) => r !== id) };
        await writeRecord(userId, held[userId]).catch(() => failed.push({ userId, roomId: ws.roomId }));
      }
      failed.push(...(await follow(held, rolesNow().filter((r) => r.id !== id), () => true)));
      await settle(() => !snapshot.accessRoles.some((r) => r.id === id));
      return { failed };
    },
    async setExternalRoles(userId, roles) {
      await ready;
      if (!workspaceRoom || !mayEditAccess()) throw new Error('not-allowed');
      await workspaceRoom.loadMembersIfNeeded().catch(noop);
      if (isMember(workspaceRoom, userId) || (await isClient(userId))) throw new Error('not-allowed');
      const record: ExternalRecord = { roles: [...new Set(roles)], channels: recordsNow()[userId]?.channels ?? [] };
      await writeRecord(userId, record).catch((e: unknown) => Promise.reject(forbidden(e)));
      const failed = await syncExternal(userId, wantOf(record, rolesNow()));
      await settle(() => JSON.stringify(snapshot.externals[userId]) === JSON.stringify(record));
      return { failed };
    },
    async applyAccess(userId) {
      await ready;
      if (!mayEditAccess() || (await isClient(userId))) throw new Error('not-allowed');
      return { failed: await syncExternal(userId, wantOf(recordsNow()[userId], rolesNow())) };
    },
    async removeFromWorkspace(userId) {
      await ready;
      const ws = workspaceRoom;
      if (!ws) throw new Error('not-allowed');
      await ws.loadMembersIfNeeded().catch(noop);
      const member = isMember(ws, userId);
      const record = recordsNow()[userId];
      const mine = levelIn(ws, me.id);
      // A non-member needs an External record, so a client (never given one) is refused here too.
      if (mine < LEVEL.admin || userId === me.id || levelIn(ws, userId) >= mine || !(member || (record && mayEditAccess()))) throw new Error('not-allowed');
      await removePersonFor(session.accessToken, userId).catch((e: unknown) => {
        throw new Error(e instanceof InviteError && e.code === 'not-allowed' ? 'not-allowed' : 'other', { cause: e });
      });
      let partial = false;
      const miss = () => void (partial = true);
      // A room that won't let me in isn't a miss: a private channel I'm not in is covered by the lock, and nobody is in a closed one.
      const shut = new Set<string>();
      const left = (ids: string[]) => void (ids.some((id) => !shut.has(id)) && miss());
      let throughSpace = false;
      if (member) throughSpace = await outOfSpace(ws, userId, shut).then((ids) => (left(ids), true), () => (miss(), false));
      for (const space of clientSpaces()) await outOfSpace(space, userId, shut).then(left, miss);
      if (!throughSpace) {
        for (const room of workspaceChannels()) await evict(room.roomId, userId).catch(miss);
        // Workspace channels open to its members that I'm not in: passed through.
        const joinedNow = new Set(workspaceChannels().map((r) => r.roomId));
        for (const r of await hierarchy(ws.roomId).catch(() => (miss(), [])))
          if ((r.join_rule as string | undefined) === 'restricted' && !joinedNow.has(r.room_id)) await evict(r.room_id, userId, false, shut).catch(() => left([r.room_id]));
      }
      // The record goes last: a partial run leaves them listed with no access, so "Not applied" shows what's left.
      // A Staff member half removed gets an empty record too, so they stay listed and the retry is allowed.
      if (record || partial) await writeRecord(userId, partial ? { roles: [], channels: [] } : null).catch(miss);
      if (partial) throw new Error('partial');
      await settle(() => !isMember(ws, userId) && !snapshot.externals[userId]);
    },
    linkPreview(url) {
      let preview = previews.get(url);
      if (!preview) {
        preview = client.http
          .authedRequest<Record<string, unknown>>(Method.Get, '/media/preview_url', { url }, undefined, { prefix: ClientPrefix.V1 })
          .then(
            (og) => linkPreviewOf(url, og),
            (e: unknown) => {
              // Only a definitive "no preview" is kept; rate limits, server errors and dropped connections may work next time.
              if (!(e instanceof MatrixError && (e.httpStatus === 400 || e.httpStatus === 404))) previews.delete(url);
              return null;
            },
          );
        previews.set(url, preview);
      }
      return preview;
    },
    requestConfirmEmail: () => email.request(),
    askForHelp: (reason) => email.help(reason),
  };
}
