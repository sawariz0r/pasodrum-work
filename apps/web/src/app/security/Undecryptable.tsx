import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../ui';
import { BubbleDashIcon } from './icons';
import s from './Security.module.css';

/** RulesM6: the shimmer shows for up to 10 s while a key can still come, then the quiet line. */
const arrivingMs = 10_000;

/** A message (or a run of `count` from one sender) this device can't open: one quiet line, no colour, no lock. */
export function Undecryptable({ count = 1, arriving = false, compact = false }: { count?: number; arriving?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!arriving) return;
    const timer = setTimeout(() => setWaited(true), arrivingMs);
    return () => clearTimeout(timer);
  }, [arriving]);
  if (arriving && !waited) {
    return (
      <div className={s.arriving} role="img" aria-label={t('security.arriving')}>
        <Skeleton width={compact ? 180 : '44%'} height={10} />
      </div>
    );
  }
  return (
    <div className={s.utd}>
      <BubbleDashIcon />
      <span className={s.utdText}>{count > 1 ? t('security.unavailableRun', { count }) : t('security.unavailable')}</span>
    </div>
  );
}
