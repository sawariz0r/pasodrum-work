// What one ask has shown the model (spec §3.6): handles for refs, kept in a map, so the model can only point at what the
// server read in this ask. Also counts the source text against the cap and keeps the places read for "Looked in".
import type { Item, Place, Read, Where } from './reader.ts';
import type { Looked, Ref } from './wire.ts';

export type Known = { handle: string; kind: 'message' | 'place'; ref: Ref; plain: string; room: string; placeName: string; where: Where; seen: string };
export type ModelItem = { handle: string; kind: string; place: string; from: string | null; role: string | null; at: string | null; text: string };

const ID = /^[\x21-\x7e]{1,255}$/;
const id = (v: unknown): v is string => typeof v === 'string' && ID.test(v);

/** A ref as the browser sent it, checked for shape only; whether it may be read is the reader's question. */
export function asRef(v: unknown): Ref | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const keys = Object.keys(r).length;
  switch (r.k) {
    case 'place': return keys === 2 && id(r.room) ? { k: 'place', room: r.room } : null;
    case 'thread': return keys === 3 && id(r.room) && id(r.root) ? { k: 'thread', room: r.room, root: r.root } : null;
    case 'message': return keys === 3 && id(r.room) && id(r.event) ? { k: 'message', room: r.room, event: r.event } : null;
    case 'project': return keys === 2 && id(r.project) ? { k: 'project', project: r.project } : null;
    case 'issue': return keys === 3 && id(r.project) && id(r.issue) ? { k: 'issue', project: r.project, issue: r.issue } : null;
    case 'page': return keys === 2 && id(r.page) ? { k: 'page', page: r.page } : null;
    case 'person': return keys === 2 && id(r.user) ? { k: 'person', user: r.user } : null;
    case 'space': return keys === 2 && id(r.space) ? { k: 'space', space: r.space } : null;
    default: return null;
  }
}

export const refOfPlace = (p: Place): Ref =>
  p.kind === 'project' ? { k: 'project', project: p.id } : p.kind === 'page' ? { k: 'page', page: p.id } : p.kind === 'space' ? { k: 'space', space: p.id } : { k: 'place', room: p.id };

const placeKind = (p: Place) => (p.kind === 'chat' ? (p.where.in === 'none' ? 'conversation' : 'channel') : p.kind);

export function openLedger(o: { tz: number; sourceChars: number }) {
  const byHandle = new Map<string, Known>();
  const byKey = new Map<string, string>();
  const cursors = new Map<string, { room: string; from: string }>();
  const looked = new Map<string, Looked>();
  const sources = new Map<string, Where>();
  const counted = new Set<string>();
  let chars = 0;
  let capped = false;
  let n = 0;

  const localTime = (at: number) => new Date(at + o.tz * 60_000).toISOString().slice(0, 16).replace('T', ' ');

  function register(key: string, make: (handle: string) => Known): Known {
    const h = byKey.get(key);
    if (h) return byHandle.get(h)!;
    const k = make(`${key[0] === 'm' ? 'M' : 'P'}${++n}`);
    byKey.set(key, k.handle);
    byHandle.set(k.handle, k);
    return k;
  }

  function place(p: Place): { known: Known; item: ModelItem } {
    const item = (handle: string): ModelItem => ({ handle, kind: placeKind(p), place: p.name, from: null, role: null, at: null, text: '' });
    const known = register(`p${p.id}`, (handle) => ({ handle, kind: 'place', ref: refOfPlace(p), plain: p.name, room: p.id, placeName: p.name, where: p.where, seen: JSON.stringify(item(handle)) }));
    sources.set(p.id, p.where);
    return { known, item: item(known.handle) };
  }

  /** `seen` is what the model was shown of it, for the number check; a quiet item shows no text. */
  function message(p: Place, i: Item, visible: boolean): ModelItem {
    const known = register(`m${JSON.stringify(i.ref)}`, (handle) => ({
      handle, kind: 'message', ref: i.ref, plain: (i.from ? `${i.from}: ${i.text}` : i.text).slice(0, 200), room: p.id, placeName: p.name, where: p.where, seen: '',
    }));
    const shown: ModelItem = { handle: known.handle, kind: i.kind, place: i.place, from: i.from, role: i.role, at: visible ? localTime(i.at) : null, text: visible ? i.text : '' };
    if (visible || !known.seen) known.seen = JSON.stringify(shown);
    return shown;
  }

  return {
    get: (handle: unknown) => (typeof handle === 'string' ? byHandle.get(handle) : undefined),
    place,
    /** A ref the model may point at without its text being shown yet (an earlier turn's source); nothing is counted. */
    quiet(p: Place, i: Item): ModelItem {
      sources.set(p.id, p.where);
      return message(p, i, false);
    },
    /** Items read for the model: counted against the source cap, added to "Looked in". Stops at the cap. */
    show(read: Read): ModelItem[] {
      const out: ModelItem[] = [];
      let fresh = 0;
      for (const i of read.items) {
        if (chars + i.text.length > o.sourceChars) {
          capped = true;
          break;
        }
        chars += i.text.length;
        out.push(message(read.place, i, true));
        const key = JSON.stringify(i.ref);
        if (!counted.has(key)) fresh++;
        counted.add(key);
      }
      if (out.length) {
        const l = looked.get(read.place.id) ?? { target: refOfPlace(read.place), plain: read.place.name, count: 0 };
        l.count = (l.count ?? 0) + fresh;
        looked.set(read.place.id, l);
        sources.set(read.place.id, read.place.where);
      }
      return out;
    },
    cursor(room: string, from: string): string {
      const h = `C${++n}`;
      cursors.set(h, { room, from });
      return h;
    },
    fromCursor: (h: unknown) => (typeof h === 'string' ? cursors.get(h) : undefined),
    get capped() {
      return capped;
    },
    looked: () => [...looked.values()],
    /** Every place something was shown from, this ask or an earlier turn (the client-facing rule, §3.6). */
    sources: () => [...sources.values()],
    placesRead: () => [...looked.values()].map((l) => l.target),
  };
}

export type Ledger = ReturnType<typeof openLedger>;
