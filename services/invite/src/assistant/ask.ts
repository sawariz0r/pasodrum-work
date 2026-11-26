// One ask after the gate (spec §2.3, §3.7, §7): the usage row, the history and context checks, the model loop with its
// caps, the finds and lists sent to the browser, and the checked answer. Nothing of the ask outlives it.
import type { WebSocket } from 'ws';
import { answerTool, checkAnswer, clean, digitRuns, offeredFrom } from './answer.ts';
import type { Admitted } from './gate.ts';
import { asRef, openLedger, type ModelItem } from './ledger.ts';
import type { Mask } from './mask.ts';
import { INSTRUCTIONS } from './prompt.ts';
import { ProviderError, developer, userData, type ProviderItem, type Step, type StepResult, type Usage } from './provider.ts';
import type { Place, Read, Reader, Where } from './reader.ts';
import { CHAT_TOOLS, runChat, type ChatContext } from './sources/chat.ts';
import { add, costMicros, estimate, validTz, zero, type Outcome, type Price, type UsageBook } from './usage.ts';
import { CAPS, FIND_MS, LIMITS, type Answer, type AskContext, type Can, type Depth, type HistoryTurn, type Lang, type Ref, type ServerMessage } from './wire.ts';

export type Hello = { ask: string; lang: Lang; tz: number; depth: Depth; closer: boolean; context: AskContext | null; history: HistoryTurn[]; can: Can };
export type Model = { model: string; effort: string; price: Price };
export type AskDeps = {
  ws: WebSocket;
  reader: Reader;
  step: Step;
  book: UsageBook;
  admitted: Admitted;
  hello: Hello;
  model: Model;
  mask: Mask;
  now: () => number;
  onEnd: () => void;
};
export type Running = { message(m: Record<string, unknown>): void; end(outcome: 'stopped' | 'failed'): void };

type Json = Record<string, unknown>;
type Call = { name: string; call_id: string; arguments: string };

const MIN_OUTPUT = 16;
const LOW_OUTPUT = 1000;
const LIMIT = { error: 'limit reached; answer with what you have' };
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isCall = (i: ProviderItem): i is ProviderItem & Call =>
  i.type === 'function_call' && typeof i.name === 'string' && typeof i.call_id === 'string' && typeof i.arguments === 'string';
const output = (callId: string, result: unknown): ProviderItem => ({ type: 'function_call_output', call_id: callId, output: JSON.stringify(result) });
const strings = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every((s) => typeof s === 'string' && s.length <= 64);

function refs(v: unknown, max: number): Ref[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out = v.map(asRef);
  return out.every((r) => r !== null) ? (out as Ref[]) : null;
}

function parseContext(v: unknown): AskContext | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || typeof v.kind !== 'string' || v.kind.length > 64 || (v.layer !== 'page' && v.layer !== 'panel')) return undefined;
  const r = refs(v.refs, LIMITS.contextRefs);
  const selection = v.selection === undefined ? undefined : asRef(v.selection);
  if (!r || selection === null) return undefined;
  if (v.newest !== undefined && (typeof v.newest !== 'string' || !/^\$[\x21-\x7e]{1,254}$/.test(v.newest))) return undefined;
  if (v.closed !== undefined && v.closed !== 'sealed') return undefined;
  return { kind: v.kind, layer: v.layer, refs: r, ...(selection ? { selection } : {}), ...(v.newest ? { newest: v.newest as string } : {}), ...(v.closed ? { closed: 'sealed' as const } : {}) };
}

/** Everything the browser sends is untrusted: shapes and every cap are checked again here. Null closes the socket. */
export function parseHello(m: Json): Hello | null {
  if (typeof m.ask !== 'string' || !m.ask.trim() || m.ask.length > LIMITS.ask) return null;
  if ((m.lang !== 'en' && m.lang !== 'ja') || !validTz(m.tz) || (m.depth !== 'quick' && m.depth !== 'thorough')) return null;
  if (m.closer !== undefined && typeof m.closer !== 'boolean') return null;
  const context = parseContext(m.context);
  if (context === undefined) return null;
  if (!Array.isArray(m.history) || m.history.length > LIMITS.historyTurns) return null;
  const history: HistoryTurn[] = [];
  let chars = 0;
  let refCount = 0;
  for (const t of m.history) {
    if (!isObj(t) || typeof t.ask !== 'string' || typeof t.say !== 'string') return null;
    const sources = refs(t.sources, LIMITS.historyRefs);
    if (!sources) return null;
    chars += t.ask.length + t.say.length;
    refCount += sources.length;
    history.push({ ask: t.ask, say: t.say, sources });
  }
  if (chars > LIMITS.historyChars || refCount > LIMITS.historyRefs) return null;
  const can = m.can;
  if (!isObj(can) || !strings(can.parts, 32) || !strings(can.proposals, 32) || !strings(can.views, 32)) return null;
  // `sealed` is slice 4; until then it is never read.
  return { ask: m.ask, lang: m.lang, tz: m.tz, depth: m.depth, closer: m.closer === true, context, history, can: { parts: can.parts as string[], proposals: [], views: [] } };
}

export function startAsk(d: AskDeps): Running | 'day-limit' | 'month-limit' {
  const { hello, book, now, reader } = d;
  const caps = CAPS[hello.depth];
  const opened = book.open({ userId: d.admitted.userId, tz: hello.tz, depth: hello.depth, model: d.model.model, effort: d.model.effort });
  if (typeof opened === 'string') return opened;
  const row = opened.id;

  const started = now();
  const controller = new AbortController();
  const ledger = openLedger({ tz: hello.tz, sourceChars: caps.sourceChars });
  const tools = [...CHAT_TOOLS, answerTool(offeredFrom(hello.can.parts))];
  const toolsChars = JSON.stringify(tools).length;
  const tag = book.tag(d.admitted.userId);
  const allowed = new Set(digitRuns(hello.ask.normalize('NFKC')));
  const pending = new Map<number, { kind: 'find' | 'list'; resolve: (r: Ref[] | null) => void }>();
  const stale = new Set<number>();
  let counts: Usage = zero();
  let cost = 0;
  let calls = 0;
  let toolCalls = 0;
  let finds = 0;
  let nextId = 0;
  let inflight: { at: number; chars: number } | null = null;
  let finished = false;
  let chip: { facing: boolean; space: string | null } = { facing: false, space: null };

  const send = (m: ServerMessage) => d.ws.readyState === d.ws.OPEN && d.ws.send(JSON.stringify(m));
  const spend = () => ({ calls, counts, costMicros: cost, ms: now() - started });
  const outputLeft = () => Math.max(0, caps.outputTokens - counts.output);
  const charge = (u: Usage) => {
    counts = add(counts, u);
    cost += costMicros(d.model.price, u);
  };
  const chargeInflight = () => {
    if (inflight) charge(estimate(inflight.chars, now() - inflight.at, outputLeft()));
    inflight = null;
  };
  const askTimer = setTimeout(() => end('failed'), caps.askMs);

  function end(outcome: Exclude<Outcome, 'open'>, answer?: Omit<Answer, 'thorough'>, code = 1000) {
    if (finished) return;
    finished = true;
    clearTimeout(askTimer);
    chargeInflight();
    controller.abort();
    for (const p of [...pending.values()]) p.resolve(null);
    book.close(row, spend(), outcome);
    d.onEnd();
    if (answer) send({ t: 'answer', answer: { ...answer, thorough: book.status(d.admitted.userId, hello.tz).thorough } });
    else if (outcome === 'failed') send({ t: 'error', reason: 'failed' });
    d.ws.close(code);
  }

  function browser(kind: 'find' | 'list', m: ServerMessage & { id: number }): Promise<Ref[] | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(m.id);
        stale.add(m.id);
        resolve(null);
      }, FIND_MS);
      pending.set(m.id, { kind, resolve: (r) => (clearTimeout(timer), pending.delete(m.id), resolve(r)) });
      send(m);
    });
  }

  const chat: ChatContext = {
    reader,
    ledger,
    find: async (query, within) => {
      if (finds >= caps.finds) return 'limit';
      finds++;
      return browser('find', { t: 'find', id: ++nextId, query, in: within });
    },
    list: () => browser('list', { t: 'list', id: ++nextId }),
  };

  const status = () => send({ t: 'status', stage: hello.closer ? 'closer' : 'looking', places: ledger.placesRead() });

  /** The context and the earlier turns may name one message or thread many times; each is read once per ask. */
  const reads = new Map<string, Promise<Read | null>>();
  function readRef(ref: Extract<Ref, { k: 'message' | 'thread' }>): Promise<Read | null> {
    const key = ref.k === 'message' ? `m\u0000${ref.room}\u0000${ref.event}` : `t\u0000${ref.room}\u0000${ref.root}`;
    let read = reads.get(key);
    if (!read) reads.set(key, (read = ref.k === 'message' ? reader.readEvent(ref.room, ref.event) : reader.readThread(ref.room, ref.root)));
    return read;
  }

  /** One source of an earlier turn, checked now; null drops the whole turn. */
  async function checkSource(ref: Ref): Promise<ModelItem | null> {
    if (ref.k === 'place') {
      const p = await reader.checkPlace(ref.room, 'chat');
      return p && ledger.place(p).item;
    }
    if (ref.k !== 'message' && ref.k !== 'thread') return null;
    const read = await readRef(ref);
    const first = read?.items[0];
    return read && first ? ledger.quiet(read.place, first) : null;
  }

  async function readHistory() {
    const turns: { ask: string; say: string; sources: ModelItem[] }[] = [];
    for (const t of hello.history) {
      const sources = await Promise.all(t.sources.map(checkSource));
      if (sources.some((s) => s === null)) continue;
      turns.push({ ask: d.mask(clean(t.ask, LIMITS.ask)), say: d.mask(clean(t.say, LIMITS.say)), sources: sources as ModelItem[] });
    }
    return turns;
  }

  async function readContext(): Promise<ModelItem[]> {
    const c = hello.context;
    if (!c || c.closed === 'sealed') return [];
    const shown = new Map<string, ModelItem>();
    const wheres: (Where | null)[] = [];
    const placeShown = (p: Place) => {
      const { item } = ledger.place(p);
      shown.set(item.handle, item);
      wheres.push(p.where);
    };
    for (const ref of [...c.refs, ...(c.selection ? [c.selection] : [])]) {
      if (ref.k === 'place') {
        const p = await reader.checkPlace(ref.room, 'chat');
        if (p) placeShown(p);
        else wheres.push(null);
        if (p && c.newest) chat.newest = { room: p.id, event: c.newest };
      } else if (ref.k === 'message' || ref.k === 'thread') {
        const read = await readRef(ref);
        if (!read) {
          wheres.push(null);
          continue;
        }
        placeShown(read.place);
        for (const item of ledger.show(read)) shown.set(item.handle, item);
      } else {
        wheres.push(null);
      }
    }
    // A chip in a client space, or one the server cannot place, makes a summary client-facing (§3.6).
    const spaces = new Set(wheres.map((w) => (w === null ? null : w.in === 'client' ? w.space : '')));
    spaces.delete('');
    chip = { facing: spaces.size > 0, space: spaces.size === 1 && !spaces.has(null) ? [...spaces][0]! : null };
    return [...shown.values()];
  }

  async function call(items: ProviderItem[], answerOnly: boolean): Promise<StepResult | null> {
    calls++;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(caps.callMs)]);
    inflight = { at: now(), chars: JSON.stringify(items).length + toolsChars };
    try {
      const r = await d.step({ model: d.model.model, effort: d.model.effort, items: [...items], tools, signal, tag, maxOutput: outputLeft(), answerOnly });
      if (finished) return null;
      if (r.usage) {
        inflight = null;
        charge(r.usage);
      } else {
        chargeInflight();
      }
      book.raise(row, spend());
      return r;
    } catch (e) {
      if (finished) return null;
      if (e instanceof ProviderError && (e.usage || e.unbilled)) {
        inflight = null;
        if (e.usage) charge(e.usage);
      }
      end('failed');
      return null;
    }
  }

  async function tool(c: Call): Promise<unknown> {
    let args: unknown;
    try {
      args = JSON.parse(c.arguments);
    } catch {
      return { error: 'bad arguments' };
    }
    if (!isObj(args)) return { error: 'bad arguments' };
    if (toolCalls >= caps.toolCalls) return LIMIT;
    toolCalls++;
    const r = await runChat(c.name, args, chat);
    if (typeof r.count === 'number') allowed.add(String(r.count));
    return r;
  }

  const clientOk = () => chip.space !== null && ledger.sources().every((w) => w.in === 'client' && w.space === chip.space);
  const mayCallAgain = () => calls < caps.modelCalls && cost < caps.costMicros && outputLeft() >= MIN_OUTPUT;

  async function run() {
    const earlier = await readHistory();
    const screen = await readContext();
    if (finished) return;
    status();
    const nowLocal = new Date(now() + hello.tz * 60_000).toISOString().slice(0, 16).replace('T', ' ');
    const first = { ask: d.mask(clean(hello.ask, LIMITS.ask)), lang: hello.lang, now: nowLocal, screen, earlier_turns: earlier };
    const items: ProviderItem[] = [developer(INSTRUCTIONS), userData(JSON.stringify(first))];
    let force = false;
    let repaired = false;
    for (;;) {
      if (calls >= caps.modelCalls || outputLeft() < MIN_OUTPUT) return end('failed');
      if (calls === caps.modelCalls - 1 || cost >= caps.costMicros || toolCalls >= caps.toolCalls || ledger.capped || outputLeft() < LOW_OUTPUT) force = true;
      const r = await call(items, force);
      if (!r) return;
      items.push(...r.items);
      const fcs = r.items.filter(isCall);
      const answerCall = fcs.find((c) => c.name === 'answer');
      if (answerCall) {
        let args: unknown = null;
        try {
          args = JSON.parse(answerCall.arguments);
        } catch {
          return end('failed');
        }
        const checked = checkAnswer(args, { known: ledger.get, offered: offeredFrom(hello.can.parts), allowed, clientFacing: chip.facing, clientOk: clientOk() });
        const problems = [
          ...(checked.invented.length ? [`These numbers appear in nothing you read: ${checked.invented.join(', ')}. Answer again without them.`] : []),
          ...(checked.clientDropped ? ['A summary here may rest only on sources from this client space. Answer again without it.'] : []),
        ];
        if (problems.length && !repaired && mayCallAgain()) {
          repaired = true;
          force = true;
          for (const c of fcs) items.push(output(c.call_id, c === answerCall ? { error: problems.join(' ') } : { error: 'skipped' }));
          continue;
        }
        return end(checked.answer.outcome, { ...checked.answer, depth: hello.depth, looked: ledger.looked(), usedSealed: false });
      }
      if (force || !fcs.length) return end('failed');
      for (const c of fcs) {
        const result = await tool(c);
        if (finished) return;
        items.push(output(c.call_id, result));
      }
      status();
    }
  }

  run().catch(() => end('failed'));

  return {
    end: (outcome) => end(outcome),
    message(m) {
      if (finished) return;
      if (m.t === 'stop') return end('stopped');
      if ((m.t === 'found' || m.t === 'places') && typeof m.id === 'number') {
        const p = pending.get(m.id);
        if (!p && stale.has(m.id)) return;
        const list = refs(m.t === 'found' ? m.hits : m.places, m.t === 'found' ? LIMITS.hits : LIMITS.places);
        if (p && list && p.kind === (m.t === 'found' ? 'find' : 'list')) return p.resolve(list);
      }
      end('failed', undefined, 1008);
    },
  };
}

