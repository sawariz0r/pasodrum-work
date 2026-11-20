// Emoji data from emojibase, English + Japanese, loaded on first use. Search matches either language and shortcodes.

export interface Emoji {
  unicode: string;
  /** Preferred :shortcode: (without colons), when it has one. */
  code?: string;
  codes: string[];
  group: number;
  order: number;
  /** Lowercased names and tags in both languages. */
  names: string[];
  tags: string[];
}

export interface EmojiData {
  all: Emoji[];
  byCode: Map<string, Emoji>;
  byGroup: Map<number, Emoji[]>;
}

/** Picker categories after Frequently used, in the board's order (emojibase group ids). */
export const categories = [
  { group: 0, key: 'smileys', icon: '😀' },
  { group: 1, key: 'people', icon: '👋' },
  { group: 3, key: 'animals', icon: '🐻' },
  { group: 4, key: 'food', icon: '🍔' },
  { group: 6, key: 'activities', icon: '⚽' },
  { group: 5, key: 'travel', icon: '✈️' },
  { group: 7, key: 'objects', icon: '💡' },
  { group: 8, key: 'symbols', icon: '❤️' },
] as const;

export const frequentIcon = '🕘';

export const frequent = ['👍', '🙌', '✅', '🎉', '🚀', '👀', '❤️', '😂', '🔥', '💯', '🙏', '👏', '😮', '😅', '🤔', '✨'];

interface Raw {
  unicode: string;
  hexcode: string;
  label: string;
  group?: number;
  order?: number;
  tags?: string[];
}
type Codes = Record<string, string | string[]>;

const COMPONENTS = 2;
let data: EmojiData | null = null;
let loading: Promise<EmojiData> | null = null;

const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

type Versions = Record<string, string[]>;

/** Hexcodes from emoji versions this device can't draw (they would show as empty boxes). */
export function unsupported(versions: Versions, canDraw: (emoji: string) => boolean): Set<string> {
  const out = new Set<string>();
  const newestFirst = Object.keys(versions).sort((a, b) => Number(b) - Number(a));
  for (const v of newestFirst) {
    const sample = versions[v]!.find((hex) => !hex.includes('-'));
    if (sample && canDraw(String.fromCodePoint(parseInt(sample, 16)))) break;
    for (const hex of versions[v]!) out.add(hex);
  }
  return out;
}

function canvasCanDraw(): (emoji: string) => boolean {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  } catch {
    ctx = null;
  }
  if (!ctx) return () => true;
  const c = ctx;
  c.canvas.width = c.canvas.height = 20;
  c.font = '16px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  c.textBaseline = 'top';
  const pixels = (text: string) => {
    c.clearRect(0, 0, 20, 20);
    c.fillText(text, 0, 0);
    return c.getImageData(0, 0, 20, 20).data.join(',');
  };
  const missing = pixels(String.fromCodePoint(0x1fffe));
  return (emoji) => pixels(emoji) !== missing;
}

export function buildEmojiData(en: Raw[], ja: Raw[], github: Codes, emojibase: Codes, skip: Set<string> = new Set()): EmojiData {
  const jaByHex = new Map(ja.map((e) => [e.hexcode, e]));
  const all: Emoji[] = [];
  const byCode = new Map<string, Emoji>();
  const byGroup = new Map<number, Emoji[]>();
  for (const e of en) {
    if (e.group === undefined || e.group === COMPONENTS || e.order === undefined || skip.has(e.hexcode)) continue;
    const j = jaByHex.get(e.hexcode);
    const codes = [...new Set([...list(github[e.hexcode]), ...list(emojibase[e.hexcode])])];
    const emoji: Emoji = {
      unicode: e.unicode,
      code: codes[0],
      codes,
      group: e.group,
      order: e.order,
      names: [e.label.toLowerCase(), ...(j ? [j.label.toLowerCase()] : [])],
      tags: [...(e.tags ?? []), ...(j?.tags ?? [])].map((t) => t.toLowerCase()),
    };
    all.push(emoji);
    for (const c of codes) if (!byCode.has(c)) byCode.set(c, emoji);
    const g = byGroup.get(e.group) ?? [];
    g.push(emoji);
    byGroup.set(e.group, g);
  }
  all.sort((a, b) => a.order - b.order);
  for (const g of byGroup.values()) g.sort((a, b) => a.order - b.order);
  return { all, byCode, byGroup };
}

export function emojiData(): EmojiData | null {
  return data;
}

export function loadEmoji(): Promise<EmojiData> {
  loading ??= Promise.all([
    import('emojibase-data/en/compact.json'),
    import('emojibase-data/ja/compact.json'),
    import('emojibase-data/en/shortcodes/github.json'),
    import('emojibase-data/en/shortcodes/emojibase.json'),
    import('emojibase-data/versions/emoji.json'),
  ]).then(([en, ja, github, emojibase, versions]) => {
    const skip = unsupported(versions.default as Versions, canvasCanDraw());
    data = buildEmojiData(en.default as unknown as Raw[], ja.default as unknown as Raw[], github.default as Codes, emojibase.default as Codes, skip);
    return data;
  });
  return loading;
}

function rank(e: Emoji, q: string): number {
  if (e.codes.includes(q)) return 0;
  if (e.codes.some((c) => c.startsWith(q))) return 1;
  if (e.names.some((n) => n.startsWith(q))) return 2;
  if (e.tags.some((t) => t.startsWith(q)) || e.names.some((n) => n.includes(` ${q}`))) return 3;
  if (e.names.some((n) => n.includes(q)) || e.codes.some((c) => c.includes(q)) || e.tags.some((t) => t.includes(q))) return 4;
  return -1;
}

export function searchEmoji(d: EmojiData, query: string, limit = Infinity): Emoji[] {
  const q = query.trim().toLowerCase().replace(/^:|:$/g, '');
  if (!q) return [];
  const hits: [number, Emoji][] = [];
  for (const e of d.all) {
    const r = rank(e, q);
    if (r >= 0) hits.push([r, e]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1].order - b[1].order);
  return hits.slice(0, limit).map(([, e]) => e);
}
