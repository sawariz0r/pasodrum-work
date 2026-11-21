import { useCallback, useState, type CSSProperties } from 'react';
import { formatDate } from '../../app/format';
import { useRegistry } from '../../app/RegistryProvider';
import { PersonAvatar } from '../../app/timeline/PersonAvatar';
import { useWorkspace, type Issue, type Person } from '../../matrix';
import { avatarColor, initialsOf } from '../../ui';
import { CalendarIcon, CommentIcon, PersonIcon } from './icons';
import { isLate, parseDay } from './model';
import s from './Boards.module.css';
import { useT } from './strings';

/** The 22px assignee tile on cards and rows; a dashed outline for no one. */
export function Who({ person }: { person?: Person }) {
  const t = useT();
  if (!person) {
    return (
      <span className={`${s.who} ${s.nobody}`} title={t('nobody')}>
        <PersonIcon size={12} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span title={person.name} style={{ display: 'flex' }}>
      <PersonAvatar person={person} size={22} />
    </span>
  );
}

/** A coloured square with initials, for sizes the Avatar primitive doesn't have (the 28px filter). */
export function faceStyle(person: Person): CSSProperties {
  return { '--face': avatarColor(person.id) } as CSSProperties;
}
export const faceText = (person: Person) => initialsOf(person.name);

export function useDueText() {
  const t = useT();
  return {
    short: (day: string) => formatDate(parseDay(day), { month: 'short', day: 'numeric' }),
    long: (day: string) => {
      const d = parseDay(day);
      return t('dueLong', { weekday: formatDate(d, { weekday: 'short' }), date: formatDate(d, { month: 'short', day: 'numeric' }) });
    },
  };
}

export function DueLabel({ issue, list }: { issue: Issue; list?: boolean }) {
  const due = useDueText();
  if (!issue.due) return null;
  return (
    <span className={[list ? s.rowCell : undefined, isLate(issue) && s.late].filter(Boolean).join(' ') || undefined}>
      <CalendarIcon />
      {due.short(issue.due)}
    </span>
  );
}

/** Replies on the issue's root, once the project room or the open thread has them. */
export function useCommentCount(projectId: string, issueId: string): number {
  return useWorkspace((x) => {
    const open = x.threadTimelines[issueId]?.messages;
    if (open?.length) return open.filter((m) => m.id !== issueId && m.kind !== 'deleted').length;
    return x.timelines[projectId]?.messages.find((m) => m.id === issueId)?.thread?.count ?? 0;
  });
}

export function Comments({ count, list }: { count: number; list?: boolean }) {
  if (!count) return null;
  return (
    <span className={list ? s.rowCell : undefined}>
      <CommentIcon />
      {count}
    </span>
  );
}

/** "Mon" for the last week, else the date. */
export function useWhen() {
  const t = useT();
  return (ts: number) => {
    const d = new Date(ts);
    const days = (Date.now() - ts) / 86_400_000;
    return days < 6 ? t(`day${d.getDay()}` as 'day0') : formatDate(d, { month: 'short', day: 'numeric' });
  };
}

export type Translator = NonNullable<ReturnType<NonNullable<ReturnType<typeof useRegistry>['translation']>['useTranslator']>>;

export function useTranslator(spaceId: string | undefined): Translator | null {
  const translation = useRegistry().translation;
  // The registry is fixed for the app's life, so this hook is either always called or never.
  return translation?.useTranslator(spaceId ?? '') ?? null;
}

/** One translatable text (a card title, an issue title or description). */
export function useTranslated(translator: Translator | null, id: string, body: string, html?: string) {
  const [state, setState] = useState<{ phase: 'original' | 'translating' | 'translated' | 'failed'; text?: string; html?: string; of?: string }>({ phase: 'original' });
  const offered = !!translator && !!body.trim() && translator.offers(body, html);
  const current = state.of === body ? state : { phase: 'original' as const };
  const run = useCallback(() => {
    if (!translator) return;
    setState({ phase: 'translating', of: body });
    translator.translate({ id, body, ...(html ? { html } : {}) }).then(
      (r) => setState({ phase: 'translated', of: body, ...r }),
      () => setState({ phase: 'failed', of: body }),
    );
  }, [translator, id, body, html]);
  const toggle = () => (current.phase === 'translated' ? setState({ phase: 'original' }) : run());
  return { offered, phase: current.phase, text: current.text, html: current.html, toggle, retry: run };
}
