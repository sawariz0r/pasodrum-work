// The only shapes the app sees from the server (D-03). Product vocabulary, no Matrix terms.

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
  /** M3. Not a member of the company workspace (client or guest): amber corner badge. */
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
  /** M5. Clients and guests who are members (joined or pending). Only filled for team people (Owner/Admin/Member); always absent for clients and guests. */
  outside?: Person[];
  /** M6. End-to-end encrypted (private channels, D-11): opening it on an unconfirmed device shows the confirm gate. */
  encrypted?: boolean;
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
  /** M2. For kind 'system': collapsed joins/leaves between messages. */
  system?: { joined: Person[]; left: Person[] };
  /** M3. On a thread root: summary of its replies. */
  thread?: ThreadInfo;
  /** M6. kind 'undecryptable' only: a key may still arrive (backup, another device) — show the shimmer, not the quiet line. */
  arriving?: boolean;
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
}

/** M4. Owner/Admin come from power levels in the workspace (D-06); the rest from membership. */
export type Role = 'owner' | 'admin' | 'member' | 'client' | 'guest';

export interface Member {
  person: Person;
  role: Role;
  /** Added but hasn't joined yet (invited by email or not yet signed in). */
  pending?: boolean;
}

export interface JoinableChannel {
  id: string;
  spaceId: string;
  name: string;
  topic?: string;
  private: boolean;
  memberCount: number;
  joined: boolean;
}

export interface PendingInvite {
  code: string;
  email: string;
  name?: string;
  role: 'member' | 'guest' | 'client';
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
 * M6. A device confirmation in progress (RulesM6). role 'new' = this device asked; 'approver' = another device of mine asks this one.
 * phase: 'waiting' (asked, no answer yet) · 'asked' (approver: Is this you?) · 'compare' (emoji shown) · 'matched' (I pressed They match, the other side hasn't)
 * · 'done' · 'declined' · 'timeout' (2 min) · 'mismatch'.
 */
export interface Confirmation {
  role: 'new' | 'approver';
  /** The other device's name ("Safari on Mac"); absent while a new device waits for any device. */
  otherDevice?: string;
  phase: 'waiting' | 'asked' | 'compare' | 'matched' | 'done' | 'declined' | 'timeout' | 'mismatch';
  emoji?: SasEmoji[];
}

/** M6. This device and the account's encryption setup (D-31). */
export interface Security {
  /** 'starting' until crypto is ready; 'unconfirmed' = encrypted conversations show the confirm gate. */
  device: 'starting' | 'confirmed' | 'unconfirmed';
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
}

export interface WorkspaceStore {
  getSnapshot(): WorkspaceSnapshot;
  subscribe(onChange: () => void): () => void;
  openTimeline(channelId: string): void;
  loadOlder(channelId: string): void;
  sendText(channelId: string, body: string): void;
  retry(channelId: string, messageId: string): void;
  discard(channelId: string, messageId: string): void;
  markRead(channelId: string): void;
  reconnectNow(): void;
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
  /** D-25: Owners make/remove Owners; Owners and Admins change Member↔Admin. */
  setRole(spaceId: string, userId: string, role: 'owner' | 'admin' | 'member'): Promise<void>;
  removeFromChannel(channelId: string, userId: string): Promise<void>;
  /** Existing people get a normal invite (auto-accepted by our app); new emails go through the invite service (D-07, D-26). */
  /** `targetId` is a channel, or a space: then they're added to the space and its home channel (workspace: #general, else the first public channel; client space: its first channel). */
  addPeople(targetId: string, req: { userIds: string[]; emails: string[]; role: 'member' | 'guest' | 'client' }): Promise<AddPeopleResult>;
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
  /** Spaces and case don't matter. Rejects Error('wrong-key'). Resolves once the device is confirmed and older messages start loading from the backup. */
  useRecoveryKey(key: string): Promise<void>;
  /** Creates (or replaces) the account's recovery key and backup and resolves to the key to show once. Rejects Error('password-required') when the server wants the password (call again with it) or Error('wrong-password'). */
  newRecoveryKey(password?: string): Promise<string>;
  /** "Reset and start fresh": new identity + backup; resolves to the new recovery key. Rejects Error('wrong-password'). */
  resetEncryption(password: string): Promise<string>;
  /** Before sign-out: 'last-device' = last confirmed device and the account has encrypted conversations; 'no-backup' = same but no working backup. */
  signOutRisk(): Promise<'none' | 'last-device' | 'no-backup'>;
}

export type SignInFailure = 'wrong-password' | 'unreachable' | 'other';

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
