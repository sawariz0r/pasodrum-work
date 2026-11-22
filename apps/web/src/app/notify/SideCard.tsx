import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../../matrix';
import { platform } from '../../platform';
import { closeNotifyAsk, useNotifyAsk } from '../prefs';
import { BellIcon, SmallCloseIcon } from '../shell/icons';
import { dismissUpdate, restartUpdate, useRestarting, useUpdateCard } from './update';
import s from './SideCard.module.css';

/** The sidebar's bottom card, one at a time: Update ready (desktop), else the NotifyAsk card after the first send. */
export function SideCard() {
  const { t } = useTranslation();
  const update = useUpdateCard();
  const restarting = useRestarting();
  const ask = useNotifyAsk();
  const client = useWorkspace((x) => !Object.values(x.myRoles).some((r) => r !== 'client'));

  if (update)
    return (
      <Card
        icon={<UpdateIcon />}
        title={t('desktop.updateReady')}
        close={t('desktop.later')}
        onClose={dismissUpdate}
        action={restarting ? t('desktop.restarting') : t('desktop.restart')}
        busy={restarting}
        onAction={() => void restartUpdate()}
      />
    );
  if (ask && !client && platform.notifyPermission() === 'default')
    return (
      <Card
        icon={<BellIcon size={16} />}
        title={t('notify.title')}
        close={t('notify.notNow')}
        onClose={closeNotifyAsk}
        action={t('notify.turnOn')}
        onAction={() => {
          closeNotifyAsk();
          void platform.askNotify();
        }}
      />
    );
  return null;
}

function Card({ icon, title, close, onClose, action, busy = false, onAction }: { icon: ReactNode; title: string; close: string; onClose: () => void; action: string; busy?: boolean; onAction: () => void }) {
  return (
    <div role="region" aria-label={title} className={s.card}>
      <div className={s.head}>
        <span className={s.icon}>{icon}</span>
        <span className={s.title}>{title}</span>
        <button type="button" className={s.close} aria-label={close} onClick={onClose}>
          <SmallCloseIcon size={14} strokeWidth={2.2} />
        </button>
      </div>
      <button type="button" className={s.action} aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={busy ? undefined : onAction}>
        {busy && (
          <span className={s.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
        {action}
      </button>
    </div>
  );
}

function UpdateIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v8M8.5 12l3.5 3.5 3.5-3.5" />
    </svg>
  );
}
