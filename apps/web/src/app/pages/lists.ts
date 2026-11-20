import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatTime } from '../format';

/**
 * Keeps the order a list had when the view opened (D-23: lists don't jump while open).
 * New items go on top; items that leave drop out.
 */
export function useStableOrder<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const [order, setOrder] = useState<string[]>(() => items.map(keyOf));
  const byKey = new Map(items.map((x) => [keyOf(x), x]));
  const fresh = items.filter((x) => !order.includes(keyOf(x))).map(keyOf);
  const kept = order.filter((k) => byKey.has(k));
  if (fresh.length || kept.length !== order.length) setOrder([...fresh, ...kept]);
  return [...fresh, ...kept].map((k) => byKey.get(k)!);
}

const DAY = 86_400_000;

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** List times as the boards show them: 09:31 today, Yesterday, Monday this week, else a date. */
export function useListTime(): (ts: number) => string {
  const { t } = useTranslation();
  return (ts) => {
    const days = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
    if (days <= 0) return formatTime(new Date(ts));
    if (days === 1) return t('timeline.yesterday');
    if (days < 7) return formatDate(new Date(ts), { weekday: 'long' });
    return formatDate(new Date(ts), { month: 'short', day: 'numeric' });
  };
}
