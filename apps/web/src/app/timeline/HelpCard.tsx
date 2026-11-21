import { useTranslation } from 'react-i18next';
import type { HelpCard, Message } from '../../matrix';
import { formatTime } from '../format';
import { Face, SystemFace } from '../people/Face';
import { useProfileCard } from '../people/ProfileCardContext';
import { firstName } from '../toast';
import s from './Timeline.module.css';
import h from './HelpCard.module.css';

/** EmailConfirmStaff (D-38): a client or External asked for help; from the system sender, read-only, so no actions. */
export function HelpRow({ m, help, head }: { m: Message; help: HelpCard; head: boolean }) {
  const { t } = useTranslation();
  const profile = useProfileCard();
  const { who, spaceName, reason, email, localTime } = help;
  const date = new Date(m.ts);
  const time = <time dateTime={date.toISOString()}>{formatTime(date)}</time>;
  const meta = [spaceName, email, localTime && t('security.helpCard.localTime', { time: localTime })].filter(Boolean).join(' · ');
  return (
    <div className={`${s.row} ${head ? s.head : s.cont}`} data-message-id={m.id} data-ids={m.id}>
      <div className={s.gutter}>{head ? <SystemFace size={36} className={h.sender} /> : <span className={s.hoverTime}>{time}</span>}</div>
      <div className={s.main}>
        {head && (
          <div className={s.meta}>
            <span className={h.name}>{m.sender.name}</span>
            <span className={s.time}>{time}</span>
          </div>
        )}
        <div className={h.card}>
          <div className={h.who}>
            <Face person={who} size={32} className={h.face} />
            <span className={h.needs}>{t('security.helpCard.needs', { name: who.name })}</span>
          </div>
          <div className={h.reason}>{t(`security.helpCard.reason.${reason}`)}</div>
          <div className={h.facts}>{meta}</div>
          <div className={h.actions}>
            <a className={h.email} href={`mailto:${email}`}>
              {t('security.helpCard.email', { name: firstName(who.name) })}
            </a>
            <button type="button" className={h.profile} aria-haspopup="dialog" onClick={(e) => profile.open(who.id, e.currentTarget)}>
              {t('security.helpCard.profile')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
