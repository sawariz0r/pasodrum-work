// The model's `answer` call into the wire Answer (spec §4.1 to §4.3, §3.6). Every model string is cleaned; links and
// invented numbers are removed; handles become refs the server resolved; `plain` comes from what the server read.
import type { Tool } from './provider.ts';
import type { Known } from './ledger.ts';
import { LIMITS, type Answer, type Part } from './wire.ts';

export type Offered = Set<'source' | 'open' | 'heading' | 'text'>;
export type Checked = {
  answer: Pick<Answer, 'outcome' | 'say' | 'parts'>;
  /** Numbers that appear in nothing this ask showed the model (already removed from `answer`). */
  invented: string[];
  /** A client-facing summary was dropped (§3.6). */
  clientDropped: boolean;
};
export type AnswerContext = {
  known: (handle: unknown) => Known | undefined;
  offered: Offered;
  /** Digit runs the model may use without citing: the person's own ask and counts the server returned. */
  allowed: Set<string>;
  /** The ask was made under a chip in a client space (or toward someone outside the team). */
  clientFacing: boolean;
  /** Every source this ask read, and every source of the earlier turns, lies in that one client space. */
  clientOk: boolean;
};

/** What `hello.can.parts` may name, mapped to the model's part types (slice 1: 'message', 'open'). */
const CAN: Record<string, 'source' | 'open' | 'heading' | 'text'> = { message: 'source', open: 'open', heading: 'heading', 'text.summary': 'text' };
export const offeredFrom = (parts: string[]): Offered => new Set(parts.map((p) => CAN[p]).filter((p) => p !== undefined));

const STRIP = /[؜‎‏‪-‮⁦-⁩]/g;
const CONTROL = /\p{Cc}+/gu;
const LINK = /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:|\bmatrix:|(?<![\w.%+-])[\w.%+-]+@[\w-]+(?:\.[\w-]+)+|[@!#$+][\w.=/+-]+:[\w.-]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?![\w-])(?:\/\S*)?/i;
const SENTENCE = /[^]*?(?:[.!?](?:\s+|$)|[。！？]\s*|$)/g;

export function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.normalize('NFKC').replace(STRIP, '').replace(CONTROL, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max).trim();
}

export const hasLink = (s: string) => LINK.test(s);
export const digitRuns = (s: string) => s.match(/\d+/g) ?? [];

const str = { type: 'string' };
const handlePart = (type: string) => ({ type: 'object', additionalProperties: false, required: ['type', 'handle'], properties: { type: { type: 'string', enum: [type] }, handle: str } });
const textPart = {
  type: 'object', additionalProperties: false, required: ['type', 'kind', 'for', 'lines'],
  properties: { type: { type: 'string', enum: ['text'] }, kind: { type: 'string', enum: ['summary'] }, for: { type: ['string', 'null'] }, lines: { type: 'array', items: str } },
};

/** The strict `answer` tool, offering only the part kinds this app can draw. */
export function answerTool(offered: Offered): Tool {
  const variants = [...offered].map((p) => (p === 'text' ? textPart : handlePart(p)));
  return {
    type: 'function',
    name: 'answer',
    description: 'Ends the ask. outcome: answered, nothing (nothing read answers it) or cant. say: one or two sentences. parts: what to show, by handle.',
    strict: true,
    parameters: {
      type: 'object', additionalProperties: false, required: ['outcome', 'say', 'parts'],
      properties: {
        outcome: { type: 'string', enum: ['answered', 'nothing', 'cant'] },
        say: str,
        parts: variants.length ? { type: 'array', items: { anyOf: variants } } : { type: 'array', items: str, maxItems: 0 },
      },
    },
  };
}

/** Drops each sentence (or line) that carries a link or a number not in `allowed`; reports the invented numbers. */
function scrub(text: string, allowed: Set<string>, invented: Set<string>): string {
  const kept = (text.match(SENTENCE) ?? []).filter((s) => {
    if (!s || hasLink(s)) return false;
    const bad = digitRuns(s).filter((d) => !allowed.has(d));
    for (const d of bad) invented.add(d);
    return bad.length === 0;
  });
  const out = kept.join('').trim();
  return hasLink(out) ? '' : out;
}

export function checkAnswer(args: unknown, ctx: AnswerContext): Checked {
  const a = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const outcome = a.outcome === 'answered' || a.outcome === 'nothing' || a.outcome === 'cant' ? a.outcome : 'cant';
  const parts: Part[] = [];
  const cited: Known[] = [];
  const seen = new Set<string>();
  let clientDropped = false;
  const texts: { kind: 'summary'; lines: string[] }[] = [];

  for (const raw of Array.isArray(a.parts) ? a.parts : []) {
    if (parts.length + texts.length >= LIMITS.parts) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const p = raw as Record<string, unknown>;
    if (p.type === 'text') {
      if (!ctx.offered.has('text') || p.kind !== 'summary' || !Array.isArray(p.lines)) continue;
      // `for` names a person by handle; slice 1 hands out none, so an addressee is never kept.
      if (ctx.clientFacing && !ctx.clientOk) {
        clientDropped = true;
        continue;
      }
      texts.push({ kind: 'summary', lines: p.lines.slice(0, LIMITS.lines).map((l) => clean(l, LIMITS.line)) });
      continue;
    }
    if (p.type !== 'source' && p.type !== 'open' && p.type !== 'heading') continue;
    if (!ctx.offered.has(p.type)) continue;
    const k = ctx.known(p.handle);
    if (!k || seen.has(`${p.type}:${k.handle}`)) continue;
    if (p.type === 'source') {
      if (k.kind !== 'message') continue;
      parts.push({ t: 'source', target: k.ref, plain: k.plain });
    } else {
      if (p.type === 'heading' && k.kind !== 'place') continue;
      parts.push({ t: p.type, target: k.kind === 'place' ? k.ref : { k: 'place', room: k.room }, plain: k.placeName });
    }
    seen.add(`${p.type}:${k.handle}`);
    cited.push(k);
  }

  const allowed = new Set(ctx.allowed);
  for (const k of cited) for (const d of digitRuns(k.seen)) allowed.add(d);
  const invented = new Set<string>();
  const say = scrub(clean(a.say, LIMITS.say), allowed, invented);
  for (const t of texts) {
    const lines = t.lines.map((l) => scrub(l, allowed, invented)).filter(Boolean);
    if (lines.length) parts.push({ t: 'text', kind: 'summary', lines });
  }
  return { answer: { outcome, say, parts }, invented: [...invented], clientDropped };
}
