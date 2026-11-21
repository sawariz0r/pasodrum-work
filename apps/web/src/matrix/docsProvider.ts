// Yjs over Matrix (D-37, build plan §2): one page room, updates as timeline events, a media snapshot every ~200 updates.
// Loaded with the first open page (dynamic import from docsBoards.ts), so yjs stays out of the first load.
import { ClientEvent, KnownMembership, MatrixError, Method, RoomEvent, SyncState, type IEvent, type MatrixClient, type MatrixEvent, type Room } from 'matrix-js-sdk';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { PageSession, Presence } from './docsBoardsTypes';

export const UPDATE = 'work.pasodrum.docs.update';
export const SNAPSHOT = 'work.pasodrum.docs.snapshot';
const FLUSH_MS = 1_500;
/** Events are capped at 64 KiB; anything bigger than this goes up as media with a pointer event. */
const MEDIA_OVER = 40 * 1024;
const SNAPSHOT_EVERY = 200;
const OFFLINE_AFTER = 5_000;
const MAX_BACKOFF = 30_000;
const PAGE = 100;
const enc = encodeURIComponent;
const noop = () => {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const next = (ms: number) => Math.min(ms ? ms * 2 : 2_000, MAX_BACKOFF);
/** The page is gone or not mine to read: no retry will change that. */
const final = (e: unknown) =>
  e instanceof MatrixError ? e.errcode === 'M_FORBIDDEN' || e.errcode === 'M_NOT_FOUND' : e instanceof Error && (e.message === '403' || e.message === '404');

export interface PageCore extends Omit<PageSession, 'close'> {
  /** Flushes and snapshots if I sent anything since the last one. */
  settle(): Promise<void>;
  /** Edits not yet on the server. */
  unsent(): boolean;
  /** Sends what's pending now, in a request that outlives the page where it can. */
  flushNow(): void;
  destroy(): void;
}

const isOnline = (s: SyncState | null) => s === SyncState.Syncing || s === SyncState.Prepared || s === SyncState.Catchup;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Joins (rejects when the server refuses), then loads the snapshot and everything after it in the background. */
export interface ProviderContext {
  client: MatrixClient;
  server: string;
  /** Resolves once the room is in the sync (or after a timeout). */
  whenJoined(roomId: string): Promise<void>;
}

export async function openPageSession({ client, server, whenJoined }: ProviderContext, pageId: string): Promise<PageCore> {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const remote = {};
  const listeners = new Set<() => void>();
  let status: 'loading' | 'ready' | 'failed' = 'loading';
  let online = isOnline(client.getSyncState());
  let failingSince = 0;
  let state: ReturnType<PageSession['getState']> = { status, offline: !online };
  let destroyed = false;

  /** Update events applied or sent, so each counts and applies once. */
  const seen = new Set<string>();
  let lastLive: string | undefined;
  let lastBackfill: string | undefined;
  let sinceSnapshot = 0;
  let mineSinceSnapshot = 0;
  let backfilling: Promise<void> | null = null;
  const applying = new Set<Promise<void>>();

  let pending: Uint8Array[] = [];
  let sending: { content: Record<string, unknown>; txn: string; update: Uint8Array } | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let offlineTimer: ReturnType<typeof setTimeout> | undefined;
  let backoff = 0;
  let inFlight: Promise<void> | null = null;
  let snapshotting: Promise<void> | null = null;
  let txnSeq = 0;
  let urgent = false;
  const flushed = new Set<() => void>();
  /** Updates I know of but haven't applied: a timeline gap still to backfill (from `behind.from`), or media that wouldn't load. A snapshot then would skip them. */
  let behind: { from: string | undefined; resets: number } | null = null;
  let catchUpTimer: ReturnType<typeof setTimeout> | undefined;
  let catchUpBackoff = 0;
  const mediaGaps = new Set<string>();
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let loadBackoff = 0;

  const emit = () => {
    const next = { status, offline: !online || (failingSince > 0 && Date.now() - failingSince >= OFFLINE_AFTER) };
    if (next.status === state.status && next.offline === state.offline) return;
    state = next;
    listeners.forEach((l) => l());
  };

  const fetchMedia = async (url: string) => {
    const http = client.mxcUrlToHttp(url, undefined, undefined, undefined, false, true, true);
    if (!http) throw new Error('not a media reference');
    const res = await fetch(http, { headers: { Authorization: `Bearer ${client.getAccessToken()}` } });
    if (!res.ok) throw new Error(String(res.status));
    return new Uint8Array(await res.arrayBuffer());
  };

  const applyMedia = (url: string) => {
    const p = (async () => {
      for (let attempt = 0; attempt < 4 && !destroyed; attempt++) {
        try {
          const bytes = await fetchMedia(url);
          if (!destroyed) Y.applyUpdate(doc, bytes, remote);
          mediaGaps.delete(url);
          return;
        } catch {
          await wait(1_000 * 2 ** attempt);
        }
      }
      if (destroyed) return;
      mediaGaps.add(url);
      setTimeout(() => applyMedia(url), MAX_BACKOFF);
    })().finally(() => applying.delete(p));
    applying.add(p);
  };

  const take = (id: string, content: Record<string, unknown>) => {
    if (seen.has(id)) return;
    seen.add(id);
    sinceSnapshot++;
    if (typeof content.update === 'string') {
      try {
        Y.applyUpdate(doc, fromBase64(content.update), remote);
      } catch {
        // Not a Yjs update: skip it rather than stop the page.
      }
    } else if (typeof content.url === 'string') applyMedia(content.url);
  };

  const onTimeline = (ev: MatrixEvent, room: Room | undefined, toStart: boolean | undefined, removed: boolean) => {
    if (room?.roomId !== pageId || toStart || removed || ev.getType() !== UPDATE) return;
    const id = ev.getId();
    if (!id?.startsWith('$')) return;
    lastLive = id;
    take(id, ev.getContent());
  };

  /** Everything after `upto` (or from the room's start), oldest first. */
  const backfill = async (upto: string | undefined) => {
    let from: string | undefined;
    if (upto) {
      const ctx = await client.http.authedRequest<{ end?: string }>(Method.Get, `/rooms/${enc(pageId)}/context/${enc(upto)}`, { limit: '0' });
      from = ctx.end;
    }
    const filter = JSON.stringify({ types: [UPDATE] });
    for (;;) {
      const res = await client.http.authedRequest<{ chunk: IEvent[]; end?: string }>(Method.Get, `/rooms/${enc(pageId)}/messages`, {
        dir: 'f',
        limit: String(PAGE),
        filter,
        ...(from ? { from } : {}),
      });
      for (const raw of res.chunk) {
        if (raw.type !== UPDATE) continue;
        lastBackfill = raw.event_id;
        take(raw.event_id, raw.content);
      }
      if (!res.chunk.length || !res.end || res.end === from) break;
      from = res.end;
    }
  };

  const runBackfill = (upto: string | undefined) => {
    const run = backfill(upto).finally(() => {
      if (backfilling === run) backfilling = null;
    });
    backfilling = run;
    return run;
  };

  const fellBehind = () => {
    if (behind) behind.resets++;
    else behind = { from: lastLive ?? lastBackfill, resets: 0 };
  };
  /** Backfills from where I fell behind until it works; the gap closes only if nothing reset meanwhile. */
  const catchUp = () => {
    clearTimeout(catchUpTimer);
    catchUpTimer = undefined;
    if (!behind || destroyed) return;
    const at = behind;
    const resets = at.resets;
    runBackfill(at.from).then(
      () => {
        catchUpBackoff = 0;
        if (behind === at && at.resets === resets) behind = null;
        else catchUp();
      },
      () => {
        if (destroyed) return;
        catchUpBackoff = next(catchUpBackoff);
        catchUpTimer = setTimeout(catchUp, catchUpBackoff);
      },
    );
  };

  const onReset = (room: Room | undefined) => {
    if (room?.roomId !== pageId || status !== 'ready') return;
    fellBehind();
    catchUp();
  };

  const onSync = (s: SyncState) => {
    const was = online;
    online = isOnline(s);
    if (online && !was && (pending.length || sending)) {
      clearTimeout(retryTimer);
      void flush();
    }
    if (online && !was && catchUpTimer) catchUp();
    if (online && !was && loadTimer) load();
    emit();
  };

  const failing = () => {
    if (!failingSince) {
      failingSince = Date.now();
      offlineTimer = setTimeout(emit, OFFLINE_AFTER);
    }
    backoff = next(backoff);
    retryTimer = setTimeout(() => void flush(), backoff);
    emit();
  };

  const sendOnce = async () => {
    if (!sending) {
      const update = Y.mergeUpdates(pending);
      pending = [];
      sending = { update, txn: `pd${Date.now().toString(36)}${(txnSeq++).toString(36)}`, content: {} };
    }
    const s = sending;
    if (!s.content.update && !s.content.url) {
      if (s.update.byteLength > MEDIA_OVER) {
        const { content_uri } = await client.uploadContent(new Blob([s.update as Uint8Array<ArrayBuffer>]), { type: 'application/octet-stream', includeFilename: false });
        s.content = { url: content_uri, size: s.update.byteLength };
      } else s.content = { update: toBase64(s.update) };
    }
    const { event_id } = await client.http.authedRequest<{ event_id: string }>(Method.Put, `/rooms/${enc(pageId)}/send/${UPDATE}/${s.txn}`, undefined, s.content, {
      keepAlive: urgent && !!s.content.update,
    });
    sending = null;
    if (!seen.has(event_id)) {
      seen.add(event_id);
      sinceSnapshot++;
    }
    mineSinceSnapshot++;
  };

  const flush = (): Promise<void> => {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    if (inFlight) return inFlight;
    if (destroyed || status !== 'ready' || (!pending.length && !sending)) {
      flushed.forEach((f) => f());
      flushed.clear();
      return Promise.resolve();
    }
    inFlight = sendOnce().then(
      () => {
        inFlight = null;
        backoff = 0;
        clearTimeout(offlineTimer);
        if (failingSince) {
          failingSince = 0;
          emit();
        }
        if (sinceSnapshot >= SNAPSHOT_EVERY) void snapshot().catch(noop);
        if (pending.length) return flush();
        flushed.forEach((f) => f());
        flushed.clear();
      },
      (e: unknown) => {
        inFlight = null;
        failing();
        if (e instanceof MatrixError && e.errcode === 'M_FORBIDDEN') void rejoin();
      },
    );
    return inFlight;
  };

  // Membership is per account: another device closing this page (or its start-up sweep) leaves it for me too.
  let rejoining: Promise<void> | null = null;
  const rejoin = () =>
    (rejoining ??= (async () => {
      fellBehind();
      await client.joinRoom(pageId, { viaServers: [server] });
      await whenJoined(pageId);
      catchUp();
      if (pending.length || sending) {
        clearTimeout(retryTimer);
        void flush();
      }
    })()
      .catch(noop)
      .finally(() => {
        rejoining = null;
      }));

  const onMembership = (room: Room, membership: string) => {
    if (room.roomId === pageId && !destroyed && membership === KnownMembership.Leave) void rejoin();
  };

  /** Resolves once everything typed so far is on the server (waits through retries). */
  const drain = () =>
    new Promise<void>((resolve) => {
      if (!pending.length && !sending && !inFlight) return resolve();
      flushed.add(resolve);
      if (!inFlight) {
        clearTimeout(retryTimer);
        void flush();
      }
    });

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === remote || destroyed) return;
    pending.push(update);
    // While sends fail, the retry timer (with backoff) sends these too.
    if (status === 'ready' && !flushTimer && !inFlight && !failingSince) flushTimer = setTimeout(() => void flush(), FLUSH_MS);
  };

  const snapshot = () => {
    if (snapshotting) return snapshotting;
    const run = (async () => {
      await drain();
      if (backfilling) await backfilling;
      await Promise.all([...applying]);
      const upto = lastLive ?? lastBackfill;
      if (!upto || behind || mediaGaps.size) return;
      const counted = sinceSnapshot;
      const mine = mineSinceSnapshot;
      const bytes = Y.encodeStateAsUpdate(doc);
      const { content_uri } = await client.uploadContent(new Blob([bytes as Uint8Array<ArrayBuffer>]), { type: 'application/octet-stream', includeFilename: false });
      await client.sendStateEvent(pageId, SNAPSHOT as never, { url: content_uri, upto } as never, '');
      sinceSnapshot -= counted;
      mineSinceSnapshot -= mine;
    })().finally(() => {
      snapshotting = null;
    });
    snapshotting = run;
    return run;
  };

  /** Snapshot and everything after it; retried until it works or the server says the page isn't mine to read. */
  const load = () => {
    clearTimeout(loadTimer);
    loadTimer = undefined;
    void (async () => {
      const snap = (await client.getStateEvent(pageId, SNAPSHOT, '').catch((e: unknown) => {
        if (e instanceof MatrixError && e.httpStatus === 404) return {};
        throw e;
      })) as { url?: unknown; upto?: unknown };
      if (typeof snap.url === 'string') Y.applyUpdate(doc, await fetchMedia(snap.url), remote);
      await runBackfill(typeof snap.upto === 'string' ? snap.upto : undefined);
    })().then(
      () => {
        if (destroyed) return;
        status = 'ready';
        emit();
        if (pending.length) void flush();
      },
      (e: unknown) => {
        if (destroyed) return;
        if (final(e)) {
          status = 'failed';
          emit();
          return;
        }
        loadBackoff = next(loadBackoff);
        loadTimer = setTimeout(load, loadBackoff);
      },
    );
  };

  const flushNow = () => {
    urgent = true;
    clearTimeout(retryTimer);
    void flush();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushNow();
    else urgent = false;
  };
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (pending.length || sending) e.preventDefault();
  };
  const inBrowser = typeof document !== 'undefined';

  // Edits made before the page has loaded wait; a page that failed to load never sends them.
  doc.on('update', onUpdate);
  client.on(RoomEvent.Timeline, onTimeline);
  client.on(RoomEvent.TimelineReset, onReset);
  client.on(ClientEvent.Sync, onSync);
  client.on(RoomEvent.MyMembership, onMembership);
  if (inBrowser) {
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('pagehide', flushNow);
    addEventListener('beforeunload', onBeforeUnload);
  }
  const detach = () => {
    client.off(RoomEvent.MyMembership, onMembership);
    client.off(RoomEvent.Timeline, onTimeline);
    client.off(RoomEvent.TimelineReset, onReset);
    client.off(ClientEvent.Sync, onSync);
    if (inBrowser) {
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('pagehide', flushNow);
      removeEventListener('beforeunload', onBeforeUnload);
    }
  };

  if (client.getRoom(pageId)?.getMyMembership() !== KnownMembership.Join) {
    try {
      await client.joinRoom(pageId, { viaServers: [server] });
    } catch (e) {
      detach();
      doc.off('update', onUpdate);
      awareness.destroy();
      doc.destroy();
      throw e;
    }
  }
  await whenJoined(pageId);
  load();

  return {
    pageId,
    doc,
    awareness,
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    async settle() {
      await drain();
      if (mineSinceSnapshot > 0) await snapshot().catch(noop);
    },
    unsent: () => pending.length > 0 || !!sending,
    flushNow,
    destroy() {
      destroyed = true;
      detach();
      clearTimeout(flushTimer);
      clearTimeout(retryTimer);
      clearTimeout(offlineTimer);
      clearTimeout(catchUpTimer);
      clearTimeout(loadTimer);
      doc.off('update', onUpdate);
      awareness.destroy();
      doc.destroy();
      listeners.clear();
    },
  };
}

const FROM_RELAY = 'presence';
// The relay takes 4 KiB a post; a caret and selection are far smaller.
const MAX_AWARENESS = 3500;

/**
 * DB-04: my awareness state (caret, selection, name and colour) goes up the presence relay as `{ y }`, everyone else's
 * comes down into the awareness. A tab that leaves, goes quiet or that I can't hear while offline loses its caret.
 */
export function bridgeAwareness(session: Pick<PageSession, 'awareness' | 'getState' | 'subscribe'>, presence: Presence, meId: string): () => void {
  const { awareness } = session;
  const byConn = new Map<string, { y: string; ids: Set<number> }>();
  let applying: Set<number> | null = null;

  const sendMine = () => {
    if (!awareness.getLocalState()) return presence.set(null);
    const y = toBase64(encodeAwarenessUpdate(awareness, [awareness.clientID]));
    if (y.length <= MAX_AWARENESS) presence.set({ y });
  };
  const onUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === FROM_RELAY) {
      for (const id of [...added, ...updated]) if (id !== awareness.clientID) applying?.add(id);
      return;
    }
    if ([...added, ...updated, ...removed].includes(awareness.clientID)) sendMine();
  };
  const drop = (conn: string) => {
    const ids = [...(byConn.get(conn)?.ids ?? [])].filter((id) => id !== awareness.clientID);
    byConn.delete(conn);
    if (ids.length) removeAwarenessStates(awareness, ids, FROM_RELAY);
  };
  const sync = () => {
    const heard = new Set<string>();
    if (!session.getState().offline) {
      for (const p of presence.peers()) {
        const y = p.user.id === meId ? undefined : (p.data as { y?: unknown } | null)?.y;
        if (typeof y !== 'string') continue;
        heard.add(p.conn);
        const entry = byConn.get(p.conn) ?? { y: '', ids: new Set<number>() };
        if (entry.y === y) continue;
        entry.y = y;
        byConn.set(p.conn, entry);
        applying = entry.ids;
        try {
          applyAwarenessUpdate(awareness, fromBase64(y), FROM_RELAY);
        } catch {
          // Not an awareness update: ignore that tab.
        } finally {
          applying = null;
        }
        // Who it is comes from the relay (server-stamped), not from the tab's own payload.
        const stamped = [...entry.ids].filter((id) => {
          const st = awareness.getStates().get(id);
          if (st) st.user = { ...(st.user as object), id: String(id), name: p.user.name, userId: p.user.id };
          return !!st;
        });
        if (stamped.length) awareness.emit('change', [{ added: [], updated: stamped, removed: [] }, FROM_RELAY]);
      }
    }
    for (const conn of [...byConn.keys()]) if (!heard.has(conn)) drop(conn);
  };

  awareness.on('update', onUpdate);
  const offPeers = presence.subscribe(sync);
  const offSession = session.subscribe(sync);
  sendMine();
  sync();
  return () => {
    awareness.off('update', onUpdate);
    offPeers();
    offSession();
    for (const conn of [...byConn.keys()]) drop(conn);
    presence.set(null);
  };
}
