import type { Message } from '../../matrix';

const groupWindowMs = 5 * 60_000;

export type TimelineItem =
  | { kind: 'day'; key: string; day: Date }
  | { kind: 'message'; key: string; message: Message; head: boolean };

function startOfDay(ts: number): Date {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Oldest-first messages → day dividers + rows; a row continues the group when the same sender wrote within 5 minutes on the same day. */
export function buildItems(messages: readonly Message[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let prev: Message | undefined;
  let prevDay = -1;
  for (const m of messages) {
    const day = startOfDay(m.ts);
    const newDay = day.getTime() !== prevDay;
    if (newDay) {
      items.push({ kind: 'day', key: `day-${day.getTime()}`, day });
      prevDay = day.getTime();
    }
    const head = newDay || !prev || prev.sender.id !== m.sender.id || m.ts - prev.ts > groupWindowMs;
    items.push({ kind: 'message', key: m.id, message: m, head });
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
