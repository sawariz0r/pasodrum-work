import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspace, type WorkspaceSnapshot } from '../../matrix';
import { AlertIcon } from '../../ui/icons';
import { ChevronIcon, DevicesIcon, KeyIcon, LaptopCheckIcon } from './icons';
import { useSecurityUi } from './SecurityProvider';
import s from './Security.module.css';

/** An encrypted conversation (every DM, private channels; D-11). Public and client-space channels never are. */
function encrypted(snap: WorkspaceSnapshot, channelId: string): boolean {
  if (snap.dms.some((d) => d.id === channelId && d.encrypted)) return true;
  return Object.values(snap.channels).some((list) => list.some((c) => c.id === channelId && c.encrypted));
}

/**
 * What an encrypted conversation shows instead of itself (RulesM6):
 * 'gate' = this device must be confirmed first (a card, not a page of quiet rows); 'wait' = crypto is still starting;
 * 'key' = the account's recovery key isn't saved yet, so nothing may be sent (backup before the first private message);
 * 'open' = show it.
 */
export function useGate(channelId: string): 'gate' | 'wait' | 'key' | 'open' {
  const { firstKey } = useSecurityUi();
  return useWorkspace((snap) => {
    if (!encrypted(snap, channelId)) return 'open';
    const { device, needsRecoveryKey } = snap.security;
    if (device === 'unconfirmed') return 'gate';
    if (device === 'starting' || device === 'elsewhere') return 'wait';
    return needsRecoveryKey || firstKey !== 'idle' ? 'key' : 'open';
  });
}

/** Text from an encrypted conversation can't be shown on a device that isn't confirmed (or is still starting). */
export function useHiddenText(channelId: string): boolean {
  return useWorkspace((snap) => snap.security.device !== 'confirmed' && encrypted(snap, channelId));
}

/** The gate's card frame: tile, title, then the options. */
function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className={s.gate}>
      <div className={s.gateCard} role="group" aria-labelledby="confirm-gate-title">
        <span className={s.gateTile}>{icon}</span>
        <h2 id="confirm-gate-title" className={s.gateTitle}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function Option({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className={s.gateOption} onClick={onClick}>
      <span className={s.gateIcon}>{icon}</span>
      <span className={s.gateLabel}>{label}</span>
      <span className={s.gateChevron}>
        <ChevronIcon />
      </span>
    </button>
  );
}

/** ConfirmGate / ConfirmGateNoDevice: in place of the timeline and composer. */
export function ConfirmGate() {
  const { t } = useTranslation();
  const ui = useSecurityUi();
  const others = useWorkspace((x) => x.security.otherConfirmedDevices);
  return (
    <Card icon={<LaptopCheckIcon />} title={t('security.gateTitle')}>
      <div className={s.gateOptions}>
        {others > 0 && <Option icon={<DevicesIcon />} label={t('security.useDevice')} onClick={ui.askDevice} />}
        <Option icon={<KeyIcon />} label={t('security.useKey')} onClick={ui.enterKey} />
      </div>
      <button type="button" className={s.cantConfirm} onClick={ui.reset}>
        {t('security.cantConfirm')}
      </button>
    </Card>
  );
}

/**
 * In place of an encrypted conversation until the account's first recovery key is saved. Opening one starts it
 * (RecoveryKeySave over this card); after Cancel on the password step the card offers it again; a failure shows Retry.
 */
export function KeyGate() {
  const { t } = useTranslation();
  const ui = useSecurityUi();
  const { ensureKey, firstKey } = ui;
  // Each conversation opened asks again, unless it's already showing or being made.
  useEffect(() => {
    if (firstKey === 'idle' || firstKey === 'stopped') ensureKey();
    // Only when this conversation opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card icon={<KeyIcon size={30} strokeWidth={1.8} />} title={t('security.saveTitle')}>
      {firstKey === 'failed' ? (
        <p role="alert" className={s.gateError}>
          <AlertIcon size={16} strokeWidth={2.2} />
          <span>{t('security.keyFailed')}</span>
          <button type="button" className={s.retry} onClick={ensureKey}>
            {t('security.retry')}
          </button>
        </p>
      ) : (
        <div className={s.gateOptions}>
          <Option icon={<KeyIcon />} label={t('security.saveKey')} onClick={ensureKey} />
        </div>
      )}
    </Card>
  );
}
