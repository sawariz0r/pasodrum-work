import type { Message } from '../../matrix';

const groupWindowMs = 5 * 60_000;

export type TimelineItem =
  | { kind: 'day'; key: string; day: Date }
  | { kind: 'new'; key: 'new' }
  /** `group`: consecutive images (one grid) or files (one card) from one sender, `message` first. */
  | { kind: 'message'; key: string; message: Message; head: boolean; group?: Message[] };

function startOfDay(ts: number): Date {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

const quiet = (m: Message) => m.kind === 'deleted' || m.kind === 'system';

/** Images and files without a caption of their own can join a neighbour's grid or card. */
function groupKind(m: Message): 'image' | 'file' | null {
  if ((m.kind !== 'image' && m.kind !== 'file') || !m.media) return null;
  return !m.body || m.body === m.media.name ? m.kind : null;
}

/**
 * Oldest-first messages → day dividers + rows. A row continues the group when the same sender wrote within
 * 5 minutes on the same day; deleted and system rows stand alone. `newFrom` puts the New line above that message.
 */
export function buildItems(messages: readonly Message[], newFrom?: string | null): TimelineItem[] {
  const items: TimelineItem[] = [];
  let prev: Message | undefined;
  let prevDay = -1;
  let open: Extract<TimelineItem, { kind: 'message' }> | undefined;
  for (const m of messages) {
    const day = startOfDay(m.ts);
    const newDay = day.getTime() !== prevDay;
    if (newDay) {
      items.push({ kind: 'day', key: `day-${day.getTime()}`, day });
      prevDay = day.getTime();
    }
    const isNew = m.id === newFrom;
    if (isNew) items.push({ kind: 'new', key: 'new' });
    const head = newDay || isNew || !prev || quiet(prev) || quiet(m) || prev.sender.id !== m.sender.id || m.ts - prev.ts > groupWindowMs;
    const kind = groupKind(m);
    if (!head && kind && open && groupKind(open.message) === kind) {
      open.group = [...(open.group ?? [open.message]), m];
    } else {
      const item: Extract<TimelineItem, { kind: 'message' }> = { kind: 'message', key: m.id, message: m, head };
      items.push(item);
      open = kind ? item : undefined;
    }
    prev = m;
  }
  return items;
}

export type DayLabel = { key: 'today' | 'yesterday' } | { options: Intl.DateTimeFormatOptions };

export function dayLabel(day: Date, now: Date): DayLabel {
  const diff = Math.round((startOfDay(now.getTime()).getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return { key: 'today' };
  if (diff === 1) return { key: 'yesterday' };
  if (diff > 1 && diff < 7) return { options: { weekday: 'long' } };
  return {
    options: day.getFullYear() === now.getFullYear()
      ? { month: 'long', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric' },
  };
}

export type TextPart = { text: string; href?: string };

const urlPattern = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;
const trailing = /[.,;:!?'"\]]+$/;

function trimUrl(raw: string): string {
  let url = raw.replace(trailing, '');
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1).replace(trailing, '');
  }
  return url;
}

/** Splits plain text into text and http(s) link parts. */
export function linkify(body: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of body.matchAll(urlPattern)) {
    const url = trimUrl(match[0]);
    if (url.length <= url.indexOf('//') + 2) continue;
    const start = match.index;
    if (start > last) parts.push({ text: body.slice(last, start) });
    parts.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}
