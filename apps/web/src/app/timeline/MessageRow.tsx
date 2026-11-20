import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../matrix';
import { Avatar, avatarColor } from '../../ui';
import { AlertIcon } from '../../ui/icons';
import { formatTime } from '../format';
import { linkify } from './items';
import s from './Timeline.module.css';

type Props = {
  message: Message;
  head: boolean;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
};

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function Body({ text }: { text: string }) {
  return linkify(text).map((p, i) =>
    p.href ? (
      <a key={i} className={s.link} href={p.href} target="_blank" rel="noopener noreferrer">
        {p.text}
      </a>
    ) : (
      p.text
    ),
  );
}

export const MessageRow = memo(function MessageRow({ message: m, head, onRetry, onDiscard }: Props) {
  const { t } = useTranslation();
  const sending = m.status === 'sending';
  const failed = m.status === 'failed';
  const date = new Date(m.ts);
  const time = (
    <time dateTime={date.toISOString()}>{formatTime(date)}</time>
  );

  return (
    <div className={`${s.row} ${head ? s.head : s.cont}`} data-message-id={m.id}>
      <div className={s.gutter}>
        {head ? (
          <Avatar className={s.avatar} name={m.sender.name} color={avatarColor(m.sender.id)} src={m.sender.avatarUrl} />
        ) : (
          !sending && <span className={s.hoverTime}>{time}</span>
        )}
      </div>
      <div className={s.main}>
        {head && (
          <div className={s.meta}>
            <span className={s.name}>{m.sender.name}</span>
            {sending ? (
              <span role="img" aria-label={t('timeline.sending')} className={s.sending}>
                <ClockIcon />
              </span>
            ) : (
              <span className={s.time}>{time}</span>
            )}
          </div>
        )}
        <div className={`${s.body} ${sending ? s.dim : ''}`}>
          <Body text={m.body} />
        </div>
        {failed && (
          <div role="alert" className={s.failed}>
            <AlertIcon className={s.failedIcon} size={15} strokeWidth={2.2} />
            <span className={s.notSent}>{t('timeline.notSent')}</span>
            <span aria-hidden="true" className={s.dot} />
            <button type="button" className={s.retry} onClick={() => onRetry(m.id)}>
              {t('timeline.retry')}
            </button>
            <span aria-hidden="true" className={s.dot} />
            <button type="button" className={s.discard} onClick={() => onDiscard(m.id)}>
              {t('timeline.delete')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
