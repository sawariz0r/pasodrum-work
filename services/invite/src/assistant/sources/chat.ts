// The chat lookups of slice 1 (spec §5.3). The browser only finds and lists refs; every ref is checked and read here
// through the reader, and a ref it refuses is dropped without a word.
import { clean } from '../answer.ts';
import type { Ledger, ModelItem } from '../ledger.ts';
import type { Tool } from '../provider.ts';
import type { Kind, Read, Reader } from '../reader.ts';
import { LIMITS, type Ref } from '../wire.ts';

export type ChatContext = {
  reader: Reader;
  ledger: Ledger;
  /** Asks the browser to search; null when it did not answer in time; 'limit' past the cap. */
  find: (query: string, within: Ref[] | null) => Promise<Ref[] | null | 'limit'>;
  list: () => Promise<Ref[] | null>;
  /** The newest message on the screen the ask came from; reading that place stops there. */
  newest?: { room: string; event: string };
};
type Result = Record<string, unknown>;

const BATCH = 8;
const handle = { type: 'string' };
const tool = (name: string, description: string, properties: Record<string, unknown>): Tool => ({
  type: 'function', name, description, strict: true,
  parameters: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties },
});

export const CHAT_TOOLS: Tool[] = [
  tool('find', 'Searches the person\'s conversations for messages containing the words. in: place handles to search in, or null for everywhere.', {
    query: { type: 'string' }, in: { type: ['array', 'null'], items: handle },
  }),
  tool('read_place', 'The latest messages of a channel or conversation, oldest first. before: the "older" handle of an earlier read_place, or null.', { handle, before: { type: ['string', 'null'] } }),
  tool('read_thread', 'A message and the replies in its thread.', { handle }),
  tool('read_around', 'A message and the messages just before and after it.', { handle }),
  tool('list_places', 'The person\'s channels, conversations, projects and pages, by name.', {}),
];

const NOT_READABLE = { error: 'not readable' };
const LIMIT = { error: 'limit reached; answer with what you have' };

async function inBatches<T, R>(list: T[], f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += BATCH) out.push(...(await Promise.all(list.slice(i, i + BATCH).map(f))));
  return out;
}

function shown(ctx: ChatContext, read: Read, extra: Result = {}): Result {
  const { item } = ctx.ledger.place(read.place);
  const items = ctx.ledger.show(read);
  return { place: item, count: items.length, items, ...extra, ...(ctx.ledger.capped ? { note: LIMIT.error } : {}) };
}

function messageOf(ctx: ChatContext, h: unknown) {
  const k = ctx.ledger.get(h);
  return k && k.kind === 'message' && k.ref.k === 'message' ? k.ref : null;
}

const KIND: Partial<Record<Ref['k'], Kind>> = { place: 'chat', project: 'project', page: 'page' };
const roomOf = (r: Ref) => (r.k === 'place' ? r.room : r.k === 'project' ? r.project : r.k === 'page' ? r.page : null);

export async function runChat(name: string, args: Record<string, unknown>, ctx: ChatContext): Promise<Result> {
  if (ctx.ledger.capped && name !== 'list_places') return LIMIT;
  switch (name) {
    case 'find': {
      const query = clean(args.query, LIMITS.queryMax);
      if (query.length < LIMITS.queryMin) return { error: `query must be ${LIMITS.queryMin} to ${LIMITS.queryMax} characters` };
      let within: Ref[] | null = null;
      if (Array.isArray(args.in) && args.in.length) {
        within = args.in.slice(0, LIMITS.inRefs).map((h) => ctx.ledger.get(h)).filter((k) => k?.kind === 'place' && k.ref.k === 'place').map((k) => k!.ref);
        if (!within.length) return { error: 'unknown handle' };
      }
      const hits = await ctx.find(query, within);
      if (hits === 'limit') return LIMIT;
      if (hits === null) return { count: 0, items: [], note: 'the search did not answer in time' };
      const reads = await inBatches(hits.filter((r) => r.k === 'message'), (r) => (r.k === 'message' ? ctx.reader.readEvent(r.room, r.event) : Promise.resolve(null)));
      const items: ModelItem[] = [];
      for (const read of reads) if (read) items.push(...ctx.ledger.show(read));
      return { count: items.length, items, ...(ctx.ledger.capped ? { note: LIMIT.error } : {}) };
    }
    case 'read_place': {
      const k = ctx.ledger.get(args.handle);
      if (!k || k.ref.k !== 'place') return NOT_READABLE;
      const cursor = args.before === null || args.before === undefined ? undefined : ctx.ledger.fromCursor(args.before);
      if (args.before != null && (!cursor || cursor.room !== k.room)) return { error: 'unknown handle' };
      const read = await ctx.reader.readPlace(k.room, cursor ? { from: cursor.from } : {});
      if (!read) return NOT_READABLE;
      if (!cursor && ctx.newest?.room === k.room) {
        const at = read.items.findIndex((i) => i.ref.k === 'message' && i.ref.event === ctx.newest!.event);
        if (at >= 0) read.items = read.items.slice(0, at + 1);
      }
      return shown(ctx, read, { older: read.more ? ctx.ledger.cursor(k.room, read.more) : null });
    }
    case 'read_thread': {
      const m = messageOf(ctx, args.handle);
      const read = m && (await ctx.reader.readThread(m.room, m.event));
      return read ? shown(ctx, read) : NOT_READABLE;
    }
    case 'read_around': {
      const m = messageOf(ctx, args.handle);
      const read = m && (await ctx.reader.readAround(m.room, m.event));
      return read ? shown(ctx, read) : NOT_READABLE;
    }
    case 'list_places': {
      const refs = await ctx.list();
      if (!refs) return { count: 0, places: [], note: 'the list did not answer in time' };
      const places = await inBatches(refs.slice(0, LIMITS.places), (r) => {
        const kind = KIND[r.k];
        const room = roomOf(r);
        return kind && room ? ctx.reader.checkPlace(room, kind) : Promise.resolve(null);
      });
      const items = places.filter((p) => p !== null).map((p) => ctx.ledger.place(p).item);
      return { count: items.length, places: items };
    }
    default:
      return { error: 'unknown tool' };
  }
}
