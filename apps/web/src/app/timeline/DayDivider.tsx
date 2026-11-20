import { useTranslation } from 'react-i18next';
import { formatDate } from '../format';
import { dayLabel } from './items';
import s from './Timeline.module.css';

export function DayDivider({ day, now }: { day: Date; now: Date }) {
  const { t } = useTranslation();
  const label = dayLabel(day, now);
  const text = 'key' in label ? t(`timeline.${label.key}`) : formatDate(day, label.options);
  return (
    <div className={s.divider} role="separator" aria-label={text}>
      <span className={s.rule} />
      <span className={s.pill} aria-hidden="true">{text}</span>
      <span className={s.rule} />
    </div>
  );
}
