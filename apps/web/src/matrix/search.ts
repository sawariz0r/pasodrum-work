// M8: message search as a local substring scan (D-13: the server's search is whole-word and misses Japanese).
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import type { Message, SearchHit } from './types';

/** Older history per conversation and pass: SCAN events per request, SCAN_PAGES requests; ROOMS conversations at a time. */
const SCAN = 100;
const SCAN_PAGES = 5;
const ROOMS = 4;
const CURSORS = 8;
const SKIP = new Set<Message['kind']>(['deleted', 'system', 'undecryptable']);

/** NFKC folds full-width/half-width forms (Japanese IME input), then case. */
export const fold = (s: string) => s.normalize('NFKC').toLowerCase();

/** A sent message with text whose plain body contains the (already folded) needle. */
export const matches = (m: Message, needle: string) => m.status === 'sent' && !SKIP.has(m.kind) && !!m.body && fold(m.body).includes(needle);

export interface SearchSource {
  /** Conversations to scan, most recent first (an unconfirmed device leaves the encrypted ones out). */
  rooms(channelId?: string): Room[];
  /** The events already in memory, oldest first. */
  loaded(room: Room): MatrixEvent[];
  /** Where older history starts for a room (null = the loaded timeline reaches its start). */
  start(room: Room): string | null;
  /** One page of older history, newest first, decrypted. */
  page(room: Room, from: string, limit: number, signal: AbortSignal): Promise<{ events: MatrixEvent[]; end?: string }>;
  message(ev: MatrixEvent, room: Room): Message | null;
  threadRoot(ev: MatrixEvent): string | undefined;
}

interface RoomScan {
  room: Room;
  token: string | null;
  /** Latest edit per target id, from what this scan has seen (edits come before their originals going back). */
  edits: Map<string, MatrixEvent>;
}
interface Pass {
  needle: string;
  scope?: string;
  rooms: RoomScan[];
  seen: Set<string>;
}

const abortError = () => new DOMException('Aborted', 'AbortError');

export function createSearch(src: SearchSource) {
  const cursors = new Map<string, Pass>();
  let seq = 0;

  const noteEdit = (scan: RoomScan, ev: MatrixEvent) => {
    const target = ev.getRelation()?.event_id;
    if (!target || ev.isDecryptionFailure() || ev.isRedacted()) return;
    const prev = scan.edits.get(target);
    if (!prev || prev.getTs() < ev.getTs()) scan.edits.set(target, ev);
  };
  const isEdit = (ev: MatrixEvent) => ev.isRelation('m.replace');

  const hitsOf = (pass: Pass, scan: RoomScan, events: MatrixEvent[], live: boolean): SearchHit[] => {
    const hits: SearchHit[] = [];
    for (const ev of events) {
      const id = ev.getId();
      if (!id || isEdit(ev) || pass.seen.has(id) || ev.isDecryptionFailure() || ev.isBeingDecrypted()) continue;
      pass.seen.add(id);
      // Timeline events already carry their edits; fetched ones get the latest edit by the same sender seen so far.
      const edit = live ? undefined : scan.edits.get(id);
      if (edit && !ev.replacingEventId() && edit.getSender() === ev.getSender()) ev.makeReplaced(edit);
      const m = src.message(ev, scan.room);
      if (!m || !matches(m, pass.needle)) continue;
      const root = src.threadRoot(ev);
      hits.push(root ? { message: m, threadRootId: root } : { message: m });
    }
    return hits.sort((a, b) => b.message.ts - a.message.ts);
  };

  const older = async (pass: Pass, scan: RoomScan, signal: AbortSignal, emit: (hits: SearchHit[]) => void) => {
    for (let i = 0; i < SCAN_PAGES && scan.token; i++) {
      const from = scan.token;
      const res = await src.page(scan.room, from, SCAN, signal).catch((e: unknown) => {
        if (signal.aborted) throw abortError();
        throw e;
      });
      if (signal.aborted) throw abortError();
      res.events.filter(isEdit).forEach((ev) => noteEdit(scan, ev));
      emit(hitsOf(pass, scan, res.events, false));
      scan.token = res.events.length && res.end && res.end !== from ? res.end : null;
    }
  };

  return async function search(
    query: string,
    { channelId, cursor, signal, onHits }: { channelId?: string; cursor?: string; signal: AbortSignal; onHits: (hits: SearchHit[]) => void },
  ): Promise<{ next?: string }> {
    if (signal.aborted) throw abortError();
    const needle = fold(query.trim());
    if (!needle) return {};
    const emit = (hits: SearchHit[]) => {
      if (signal.aborted) throw abortError();
      if (hits.length) onHits(hits);
    };
    let pass = cursor ? cursors.get(cursor) : undefined;
    if (cursor) cursors.delete(cursor);
    if (pass && (pass.needle !== needle || pass.scope !== channelId)) pass = undefined;
    if (!pass) {
      pass = { needle, ...(channelId ? { scope: channelId } : {}), rooms: [], seen: new Set() };
      const loaded: SearchHit[] = [];
      for (const room of src.rooms(channelId)) {
        const scan: RoomScan = { room, token: src.start(room), edits: new Map() };
        const events = src.loaded(room);
        events.filter(isEdit).forEach((ev) => noteEdit(scan, ev));
        loaded.push(...hitsOf(pass, scan, events, true));
        pass.rooms.push(scan);
      }
      emit(loaded.sort((a, b) => b.message.ts - a.message.ts));
    }
    const queue = pass.rooms.filter((r) => r.token);
    const worker = async () => {
      for (let scan = queue.shift(); scan; scan = queue.shift()) {
        // A conversation that fails (server hiccup) keeps its place for the next pass.
        await older(pass, scan, signal, emit).catch((e: unknown) => {
          if (signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) throw abortError();
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(ROOMS, queue.length) }, worker));
    if (signal.aborted) throw abortError();
    if (!pass.rooms.some((r) => r.token)) return {};
    const id = `search-${++seq}`;
    cursors.set(id, pass);
    for (const old of cursors.keys()) if (cursors.size > CURSORS) cursors.delete(old);
    return { next: id };
  };
}
