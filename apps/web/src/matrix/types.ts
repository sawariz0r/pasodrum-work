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
  /** Spaces this DM belongs to in the sidebar: spaces all its people share with me. */
  spaceIds: string[];
}

export interface Profile {
  person: Person;
  email?: string;
  /** IANA time zone, e.g. "Asia/Tokyo". */
  timeZone?: string;
}

export type MessageKind = 'text' | 'emote' | 'notice' | 'image' | 'video' | 'audio' | 'file' | 'deleted' | 'unsupported' | 'system';

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
}

/** Immutable: a new object on every change; unchanged parts keep their identity. */
export interface WorkspaceSnapshot {
  me: Person;
  connection: ConnectionState;
  /** Workspace first, then client spaces by name. */
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
}

export type SignInFailure = 'wrong-password' | 'unreachable' | 'other';

export class SignInError extends Error {
  constructor(readonly reason: SignInFailure) {
    super(reason);
  }
}
