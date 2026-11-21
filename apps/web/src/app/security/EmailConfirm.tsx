// D-38: clients and Externals confirm a new device by email (EmailConfirm board): gate, sent, done, help, helped.
// Where the conversation would be, like the M6 gate. Never a recovery key, no warning colours.
import { useEffect, useState, type CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type HelpReason, type Person } from '../../matrix';
import { avatarColor, initialsOf, isCjk } from '../../ui';
import { useMediaUrl } from '../timeline/Media';
import { ChevronIcon, DevicesIcon, DoneIcon, LaptopCheckIcon, MailIcon, SendIcon } from './icons';
import { useSecurityUi } from './SecurityProvider';
import gate from './Security.module.css';
import s from './EmailConfirm.module.css';

export type EmailScreen = 'gate' | 'sent' | 'done' | 'noLink' | 'help' | 'helped';

export type EmailConfirmViewProps = {
  screen: EmailScreen;
  email: string;
  /** Who "Need help? Ask …" names; absent = no pill and no ask row. */
  contact?: Person;
  otherDevice: boolean;
  /** Send it again waits for canResendAt. */
  canResend: boolean;
  /** Ask for help is on its way. */
  asking: boolean;
  /** The last action failed (can't reach the server). */
  failed: boolean;
  onEmail(): void;
  onDevice(): void;
  onHelp(reason: HelpReason): void;
  onDidntGet(): void;
  onBack(): void;
  onStartFresh(): void;
};

type FaceSize = 28 | 36 | 64;

function ContactFace({ person, size }: { person: Person; size: FaceSize }) {
  const initials = initialsOf(person.name);
  const src = useMediaUrl(person.avatarUrl, true);
  return (
    <span
      className={[s.face, s[`face${size}`], isCjk(initials) && s.cjk].filter(Boolean).join(' ')}
      style={{ '--face-bg': avatarColor(person.id) } as CSSProperties}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : initials}
    </span>
  );
}

export function EmailConfirmView(p: EmailConfirmViewProps) {
  const { t } = useTranslation();
  const name = p.contact?.name ?? '';
  const pill = (reason: HelpReason) =>
    p.contact && (
      <button type="button" className={s.pill} aria-busy={p.asking || undefined} onClick={() => !p.asking && p.onHelp(reason)}>
        <ContactFace person={p.contact} size={28} />
        {t('security.email.askHelp', { name })}
      </button>
    );
  const failLine = p.failed && (
    <p role="alert" className={s.failed}>
      {t('security.failed')}
    </p>
  );

  switch (p.screen) {
    case 'gate':
      return (
        <div key="gate" className={s.card} role="group" aria-labelledby="email-confirm-title">
          <span className={s.tile}>
            <LaptopCheckIcon />
          </span>
          <h2 id="email-confirm-title" className={s.title}>
            {t('security.email.title')}
          </h2>
          <p className={s.line}>{t('security.email.line')}</p>
          <button type="button" className={s.primary} onClick={p.onEmail}>
            <MailIcon />
            {t('security.email.emailMe')}
          </button>
          {p.otherDevice && (
            <button type="button" className={s.secondary} onClick={p.onDevice}>
              <DevicesIcon />
              {t('security.email.useDevice')}
            </button>
          )}
          {failLine}
          {pill('stuck')}
        </div>
      );
    case 'sent':
      return (
        <div key="sent" className={s.card} role="group" aria-labelledby="email-confirm-sent">
          <span className={s.tile}>
            <MailIcon size={30} strokeWidth={1.8} />
          </span>
          <h2 id="email-confirm-sent" className={s.title}>
            {t('security.email.sentTitle')}
          </h2>
          <p className={s.line}>
            <Trans i18nKey="security.email.sentLine" values={{ email: p.email }} components={{ b: <b className={s.email} /> }} />
          </p>
          <span role="status" aria-label={t('security.email.waiting')} className={s.dots}>
            <span />
            <span />
            <span />
          </span>
          <button type="button" className={`${s.text} ${s.didntGet}`} onClick={p.onDidntGet}>
            {t('security.email.didntGet')}
          </button>
          {failLine}
          <span className={s.pillAfterText}>{pill('email-missing')}</span>
        </div>
      );
    case 'done':
      return (
        <div key="done" className={s.card} role="status">
          <span className={`${s.tile} ${s.tileDone}`}>
            <DoneIcon />
          </span>
          <h2 className={s.title}>{t('security.email.doneTitle')}</h2>
        </div>
      );
    case 'noLink':
    case 'help': {
      const noLink = p.screen === 'noLink';
      return (
        <div key="help" className={`${s.card} ${s.wide}`} role="group" aria-labelledby="email-confirm-help">
          <span className={`${s.tile} ${s.tileWell}`}>
            <MailIcon size={30} strokeWidth={1.8} />
          </span>
          <h2 id="email-confirm-help" className={s.title}>
            {t(noLink ? 'security.email.noLinkTitle' : 'security.email.helpTitle')}
          </h2>
          {!noLink && (
            <>
              <p className={s.line}>{t('security.email.helpLine')}</p>
              <button type="button" className={s.primary} disabled={!p.canResend} onClick={p.onEmail}>
                <SendIcon />
                {t('security.email.sendAgain')}
              </button>
            </>
          )}
          {!noLink && failLine}
          {p.contact && (
            <div className={noLink ? `${s.more} ${s.bare}` : s.more}>
              {!noLink && <div className={s.moreTitle}>{t('security.email.stillNothing')}</div>}
              <button type="button" className={s.row} aria-busy={p.asking || undefined} onClick={() => !p.asking && p.onHelp('email-missing')}>
                <ContactFace person={p.contact} size={36} />
                <span className={s.rowLabel}>{t('security.email.askHelpBig', { name })}</span>
                <span className={s.rowChevron}>
                  <ChevronIcon strokeWidth={2} />
                </span>
              </button>
            </div>
          )}
          {noLink && failLine}
          <div className={s.actions}>
            <button type="button" className={s.text} onClick={p.onBack}>
              {t('security.email.back')}
            </button>
            <button type="button" className={s.text} onClick={p.onStartFresh}>
              {t('security.email.startFresh')}
            </button>
          </div>
        </div>
      );
    }
    case 'helped':
      return (
        <div key="helped" className={s.card} role="status">
          {p.contact && <ContactFace person={p.contact} size={64} />}
          <h2 className={s.title}>{t('security.email.helpedTitle', { name })}</h2>
          <p className={s.line}>{t('security.email.helpedLine')}</p>
          <button type="button" className={`${s.text} ${s.back}`} onClick={p.onBack}>
            {t('security.email.back')}
          </button>
        </div>
      );
  }
}

/** Failures that land on the Didn't-get-the-email card (lead override 2: 'no-key' asks the contact or starts fresh). */
const toHelp = new Set(['no-key', 'wrong-key', 'rate-limited']);

/**
 * The connected screen: the step follows `security.emailConfirm`, except where the client went themselves
 * ('gate' after Back, 'help', 'helped'). `done` is held by SecurityProvider for 1.2 s after the device is confirmed.
 */
export function EmailConfirm({ done }: { done: boolean }) {
  const store = useStore();
  const ui = useSecurityUi();
  const ec = useWorkspace((x) => x.security.emailConfirm);
  const contact = useWorkspace((x) => x.security.helpContact);
  const others = useWorkspace((x) => x.security.otherConfirmedDevices);
  const [view, setView] = useState<'auto' | 'gate' | 'help' | 'helped'>('auto');
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const phase = ec?.phase ?? 'idle';

  // A new email on its way: back to following the phase (Check your email).
  const [lastPhase, setLastPhase] = useState(phase);
  if (lastPhase !== phase) {
    setLastPhase(phase);
    if (phase === 'sending' || phase === 'sent') setView('auto');
    if (phase === 'failed') setFailed(!toHelp.has(ec?.error ?? ''));
  }

  // Send it again: at most once a minute.
  const resendAt = ec?.canResendAt ?? 0;
  useEffect(() => {
    if (resendAt <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), resendAt - now + 50);
    return () => clearTimeout(timer);
  }, [resendAt, now]);

  const error = ec?.error ?? '';
  const auto: EmailScreen =
    phase === 'sending' || phase === 'sent'
      ? 'sent'
      : phase !== 'failed'
        ? 'gate'
        : error === 'no-key' || error === 'wrong-key'
          ? 'noLink'
          : error === 'rate-limited'
            ? 'help'
            : 'gate';
  const screen: EmailScreen = done || phase === 'confirmed' ? 'done' : view === 'auto' ? auto : view;

  const email = () => {
    setFailed(false);
    setView('auto');
    setNow(Date.now());
    // Progress and failures arrive in security.emailConfirm.
    store.requestConfirmEmail().catch(() => {});
  };
  const help = (reason: HelpReason) => {
    setAsking(true);
    setFailed(false);
    store.askForHelp(reason).then(
      () => {
        setAsking(false);
        setView('helped');
      },
      () => {
        setAsking(false);
        setFailed(true);
      },
    );
  };
  const back = () => {
    setFailed(false);
    setView(phase === 'sending' || phase === 'sent' ? 'auto' : 'gate');
  };

  return (
    <div className={gate.gate}>
      <EmailConfirmView
        screen={screen}
        email={ec?.email ?? ''}
        contact={contact}
        otherDevice={others > 0}
        canResend={resendAt <= now && phase !== 'sending'}
        asking={asking}
        failed={failed}
        onEmail={email}
        onDevice={ui.askDevice}
        onHelp={help}
        onDidntGet={() => {
          setFailed(false);
          setView('help');
        }}
        onBack={back}
        onStartFresh={ui.reset}
      />
    </div>
  );
}
