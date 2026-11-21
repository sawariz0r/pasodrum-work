// SIDE-03 (D-35, RulesM8): a team person gives an outside person back the history of their 1:1 DM.
// Confirm it's them (emoji, on a call: the person confirmation in SecurityProvider) → Share? → Sharing… → Shared / Couldn't share;
// blocked when this device isn't confirmed or they haven't set up again. Steps render in the one security card.
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type Confirmation, type Person, type WorkspaceStore } from '../../../matrix';
import { Button } from '../../../ui';
import { firstName } from '../../toast';
import { LaptopIcon } from '../../settings/icons';
import { PersonCheckIcon, PersonIcon } from '../icons';
import { Dots, FailTile, OkTile, Tile, type View } from '../parts';
import s from '../Security.module.css';

export type Share = {
  dmId: string;
  person: Person;
  /** 'verify': the person confirmation is running (`seen` once it has shown). */
  step: 'verify' | 'confirm' | 'sharing' | 'shared' | 'failed' | 'device' | 'notReady';
  seen?: boolean;
};

type SetShare = (next: Share | undefined | ((prev: Share | undefined) => Share | undefined)) => void;

/** Profile card → Share earlier messages: straight to the question when I've already confirmed them, else compare emoji first. */
export function startShare(store: WorkspaceStore, setShare: SetShare, dmId: string, person: Person) {
  if (store.getSnapshot().security.device !== 'confirmed') return setShare({ dmId, person, step: 'device' });
  const share: Share = { dmId, person, step: 'verify' };
  setShare(share);
  const ask = () => store.requestPersonConfirmation(person.id);
  store.personConfirmed(person.id).then((ok) => (ok ? setShare((x) => (x === share ? { ...share, step: 'confirm' } : x)) : ask()), ask);
}

/** The person confirmation that belongs to this share, if one is running. */
export function shareConfirmation(share: Share | undefined, c: Confirmation | undefined): Confirmation | undefined {
  return share?.step === 'verify' && c?.role === 'person' && c.person?.id === share.person.id ? c : undefined;
}

export function useShareView(share: Share | undefined, setShare: SetShare, c: Confirmation | undefined, store: WorkspaceStore, confirmDevice: () => void): View | undefined {
  const { t } = useTranslation();
  const mine = shareConfirmation(share, c);

  // Matched (store: 'done' only once they're confirmed) → the question; closed or failed without a match → the share ends.
  const phase = mine?.phase;
  useEffect(() => {
    if (share?.step !== 'verify') return;
    if (phase === 'done') setShare({ ...share, step: 'confirm' });
    else if (phase && !share.seen) setShare({ ...share, seen: true });
    else if (!phase && share.seen) setShare(undefined);
  }, [share, phase, setShare]);

  if (!share || share.step === 'verify') return undefined;
  const { dmId, person, step } = share;
  const name = firstName(person.name);
  const close = () => setShare(undefined);
  const run = () => {
    setShare({ ...share, step: 'sharing' });
    const at = (next: Share['step']) => setShare((x) => (x?.step === 'sharing' && x.person.id === person.id ? { ...x, step: next } : x));
    store.shareHistory(dmId, person.id).then(
      () => at('shared'),
      (err: unknown) => {
        const code = err instanceof Error ? err.message : '';
        if (code === 'not-confirmed') {
          // They reset since I confirmed them: compare emoji again.
          setShare((x) => (x?.step === 'sharing' ? { dmId, person, step: 'verify' } : x));
          store.requestPersonConfirmation(person.id);
        } else at(code === 'device-unconfirmed' ? 'device' : code === 'not-ready' ? 'notReady' : 'failed');
      },
    );
  };

  if (step === 'confirm' || step === 'sharing') {
    const busy = step === 'sharing';
    return {
      key: 'share-confirm',
      title: t('security.share.confirmTitle', { name }),
      closeable: !busy,
      alert: true,
      width: 440,
      onClose: close,
      body: (
        <div className={`${s.box} ${s.line}`}>
          <PersonCheckIcon className={s.mutedIcon} />
          <span>{t('security.share.confirmLine', { name })}</span>
        </div>
      ),
      footer: (
        <>
          <span className={s.spacer} />
          <Button variant="secondary" disabled={busy} onClick={close}>
            {t('security.cancel')}
          </Button>
          {busy ? (
            <Button aria-disabled="true" aria-busy="true" className={s.busyButton} icon={<Dots />}>
              {t('security.share.sharing')}
            </Button>
          ) : (
            <Button onClick={run}>{t('security.share.share')}</Button>
          )}
        </>
      ),
    };
  }

  const end = (key: string, title: string, tile: View['tile'], footer: View['footer'], alert = true): View => ({
    key: `share-${key}`,
    title,
    tile,
    closeable: true,
    alert,
    width: 400,
    onClose: close,
    body: <span />,
    footer: (
      <>
        <span className={s.spacer} />
        {footer}
      </>
    ),
  });
  const cancel = (
    <Button variant="secondary" onClick={close}>
      {t('security.cancel')}
    </Button>
  );

  switch (step) {
    case 'shared':
      return end(
        'shared',
        t('security.share.shared', { name }),
        <OkTile />,
        <>
          <Button variant="secondary" onClick={() => setShare({ ...share, step: 'confirm' })}>
            {t('security.share.again')}
          </Button>
          <Button onClick={close}>{t('security.share.done')}</Button>
        </>,
        false,
      );
    case 'failed':
      return end(
        'failed',
        t('security.share.failed'),
        <FailTile />,
        <>
          {cancel}
          <Button onClick={run}>{t('security.retry')}</Button>
        </>,
      );
    case 'device':
      return end(
        'device',
        t('security.share.notConfirmed'),
        <Tile>
          <LaptopIcon size={27} strokeWidth={1.9} />
        </Tile>,
        <>
          {cancel}
          <Button
            onClick={() => {
              close();
              confirmDevice();
            }}
          >
            {t('security.confirm')}
          </Button>
        </>,
      );
    case 'notReady':
      return end(
        'not-ready',
        t('security.share.notSetUp', { name }),
        <Tile>
          <PersonIcon />
        </Tile>,
        <Button onClick={close}>{t('security.share.ok')}</Button>,
      );
  }
}
