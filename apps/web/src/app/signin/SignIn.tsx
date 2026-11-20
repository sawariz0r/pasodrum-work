import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SignInError, type Session } from '../../matrix';
import { Button, initialsOf, isCjk, isImeEnter, TextField } from '../../ui';
import type { Backend } from '../backend';
import { ChevronDownIcon, ChevronRightIcon, CloudOffIcon, LogoMark } from '../icons';
import s from './SignIn.module.css';

export type Expired = { identifier: string; baseUrl: string };

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Implicit form submission must not fire on the Enter that commits an IME composition. */
function guardImeEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && !isImeEnter(e)) e.preventDefault();
}

export function SignIn({
  backend,
  expired,
  onSignedIn,
}: {
  backend: Backend;
  expired?: Expired;
  onSignedIn: (session: Session, identifier: string) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'email' | 'password'>(expired?.identifier ? 'password' : 'email');
  const [signedOut, setSignedOut] = useState(!!expired?.identifier);
  const [identifier, setIdentifier] = useState(expired?.identifier ?? '');
  const [password, setPassword] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(() => hostOf(backend.defaultServer()));
  const [baseUrl, setBaseUrl] = useState(expired?.baseUrl ?? '');
  const [invalid, setInvalid] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  const id = identifier.trim();
  const target = showServer ? server.trim() : hostOf(backend.defaultServer());

  async function next(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!id || (id.includes('@') && !emailRe.test(id))) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    try {
      setBaseUrl(await backend.resolveServer(showServer ? server.trim() : backend.defaultServer()));
      setServerDown(false);
      setStep('password');
    } catch {
      setServerDown(true);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    try {
      const session = await backend.signIn(baseUrl, id, password);
      onSignedIn(session, id);
    } catch (err) {
      setBusy(false);
      if (err instanceof SignInError && err.reason === 'wrong-password') {
        setWrong(true);
      } else {
        setServerDown(true);
        setStep('email');
      }
    }
  }

  function change() {
    setStep('email');
    setPassword('');
    setWrong(false);
    setSignedOut(false);
  }

  const initial = (Array.from(id)[0] ?? '').toUpperCase();
  const sample = [
    { name: t('signIn.sample.firstName'), time: t('signIn.sample.firstTime'), text: t('signIn.sample.firstText'), color: '#1D4ED8' },
    { name: t('signIn.sample.secondName'), time: t('signIn.sample.secondTime'), text: t('signIn.sample.secondText'), color: '#C2410C' },
  ];

  return (
    <div className={s.page}>
      <section aria-label={t('signIn.about')} className={s.about}>
        <div className={s.brand}>
          <span className={s.logo}>
            <LogoMark size={19} />
          </span>
          <span className={s.wordmark}>
            {t('common.brand')} <span>{t('common.brandSuffix')}</span>
          </span>
        </div>
        <div className={s.aboutBody}>
          <div aria-hidden="true" className={s.sample}>
            {sample.map((m) => {
              const initials = initialsOf(m.name);
              return (
                <div key={m.name} className={s.sampleRow}>
                  <span className={[s.sampleAvatar, isCjk(initials) && s.cjk].filter(Boolean).join(' ')} style={{ background: m.color }}>
                    {initials}
                  </span>
                  <span className={s.sampleText}>
                    <strong>{m.name}</strong>
                    <time>{m.time}</time>
                    <br />
                    {m.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <main className={s.formSide}>
        <div className={s.center}>
          {step === 'email' ? (
            <form className={s.form} onSubmit={next} noValidate>
              <h1 className={s.title}>{t('signIn.title')}</h1>
              <TextField
                className={s.field}
                label={t('signIn.workEmail')}
                type="email"
                autoComplete="username"
                autoFocus
                placeholder={t('signIn.emailPlaceholder')}
                value={identifier}
                error={invalid ? t('signIn.emailError') : undefined}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setInvalid(false);
                }}
                onKeyDown={guardImeEnter}
              />
              {showServer && (
                <TextField
                  className={s.field}
                  label={t('signIn.serverAddress')}
                  autoComplete="url"
                  spellCheck={false}
                  value={server}
                  onChange={(e) => {
                    setServer(e.target.value);
                    setServerDown(false);
                  }}
                  onKeyDown={guardImeEnter}
                />
              )}
              {serverDown && (
                <div role="alert" className={s.alert}>
                  <CloudOffIcon />
                  <span>{t('signIn.cantReach', { server: target })}</span>
                  <button type="button" className={s.alertAction} onClick={() => void next()}>
                    {t('signIn.tryAgain')}
                  </button>
                </div>
              )}
              <Button type="submit" size="lg" block className={s.submit} aria-busy={busy || undefined}>
                {t('signIn.continue')}
              </Button>
              <button type="button" className={s.toggle} aria-expanded={showServer} onClick={() => setShowServer(!showServer)}>
                {showServer ? <ChevronDownIcon /> : <ChevronRightIcon />}
                {t('signIn.otherServer')}
              </button>
            </form>
          ) : (
            <form className={s.form} onSubmit={submit}>
              <h1 className={[s.title, s.titlePassword].join(' ')}>{t(signedOut ? 'signIn.signedOut' : 'signIn.title')}</h1>
              <div className={s.who}>
                <span className={s.whoInitial}>{initial}</span>
                <span className={s.whoName}>{id}</span>
                <button type="button" className={s.link} onClick={change}>
                  {t('signIn.change')}
                </button>
              </div>
              <input type="hidden" name="username" autoComplete="username" value={id} />
              <TextField
                label={t('signIn.password')}
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                error={wrong ? t('signIn.wrongPassword') : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setWrong(false);
                }}
                onKeyDown={guardImeEnter}
              />
              <Button type="submit" size="lg" block className={s.submit} aria-busy={busy || undefined}>
                {t('signIn.title')}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
