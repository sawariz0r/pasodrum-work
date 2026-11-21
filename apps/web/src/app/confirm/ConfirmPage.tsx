import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfirmLink } from '../../matrix';
import { avatarColor, Button, initialsOf, isCjk } from '../../ui';
import type { Backend } from '../backend';
import { LogoMark } from '../icons';
import { timeIn, useCityName } from '../people/localTime';
import { ClockIcon, LaptopIcon, LaptopTickIcon, TickIcon } from './icons';
import s from './Confirm.module.css';

type View = 'loading' | 'ask' | 'ok' | 'expired' | 'helped' | 'unreachable';

/** EmailConfirmLink: ask → Confirmed, or This link no longer works; the help pill → {name} will help you. Phone-first, any device. */
export function ConfirmPage({ backend, code }: { backend: Backend; code: string }) {
  const { t } = useTranslation();
  const city = useCityName();
  const [link, setLink] = useState<ConfirmLink>();
  const [view, setView] = useState<View>('loading');
  const [busy, setBusy] = useState<'yes' | 'help'>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    backend.previewConfirm(code).then(
      (l) => {
        if (!live) return;
        setLink(l);
        setView(l.state === 'open' ? 'ask' : 'expired');
      },
      () => live && setView('unreachable'),
    );
    return () => {
      live = false;
    };
  }, [backend, code]);

  async function yes() {
    if (busy) return;
    setBusy('yes');
    setFailed(false);
    try {
      await backend.confirmDevice(code);
      setView('ok');
    } catch (err) {
      if (err instanceof Error && err.message === 'gone') setView('expired');
      else setFailed(true);
    } finally {
      setBusy(undefined);
    }
  }

  async function help() {
    if (busy) return;
    setBusy('help');
    setFailed(false);
    try {
      await backend.askForHelpByLink(code);
      setView('helped');
    } catch {
      setFailed(true);
    } finally {
      setBusy(undefined);
    }
  }

  const contact = link?.contact;
  const time = link?.requestedTs ? timeIn(link.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone, new Date(link.requestedTs)) : undefined;
  const place = link?.tz ? city(link.tz) : undefined;
  const when = time && (place ? t('security.link.when', { time, place }) : t('security.link.whenTime', { time }));

  const face = (big?: boolean) => {
    if (!contact) return null;
    const initials = initialsOf(contact);
    return (
      <span
        className={[big ? s.helper : s.pillFace, isCjk(initials) && s.cjk].filter(Boolean).join(' ')}
        style={{ '--face-bg': avatarColor(link?.contactId ?? contact) } as CSSProperties}
        aria-hidden="true"
      >
        {initials}
      </span>
    );
  };

  const pill = contact && (
    <button type="button" className={s.pill} aria-busy={busy === 'help' || undefined} onClick={() => void help()}>
      {face()}
      {t('security.email.askHelp', { name: contact })}
    </button>
  );
  const alert = failed && (
    <p role="alert" className={s.alert}>
      {t('security.failed')}
    </p>
  );

  return (
    <div className={s.page}>
      <header className={s.header}>
        <span className={s.logo}>
          <LogoMark size={16} />
        </span>
        <span className={s.wordmark}>
          {t('common.brand')} <span>{t('common.brandSuffix')}</span>
        </span>
      </header>

      <main className={s.main}>
        {view === 'ask' && (
          <div key={view} className={s.block}>
            <div className={s.tile}>
              <LaptopTickIcon />
            </div>
            <h1 className={s.title}>{t('security.link.askTitle')}</h1>
            {(link?.device || when) && (
              <div className={s.device}>
                <span className={s.deviceIcon}>
                  <LaptopIcon />
                </span>
                <span className={s.deviceText}>
                  {link?.device && <span className={s.deviceName}>{link.device}</span>}
                  {when && <span className={s.when}>{when}</span>}
                </span>
              </div>
            )}
            <Button size="lg" block className={s.yes} aria-busy={busy === 'yes' || undefined} onClick={() => void yes()}>
              {t('security.link.yes')}
            </Button>
            {pill}
            {alert}
          </div>
        )}

        {view === 'ok' && (
          <div key={view} className={s.block}>
            <div className={s.done}>
              <TickIcon />
            </div>
            <h1 className={s.title}>{t('security.link.okTitle')}</h1>
            {link?.device && <p className={s.line}>{t('security.link.okLine', { device: link.device })}</p>}
          </div>
        )}

        {view === 'expired' && (
          <div key={view} className={s.block}>
            <div className={`${s.tile} ${s.quiet}`}>
              <ClockIcon />
            </div>
            <h1 className={s.title}>{t('security.link.expTitle')}</h1>
            <p className={s.line}>{t('security.link.expLine')}</p>
            {pill && <div className={s.pillGap}>{pill}</div>}
            {alert}
          </div>
        )}

        {view === 'helped' && contact && (
          <div key={view} className={s.block}>
            {face(true)}
            <h1 className={s.title}>{t('security.email.helpedTitle', { name: contact })}</h1>
            <p className={s.line}>{t('security.email.helpedLine')}</p>
          </div>
        )}

        {view === 'unreachable' && (
          <div key={view} className={s.block}>
            <div className={`${s.tile} ${s.quiet}`}>
              <ClockIcon />
            </div>
            <h1 className={s.title}>{t('security.failed')}</h1>
          </div>
        )}
      </main>
    </div>
  );
}
