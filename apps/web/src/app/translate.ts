// Translation core (SIDE-01, D-32), shared by every surface that translates text: message rows today, the composer and
// Docs/Boards later. Mentions, links and code never reach the model: they become ⟦n⟧ tokens, and formatting becomes
// ⟦n⟧…⟦/n⟧ pairs, so the result is rebuilt from the original nodes and translated text only, never from returned HTML.
import type { WorkspaceStore } from '../matrix';

export type Target = 'en' | 'ja';
export interface Translated {
  html?: string;
  text?: string;
}
export interface Source {
  body: string;
  html?: string;
  /** Message id and sender: part of the cache key with the text, so two messages never share a translation and an edit is translated anew. */
  id?: string;
  senderId?: string;
}

// The service's limits (services/invite/src/translate.ts): above them we don't offer Translate at all.
const maxSegments = 40;
const maxChars = 4000;

const CJK = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const LATIN_WORD = /\p{Script=Latin}{2,}/u;
const LETTER = /\p{L}/u;
const URL = /https?:\/\/\S+/g;
const FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]+`/g;
const MENTION = /(?<![\p{L}\p{N}])@[\p{L}\p{N}._=-]+(?::[\w.-]+)?/gu;
const BRACKET = /[⟦⟧]/g;
const TOKEN = /⟦(\/?)(\d+)⟧/g;
const PROTECTED = new RegExp([FENCE, INLINE_CODE, URL, MENTION, BRACKET].map((r) => r.source).join('|'), 'gu');

/** Plain text a person reads, without code, links or mention pills. */
export function readableText(body: string, html?: string): string {
  if (html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    doc.body.querySelectorAll('a, code, pre').forEach((n) => n.remove());
    return doc.body.textContent ?? '';
  }
  return body.replace(FENCE, ' ').replace(INLINE_CODE, ' ').replace(URL, ' ').replace(MENTION, ' ');
}

/** EN↔JP by script, on this device: kana/kanji for an English reader; real Latin words and no kana/kanji for a Japanese reader. */
export function looksForeign(text: string, to: Target): boolean {
  return to === 'en' ? CJK.test(text) : !CJK.test(text) && LATIN_WORD.test(text);
}

interface Prepared {
  segments: string[];
  rebuild(out: string[]): Translated;
}

const tokensOf = (s: string) => [...s.matchAll(TOKEN)].map((m) => m[0]).sort().join();
const live = (s: string) => LETTER.test(s.replace(TOKEN, ''));

const ATOMIC = new Set(['A', 'CODE', 'IMG']);
const BLOCK = new Set(['P', 'LI', 'BLOCKQUOTE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'PRE']);

function prepareHtml(html: string): Prepared {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const kept = new Map<number, Node>();
  const runs: { nodes: ChildNode[]; text: string }[] = [];
  let next = 0;
  const keep = (n: Node) => {
    kept.set(next, n);
    return next++;
  };

  const inline = (n: ChildNode): string => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').replace(BRACKET, (ch) => `⟦${keep(doc.createTextNode(ch))}⟧`);
    if (!(n instanceof Element)) return '';
    if (n.tagName === 'BR') return '\n';
    if (ATOMIC.has(n.tagName)) return `⟦${keep(n.cloneNode(true))}⟧`;
    const id = keep(n.cloneNode(false));
    return `⟦${id}⟧${[...n.childNodes].map(inline).join('')}⟦/${id}⟧`;
  };
  const visit = (el: Element) => {
    let run: ChildNode[] = [];
    const flush = () => {
      if (run.length) runs.push({ nodes: run, text: run.map(inline).join('') });
      run = [];
    };
    for (const n of [...el.childNodes]) {
      if (n instanceof Element && BLOCK.has(n.tagName)) {
        flush();
        if (n.tagName !== 'PRE') visit(n);
      } else run.push(n);
    }
    flush();
  };
  visit(doc.body);
  const todo = runs.filter((r) => live(r.text));

  return {
    segments: todo.map((r) => r.text),
    rebuild(out) {
      const frags = out.map((t, i) => build(doc, t, todo[i]!.text, kept));
      if (frags.every(Boolean)) {
        todo.forEach((r, i) => {
          r.nodes[0]!.before(frags[i]!);
          r.nodes.forEach((n) => n.remove());
        });
        return { html: doc.body.innerHTML };
      }
      // Formatting couldn't be carried over: the same answer as plain text, links/mentions/code put back verbatim.
      const plain = out.map((t) => t.replace(TOKEN, (_, close: string, n: string) => (close ? '' : (kept.get(Number(n))?.textContent ?? ''))));
      return { text: plain.join('\n') };
    },
  };
}

/** The translated run as nodes, or null when a token went missing, repeated or crossed another. */
function build(doc: Document, text: string, source: string, kept: Map<number, Node>): DocumentFragment | null {
  if (tokensOf(text) !== tokensOf(source)) return null;
  const root = doc.createDocumentFragment();
  const stack: { id: number; el: Node }[] = [{ id: -1, el: root }];
  const add = (s: string) =>
    s.split('\n').forEach((part, i) => {
      if (i) stack.at(-1)!.el.appendChild(doc.createElement('br'));
      if (part) stack.at(-1)!.el.appendChild(doc.createTextNode(part));
    });
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    add(text.slice(at, m.index));
    at = m.index + m[0].length;
    const id = Number(m[2]);
    const node = kept.get(id)!;
    if (m[1]) {
      if (stack.at(-1)!.id !== id) return null;
      stack.pop();
    } else if (source.includes(`⟦/${id}⟧`)) {
      const open = node.cloneNode(false);
      stack.at(-1)!.el.appendChild(open);
      stack.push({ id, el: open });
    } else stack.at(-1)!.el.appendChild(node.cloneNode(true));
  }
  add(text.slice(at));
  return stack.length === 1 ? root : null;
}

function prepareText(text: string): Prepared {
  const kept: string[] = [];
  const mask = (s: string) => `⟦${kept.push(s) - 1}⟧`;
  // One pass, leftmost first, so a token we insert is never masked again.
  const masked = text.replace(PROTECTED, mask);
  const lines = masked.split('\n');
  const todo = lines.map((l, i) => ({ l, i })).filter(({ l }) => live(l));
  const unmask = (s: string) => s.replace(TOKEN, (_, __, n: string) => kept[Number(n)] ?? '');
  return {
    segments: todo.map(({ l }) => l),
    rebuild(out) {
      const result = [...lines];
      todo.forEach(({ l, i }, k) => {
        // A token the model lost or doubled: keep that line as sent rather than lose code or a link.
        result[i] = tokensOf(out[k]!) === tokensOf(l) ? out[k]! : l;
      });
      return { text: result.map(unmask).join('\n') };
    },
  };
}

const prepare = (s: Source) => (s.html ? prepareHtml(s.html) : prepareText(s.body));

/** Within the service's limits and has something to translate. */
export function fits(source: Source): boolean {
  if (source.body.length > maxChars) return false;
  const { segments } = prepare(source);
  return segments.length > 0 && segments.length <= maxSegments && segments.reduce((n, s) => n + s.length, 0) <= maxChars;
}

// In memory only (this tab): translations of encrypted team messages never reach storage. Cleared on every sign-out.
const limit = 300;
const cache = new Map<string, Translated>();
const forgetters = new Set<() => void>();

/** Forget every translation (any sign-out or session change); features holding their own state subscribe with onForget. */
export function forgetTranslations() {
  cache.clear();
  forgetters.forEach((f) => f());
}

export function onForget(f: () => void): () => void {
  forgetters.add(f);
  return () => forgetters.delete(f);
}

export function contentKey(source: Source, to: Target): string {
  const s = [to, source.id ?? '', source.senderId ?? '', source.body, source.html ?? ''].join('\u0000');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${to}:${source.id ?? ''}:${s.length}:${(h >>> 0).toString(36)}`;
}

/** Translates plain or formatted text with one service call; formatting falls back to plain text if it can't be carried over. */
export async function translateText(store: WorkspaceStore, source: Source, to: Target): Promise<Translated> {
  const key = contentKey(source, to);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = prepare(source);
  if (!p.segments.length) throw new Error('failed');
  const result = p.rebuild(await store.translate(p.segments, to));
  cache.delete(key);
  cache.set(key, result);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
  return result;
}
