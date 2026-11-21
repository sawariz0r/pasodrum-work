// Assignee picker (BoardsAssignee) and due date picker (BoardsDue): small popovers under a chip or a panel field.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { formatDate } from '../../app/format';
import { isImeEnter } from '../../ui';
import type { Person } from '../../matrix';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { dayOf, parseDay, today } from './model';
import { Who } from './parts';
import s from './Boards.module.css';
import { useT } from './strings';

function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const down = (e: PointerEvent) => {
      // The chip or field that opened it toggles it itself (marked data-picker).
      const target = e.target as Element;
      if (ref.current?.contains(target) || target.closest?.('[data-picker]')) return;
      close.current();
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.stopPropagation();
      e.preventDefault();
      close.current();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
    };
  }, []);
  return ref;
}

type AssigneeProps = { people?: Person[]; value?: string; onPick: (id: string | null) => void; onClose: () => void; style?: CSSProperties };

export function AssigneePicker({ people, value, onPick, onClose, style }: AssigneeProps) {
  const t = useT();
  const ref = useDismiss(onClose);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = (people ?? []).filter((p) => !query || p.name.toLowerCase().includes(query));
  const pick = (id: string | null) => {
    onPick(id);
    onClose();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isImeEnter(e)) return;
    e.preventDefault();
    if (shown[0]) pick(shown[0].id);
  };
  return (
    <div ref={ref} className={s.popover} style={{ width: 260, ...style }}>
      <input className={`${s.field} ${s.search}`} placeholder={t('assignTo')} aria-label={t('assignTo')} value={q} autoFocus onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} />
      <div role="listbox" aria-label={t('assignee')} className={s.options}>
        {!query && (
          <button type="button" role="option" aria-selected={!value} className={[s.opt, !value && s.optActive].filter(Boolean).join(' ')} onClick={() => pick(null)}>
            <Who />
            <span>{t('nobody')}</span>
            {!value && (
              <span className={s.optCheck}>
                <CheckIcon />
              </span>
            )}
          </button>
        )}
        {shown.map((p) => (
          <button key={p.id} type="button" role="option" aria-selected={p.id === value} className={[s.opt, p.id === value && s.optActive].filter(Boolean).join(' ')} onClick={() => pick(p.id)}>
            <Who person={p} />
            <span>{p.name}</span>
            {p.id === value && (
              <span className={s.optCheck}>
                <CheckIcon />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

type DueProps = { value?: string; onPick: (day: string | null) => void; onClose: () => void; style?: CSSProperties };

const addDays = (day: string, n: number) => {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
};

export function DuePicker({ value, onPick, onClose, style }: DueProps) {
  const t = useT();
  const ref = useDismiss(onClose);
  const now = today();
  const [month, setMonth] = useState(() => {
    const d = parseDay(value ?? now);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const pick = (day: string | null) => {
    onPick(day);
    onClose();
  };
  const lead = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const weekdays = ['wd0', 'wd1', 'wd2', 'wd3', 'wd4', 'wd5', 'wd6'] as const;

  return (
    <div ref={ref} role="dialog" aria-label={t('due')} className={`${s.popover} ${s.due}`} style={style}>
      <div className={s.quickDays}>
        <button type="button" className={s.chip} onClick={() => pick(now)}>
          {t('today')}
        </button>
        <button type="button" className={s.chip} onClick={() => pick(addDays(now, 1))}>
          {t('tomorrow')}
        </button>
        <button type="button" className={s.chip} onClick={() => pick(addDays(now, 7))}>
          {t('nextWeek')}
        </button>
      </div>
      <div className={s.month}>
        <span>{formatDate(month, { month: 'long', year: 'numeric' })}</span>
        <span className={s.monthNav}>
          <button type="button" aria-label={t('prevMonth')} onClick={() => shift(-1)}>
            <ChevronLeftIcon />
          </button>
          <button type="button" aria-label={t('nextMonth')} onClick={() => shift(1)}>
            <ChevronRightIcon />
          </button>
        </span>
      </div>
      <div className={s.days}>
        {weekdays.map((w) => (
          <span key={w} className={s.wd}>
            {t(w)}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = dayOf(new Date(month.getFullYear(), month.getMonth(), i + 1));
          return (
            <button
              key={day}
              type="button"
              className={[s.day, day < now && s.dayPast, day === now && s.dayToday].filter(Boolean).join(' ')}
              aria-pressed={day === value}
              aria-current={day === now ? 'date' : undefined}
              aria-label={formatDate(parseDay(day), { dateStyle: 'long' })}
              onClick={() => pick(day)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className={s.dueFoot}>
        <button type="button" className={s.textLink} onClick={() => pick(null)}>
          {t('noDue')}
        </button>
      </div>
    </div>
  );
}
