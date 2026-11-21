// The only shapes the app sees from the server (D-03). Product vocabulary, no Matrix terms.
import type { DocsBoards } from './docsBoardsTypes';

export type ConnectionState = 'starting' | 'online' | 'reconnecting' | 'offline';

export interface Session {
  baseUrl: string;
  userId: string;
  deviceId: string;
  accessToken: string;
}

export interface Person {
  id: string;
  name: string;
  avatarUrl?: string;
  /**
   * M3/D-36. Show the outside mark. Team viewers (Owner/Admin/Staff, and Externals): clients and Externals are outside.
   * Client viewers: only clients are (Externals are part of the team to them; level ≥ 1 where we meet = team).
   */
  external?: boolean;
}

export interface Space {
  id: string;
  name: string;
  kind: 'workspace' | 'client';
  avatarUrl?: string;
  /** M5. Client spaces: tile colour chosen at creation or in settings (work.pasodrum.space `colour`). Absent = derived from the id. */
  colour?: string;
  /** M5. Read-only for everyone: tile dims and sorts last, composers become one quiet bar. */
  archived?: boolean;
}

export interface Channel {
  id: string;
  spaceId: string;
  name: string;
  topic?: string;
  private: boolean;
  unread: number;
  mentions: number;
  memberCount: number;
  /** M5/D-36. Clients and Externals who are members (joined or pending). Only filled for Owner/Admin/Staff; always absent for clients and Externals. */
  outside?: Person[];
  /** SIDE-01. Team only: the member list hasn't loaded yet, so `outside` may still be missing people. */
  outsidePending?: boolean;
  /** M6. End-to-end encrypted (private channels, D-11): opening it on an unconfirmed device shows the confirm gate. */
  encrypted?: boolean;
  /** E2. Read-only for everyone; kept in the snapshot so it can be opened from Browse, but the sidebar leaves it out. */
  archived?: boolean;
  /** E2. I may rename/archive it: Owner, Admin or its creator (what the server allows, D-27); never #general. */
  manageable?: boolean;
  /** M7. I may pin and unpin here (anyone in the conversation, D-33); false while archived. */
  canPin?: boolean;
}

export interface Message {
  /** Server event id, or a local id while sending/failed. */
  id: string;
  channelId: string;
  sender: Person;
  /** Plain text (reply fallback stripped). Media: the caption, '' when none. 'deleted' and 'system': ''. */
  body: string;
  ts: number;
  status: 'sent' | 'sending' | 'failed';
  edited?: boolean;
  /** M2. Absent = 'text'. */
  kind?: MessageKind;
  /** M2. Sanitized HTML (allow-listed tags only) when the sender sent formatting; `body` is always the plain fallback. */
  html?: string;
  /** M2. For image/video/audio/file. */
  media?: Media;
  /** M2. The message this one replies to. `found: false` = original not in the loaded timeline; show `body` (fetched or from the fallback), not clickable. */
  replyTo?: { id: string; sender?: Person; body: string; found: boolean };
  /** M2. Grouped by key (emoji or text), in first-reacted order. */
  reactions?: Reaction[];
  /** M2. This message mentions the signed-in person. */
  mentionsMe?: boolean;
  /** M2. For kind 'system': collapsed joins/leaves between messages. E2: a rename or archive row (never collapsed with joins). */
  system?: {
    joined: Person[];
    left: Person[];
    renamed?: { from: string; to: string; by: Person };
    archived?: { by: Person; archived: boolean };
    /** SIDE-03. `by` gave the other person in this DM back its history. */
    historyShared?: { by: Person };
  };
  /** M3. On a thread root: summary of its replies. */
  thread?: ThreadInfo;
  /** M6. kind 'undecryptable' only: a key may still arrive (backup, another device) — show the shimmer, not the quiet line. */
  arriving?: boolean;
  /** M7. Pinned in its conversation. */
  pinned?: boolean;
  /** M7. Text messages: http(s) URLs in body order, each once (code and mentions left out); the card shows the first. Never set in encrypted conversations (D-33). */
  links?: string[];
  /** SIDE-03. Readable only because someone shared the history with me: who sent it can't be proven (grey shield). */
  restored?: boolean;
}

export interface ThreadInfo {
  count: number;
  lastTs: number;
  participants: Person[];
  unread: boolean;
}

/** M3. A thread I follow (I wrote the root or replied). */
export interface ThreadSummary {
  channelId: string;
  rootId: string;
  root: Message;
  lastReply?: Message;
  count: number;
  unread: boolean;
  lastTs: number;
}

/** M3. Something aimed at me: a mention, or a reply to my message (in a channel or thread). */
export interface ActivityItem {
  id: string;
  kind: 'mention' | 'reply';
  channelId: string;
  threadRootId?: string;
  message: Message;
  unread: boolean;
}

/** M3. A direct conversation with one or more people. */
export interface Dm {
  id: string;
  people: Person[];
  unread: number;
  mentions: number;
  lastTs: number;
  /** Latest message in the conversation (for list previews). */
  last?: Message;
  /** Spaces this DM belongs to in the sidebar: spaces all its people share with me. */
  spaceIds: string[];
  /** M6. End-to-end encrypted (every DM from M6 on, D-11). */
  encrypted?: boolean;
  /** M7. I may pin and unpin here. */
  canPin?: boolean;
}

/**
 * M4/D-36. Owner 100, Admin 50, Staff 10 (joined to the workspace), External 1 (not in the workspace, level 1 where they
 * are), Client 0 (joined to one client space). Owner/Admin come from workspace power levels; the rest from membership/levels.
 */
export type Role = 'owner' | 'admin' | 'staff' | 'external' | 'client';

export interface Member {
  person: Person;
  role: Role;
  /** Added but hasn't joined yet (invited by email or not yet signed in). */
  pending?: boolean;
  /** D-36. Pending rows added by email: the address (shown instead of a name). */
  email?: string;
  /** D-36. Externals only, and only for team viewers: their access role ids. */
  roles?: string[];
}

/** D-36. A named set of workspace channels and whole client spaces, given to Externals (work.pasodrum.access_role). */
export interface AccessRole {
  id: string;
  name: string;
  /** One of the client-space tile colours (hex). */
  colour: string;
  /** Workspace channel ids. */
  channels: string[];
  /** Client space ids (all or nothing). */
  spaces: string[];
}

/** D-36. What an External should reach (work.pasodrum.external), and whether their real rooms match. */
export interface ExternalAccess {
  person: Person;
  email?: string;
  pending?: boolean;
  /** Access role ids. */
  roles: string[];
  /** One-off workspace channel ids (added straight to a channel). */
  channels: string[];
  /** Their joined/invited rooms differ from roles ∪ one-offs (either direction), or a level isn't 1: show "Not applied" + Apply. */
  notApplied?: boolean;
  /** Rooms that differ but I can't fix (I'm not in them, or lack the level): left out of Apply. */
  stuck?: string[];
  /** Where they are now (for the remove dialog): workspace channel ids and client space ids, joined or invited. */
  rooms: { channels: string[]; spaces: string[] };
}

/** D-36. Result of making membership follow access. Empty `failed` = applied. */
export interface AccessChange {
  failed: { userId: string; roomId: string }[];
}

/** D-36. addPeople by type. Staff/External target the workspace; Client a client space; 'channel' a channel. */
export type AddPeopleRequest =
  /** Owner/Admin. Joined to the workspace at Staff 10, and put on these client spaces (team, level 10). */
  | { type: 'staff'; userIds: string[]; emails: string[]; spaces: string[] }
  /** Owner/Admin. Gets these access roles and one-off channels; membership follows. */
  | { type: 'external'; userIds: string[]; emails: string[]; roles: string[]; channels: string[] }
  /** Team of that client space (Owner/Admin/Staff on it). */
  | { type: 'client'; userIds: string[]; emails: string[] }
  /** Any team member: colleagues and existing Externals by id. Emails (new Externals, one-off for this channel) need Owner/Admin, else `not-allowed`. */
  | { type: 'channel'; userIds: string[]; emails: string[] };

export interface JoinableChannel {
  id: string;
  spaceId: string;
  name: string;
  topic?: string;
  private: boolean;
  memberCount: number;
  joined: boolean;
  /** E2. Shown under "Archived" in Browse. */
  archived?: boolean;
}

export interface PendingInvite {
  code: string;
  email: string;
  name?: string;
  role: 'staff' | 'external' | 'client';
  createdTs: number;
  /** Their single-use join link ("Copy join link"), only for people allowed to add people here. */
  link?: string;
}

export interface AddPeopleResult {
  added: string[];
  invited: string[];
  failed: { who: string; reason: 'already-member' | 'invalid-email' | 'not-allowed' | 'other' }[];
}

export interface Device {
  id: string;
  name: string;
  lastSeenTs?: number;
  current: boolean;
  /** M6. Confirmed (cross-signed by the account). False shows the "Not confirmed" tag. */
  confirmed?: boolean;
}

export type NotifyLevel = 'all' | 'mentions' | 'none';

export interface InvitePreview {
  email: string;
  spaceName: string;
  spaceKind: 'workspace' | 'client';
  inviter?: string;
  team: Person[];
  state: 'open' | 'used' | 'expired';
}

/** M5. createClientSpace input (CreateClientSpace board). */
export interface NewClientSpace {
  name: string;
  colour: string;
  /** Channel names to create, first one is where you land. */
  channels: string[];
  /** Team people (user ids) added to the space and every channel. */
  team: string[];
  /** Client emails: invited as role 'client' through the invite service. */
  clientEmails: string[];
}

/** M5. Profile menu → Another app (D-15). The only place a server name appears. */
export interface AnotherAppInfo {
  server: string;
  username: string;
}

export interface Profile {
  person: Person;
  email?: string;
  /** IANA time zone, e.g. "Asia/Tokyo". */
  timeZone?: string;
}

export type MessageKind = 'text' | 'emote' | 'notice' | 'image' | 'video' | 'audio' | 'file' | 'deleted' | 'unsupported' | 'system' | 'undecryptable';

export interface Media {
  /** Opaque server reference; turn it into a URL with store.mediaUrl(). */
  ref: string;
  name: string;
  mimetype?: string;
  size?: number;
  width?: number;
  height?: number;
  thumbnailRef?: string;
  durationMs?: number;
}

/** M7. One page of the Files tab, newest first. */
export interface FilesPage {
  /** image/video/audio/file messages with `media` (thread replies included). */
  items: Message[];
  /** Pass to files() for the next (older) page; absent = no more. */
  next?: string;
}

/** M8. A search result; `threadRootId` when the message is a thread reply (open the thread, not the channel). */
export interface SearchHit {
  message: Message;
  threadRootId?: string;
}

/** M7. A link card (unencrypted conversations only, D-33). */
export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  /** The link's host without "www." (never the page's own claim). */
  site?: string;
  /** Media reference: turn it into a URL with store.mediaUrl(). */
  image?: string;
}

export interface Reaction {
  key: string;
  count: number;
  mine: boolean;
  senders: Person[];
}

export interface Upload {
  id: string;
  name: string;
  size: number;
  mimetype: string;
  /** 0..1 */
  progress: number;
  status: 'uploading' | 'done' | 'failed' | 'too-large';
  /** Local object URL for image previews. */
  previewUrl?: string;
}

export interface Draft {
  body: string;
  html?: string;
  /** User ids mentioned (for m.mentions). */
  mentions: string[];
  replyTo?: string;
  /** M3. Send into this thread. */
  threadRootId?: string;
}

export interface Timeline {
  /** Oldest first. */
  messages: Message[];
  initialLoading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  /** M3. The first page couldn't load (thread panel shows Retry; openThread again retries). */
  failed?: boolean;
}

/** M6. One of the seven emoji both devices compare. `index` is the Matrix SAS emoji table index (0–63), for the EN/JP name. */
export interface SasEmoji {
  emoji: string;
  index: number;
}

/**
 * M6. A device confirmation in progress (RulesM6). role 'new' = this device asked; 'approver' = another device of mine asks this one;
 * 'person' (SIDE-03) = comparing emoji with another person (`person`): 'waiting' when I asked, 'asked' when they did.
 * phase: 'waiting' (asked, no answer yet) · 'asked' (approver: Is this you?) · 'compare' (emoji shown) · 'matched' (I pressed They match, the other side hasn't)
 * · 'done' · 'declined' · 'timeout' (2 min) · 'mismatch'.
 */
export interface Confirmation {
  role: 'new' | 'approver' | 'person';
  /** The other device's name ("Safari on Mac"); absent while a new device waits for any device. */
  otherDevice?: string;
  phase: 'waiting' | 'asked' | 'compare' | 'matched' | 'done' | 'declined' | 'timeout' | 'mismatch';
  emoji?: SasEmoji[];
  /** SIDE-03, role 'person': who I'm comparing with. */
  person?: Person;
}

/** M6. This device and the account's encryption setup (D-31). */
export interface Security {
  /**
   * 'starting' until crypto is ready; 'unconfirmed' = encrypted conversations show the confirm gate.
   * 'elsewhere' (D-33): another tab of this browser holds this device; `useHere()` asks it to stop.
   */
  device: 'starting' | 'confirmed' | 'unconfirmed' | 'elsewhere';
  /** Other confirmed devices signed in now (0 → only the recovery key option, ConfirmGateNoDevice). */
  otherConfirmedDevices: number;
  /** The account has no recovery key yet: show RecoveryKeySave before the first DM/private-channel view or send. */
  needsRecoveryKey: boolean;
  confirmation?: Confirmation;
}

/** Immutable: a new object on every change; unchanged parts keep their identity. */
export interface WorkspaceSnapshot {
  me: Person;
  connection: ConnectionState;
  /** Workspace first, then client spaces by name; archived client spaces last (M5). */
  spaces: Space[];
  /** Joined channels per space id, sorted by name. */
  channels: Record<string, Channel[]>;
  /** Only channels opened with openTimeline(). */
  timelines: Record<string, Timeline>;
  sessionExpired: boolean;
  /** M2. People typing per channel (excluding me). */
  typing: Record<string, Person[]>;
  /** M2. Composer upload tray per channel. */
  uploads: Record<string, Upload[]>;
  /** M3. Newest first. */
  dms: Dm[];
  /** M3. Threads I follow, newest activity first. */
  threads: ThreadSummary[];
  /** M3. Open thread timelines by root id (openThread). */
  threadTimelines: Record<string, Timeline>;
  /** M3. Mentions and replies to me, newest first (built from synced history; the server has no /notifications). */
  activity: ActivityItem[];
  /** M4. My role per space id (workspace + client spaces). */
  myRoles: Record<string, Role>;
  /** M6. */
  security: Security;
  /** D-36. Access roles by name; empty unless I'm joined to the workspace (Staff read them, Owners/Admins edit). */
  accessRoles: AccessRole[];
  /** D-36. External records by user id (roles + one-off channels); empty unless I'm joined to the workspace. */
  externals: Record<string, { roles: string[]; channels: string[] }>;
}

export interface WorkspaceStore {
  getSnapshot(): WorkspaceSnapshot;
  subscribe(onChange: () => void): () => void;
  /** D-37. Docs and Boards: their own snapshot (useDocsBoards) and commands. */
  docsBoards: DocsBoards;
  openTimeline(channelId: string): void;
  loadOlder(channelId: string): void;
  sendText(channelId: string, body: string): void;
  retry(channelId: string, messageId: string): void;
  discard(channelId: string, messageId: string): void;
  markRead(channelId: string): void;
  reconnectNow(): void;
  /** D-33, device 'elsewhere': the other tab stops and shows 'elsewhere'; this one starts. */
  useHere(): void;
  signOut(): Promise<void>;
  // M2
  /** Sends text (with optional formatting, mentions, reply) plus any finished uploads in the tray, then clears the tray. */
  send(channelId: string, draft: Draft): void;
  edit(channelId: string, messageId: string, draft: Draft): void;
  remove(channelId: string, messageId: string): void;
  react(channelId: string, messageId: string, key: string): void;
  unreact(channelId: string, messageId: string, key: string): void;
  attach(channelId: string, files: File[]): void;
  retryUpload(channelId: string, uploadId: string): void;
  removeUpload(channelId: string, uploadId: string): void;
  setTyping(channelId: string, typing: boolean): void;
  /** People who can be mentioned in this channel. */
  members(channelId: string): Person[];
  /** Authenticated media → object URL (cached). */
  mediaUrl(ref: string, opts?: { thumbnail?: boolean }): Promise<string>;
  /** Shareable link to a message (opens in Pasodrum work). */
  messageLink(channelId: string, messageId: string): string;
  // M3
  openThread(channelId: string, rootId: string): void;
  loadOlderInThread(channelId: string, rootId: string): void;
  markThreadRead(channelId: string, rootId: string): void;
  markActivityRead(itemId: string): void;
  /** People I may start a conversation with (server decides visibility; clients see only their client space's team). */
  searchPeople(query: string): Promise<Person[]>;
  /** Reuses an existing DM with exactly these people, else creates one. Resolves to its id. */
  openDm(userIds: string[]): Promise<string>;
  profile(userId: string): Promise<Profile>;
  // M4
  createChannel(opts: { spaceId: string; name: string; private: boolean; topic?: string }): Promise<string>;
  browseChannels(spaceId: string): Promise<JoinableChannel[]>;
  joinChannel(channelId: string): Promise<void>;
  leaveChannel(channelId: string): Promise<void>;
  setTopic(channelId: string, topic: string): Promise<void>;
  channelMembers(channelId: string): Promise<Member[]>;
  /** D-25: Owners make/remove Owners; Owners and Admins change Staff↔Admin. */
  setRole(spaceId: string, userId: string, role: 'owner' | 'admin' | 'staff'): Promise<void>;
  removeFromChannel(channelId: string, userId: string): Promise<void>;
  /** Existing people get a normal invite (auto-accepted by our app); new emails go through the invite service (D-07, D-26). */
  /** `targetId` is a channel, or a space: then they're added to the space and its home channel (workspace: #general, else the first public channel; client space: its first channel). */
  /** D-36: `req.type` decides the rules (see AddPeopleRequest). */
  addPeople(targetId: string, req: AddPeopleRequest): Promise<AddPeopleResult>;
  pendingInvites(channelId: string): Promise<PendingInvite[]>;
  resendInvite(code: string): Promise<void>;
  revokeInvite(code: string): Promise<void>;
  updateProfile(patch: { name?: string; avatar?: File; timeZone?: string }): Promise<void>;
  devices(): Promise<Device[]>;
  signOutDevice(deviceId: string): Promise<void>;
  signOutOtherDevices(): Promise<void>;
  /** 'default' = the account-wide level. */
  notifyLevel(channelId: string | 'default'): NotifyLevel;
  setNotifyLevel(channelId: string | 'default', level: NotifyLevel): Promise<void>;
  /** Synced language/theme settings (account data work.pasodrum.settings, D-09). */
  setSetting(key: 'language' | 'theme', value: string): Promise<void>;
  // M5
  /**
   * Owners/Admins of the workspace. Creates the space (D-27 levels), its channels, adds the team, invites the client emails.
   * Rejects Error('name-taken') when another client space has this name (case-insensitive, trimmed); any other failure
   * leaves nothing half-made. Resolves once the space is in the snapshot.
   */
  createClientSpace(opts: NewClientSpace): Promise<{ spaceId: string; channelId: string }>;
  /** Owners/Admins of that space. Colour saves as it changes. */
  updateSpace(spaceId: string, patch: { name?: string; colour?: string }): Promise<void>;
  /** Team first, then clients; pending people (not joined yet) carry `pending`. */
  spaceMembers(spaceId: string): Promise<Member[]>;
  /** Leaves the space and every channel in it; a pending person's join link stops working. Messages and DMs stay; the account is never deleted. */
  removeFromSpace(spaceId: string, userId: string): Promise<void>;
  /** Archived = every channel read-only for everyone; nobody removed. Owners/Admins can undo. */
  setArchived(spaceId: string, archived: boolean): Promise<void>;
  anotherApp(): AnotherAppInfo;
  /** SIDE-01. Our translation service: same number of segments back, in order. Rejects with Error('rate-limited' | 'unavailable' | 'failed'). */
  translate(segments: string[], to: 'en' | 'ja'): Promise<string[]>;
  // E2
  /** Same name rules as createChannel; rejects Error('name-taken') / Error('not-allowed'). */
  renameChannel(channelId: string, name: string): Promise<void>;
  /** Read-only for everyone (D-28 levels on that channel); unarchive restores D-27. */
  setChannelArchived(channelId: string, archived: boolean): Promise<void>;
  // M6 (D-31)
  /** New device: ask my other confirmed devices (phase 'waiting'). */
  requestConfirmation(): void;
  /** Approver: "It's me" → emoji. */
  acceptConfirmation(): void;
  /** Approver "Not me", or either side cancels. Clears `confirmation` (approver "Not me" also leaves the new device unconfirmed). */
  declineConfirmation(): void;
  /** They match / They don't match. */
  confirmEmoji(match: boolean): void;
  /** Close a finished confirmation (done/declined/timeout/mismatch). */
  dismissConfirmation(): void;
  /** Whitespace and dashes don't matter, full-width input is folded (NFKC); case does (base58). Rejects Error('wrong-key'). Resolves once the device is confirmed and older messages start loading from the backup. */
  useRecoveryKey(key: string): Promise<void>;
  /** Creates (or replaces) the account's recovery key and backup and resolves to the key to show once. Rejects Error('password-required') when the server wants the password (call again with it), Error('wrong-password'), or Error('backup-unreadable') when a backup exists that this device can't open (ask for the current key with useRecoveryKey first, then call again). */
  newRecoveryKey(password?: string): Promise<string>;
  /** "Reset and start fresh": new identity + backup; resolves to the new recovery key. Rejects Error('wrong-password'). */
  resetEncryption(password: string): Promise<string>;
  /** Before sign-out: 'last-device' = last confirmed device and the account has encrypted conversations; 'no-backup' = same but no working backup. */
  signOutRisk(): Promise<'none' | 'last-device' | 'no-backup'>;
  // M7 (D-33)
  /** Pinned messages, newest pin first; deleted or unreachable ones are left out. */
  pins(channelId: string): Promise<Message[]>;
  /** Rejects Error('not-allowed') when I may not pin here, Error('not-sent') for a message still sending, Error('timeout') when the change hasn't synced within 10 s. Resolves once it has (`Message.pinned` follows). */
  pin(channelId: string, messageId: string): Promise<void>;
  unpin(channelId: string, messageId: string): Promise<void>;
  /** Files tab: newest first; `from` = the previous page's `next`. Encrypted conversations are scanned here after decrypting (a bounded amount per page), so a page can be short, even empty, while `next` is set. */
  files(channelId: string, from?: string): Promise<FilesPage>;
  /** First link of an unencrypted message → card data; null = no preview (or it failed). Cached for the session; concurrent calls share one request. Never call it for encrypted conversations. */
  linkPreview(url: string): Promise<LinkPreview | null>;
  // M8
  /**
   * Local substring scan (D-13), NFKC + case-folded. Loaded timelines first, then a bounded amount of older history per
   * conversation (decrypted here). Hits arrive via onHits (newest first per batch). Resolves when this pass ends; `next` = more
   * history exists. Abort rejects with AbortError. An unconfirmed device skips encrypted conversations.
   */
  search(query: string, opts: { channelId?: string; cursor?: string; signal: AbortSignal; onHits: (hits: SearchHit[]) => void }): Promise<{ next?: string }>;
  // SIDE-03
  /** Compare emoji with another person (in our DM); they see a confirmation with role 'person', phase 'asked'. Needs a confirmed device (no-op otherwise). */
  requestPersonConfirmation(userId: string): void;
  /** Their current identity is confirmed by me (a reset since then = false). */
  personConfirmed(userId: string): Promise<boolean>;
  /**
   * Team only, in a 1:1 encrypted DM with an outside person: gives them the keys to its history, then posts a "history shared" row.
   * Rejects Error('not-allowed' | 'device-unconfirmed' | 'not-confirmed' | 'not-ready' | 'failed'); 'not-ready' = they haven't set up
   * again yet (no device signed by their current identity), and nothing is posted. Safe to repeat.
   */
  shareHistory(dmId: string, userId: string): Promise<void>;
  // D-36 people and access (Owners/Admins edit; membership follows in the editor's app, no background job)
  /** Workspace settings → People: Staff, Admins, Owners and Externals (joined or pending), Externals with `roles`. Never clients. */
  workspacePeople(): Promise<Member[]>;
  /** Externals with their access, drift and current rooms; one person when `userId` is given. */
  externalAccess(userId?: string): Promise<ExternalAccess[]>;
  /** Create (no id) or update a role, then make every holder's membership follow. Resolves with its id and what failed. */
  saveAccessRole(role: Omit<AccessRole, 'id'> & { id?: string }): Promise<AccessChange & { id: string }>;
  /** Delete a role; holders lose what nothing else covers. */
  deleteAccessRole(id: string): Promise<AccessChange>;
  /** Replace an External's roles (one-offs kept), then make membership follow. */
  setExternalRoles(userId: string, roles: string[]): Promise<AccessChange>;
  /** "Apply": make this External's membership match their access again. */
  applyAccess(userId: string): Promise<AccessChange>;
  /** Out of every client space (space first, then its channels) and workspace channel I can reach, levels cleared, join codes revoked, record deleted. Rejects Error('partial') when some room couldn't be left. */
  removeExternal(userId: string): Promise<void>;
}

export type SignInFailure = 'wrong-password' | 'unreachable' | 'rate-limited' | 'other';

export class SignInError extends Error {
  constructor(readonly reason: SignInFailure) {
    super(reason);
  }
}

/**
 * M4. signOutDevice/signOutOtherDevices reject with this when the server asks for the password again.
 * Ask for it, then `retry(password)`; a wrong password rejects with Error('wrong-password').
 */
export class PasswordRequired extends Error {
  constructor(readonly retry: (password: string) => Promise<void>) {
    super('password-required');
  }
}
