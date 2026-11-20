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
  body: string;
  ts: number;
  status: 'sent' | 'sending' | 'failed';
  edited?: boolean;
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
}

export type SignInFailure = 'wrong-password' | 'unreachable' | 'other';

export class SignInError extends Error {
  constructor(readonly reason: SignInFailure) {
    super(reason);
  }
}
