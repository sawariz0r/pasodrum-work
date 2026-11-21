import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { InvitePreview, Person, Session } from '../../matrix';
import { Avatar, avatarColor, Button, initialsOf, isCjk, isImeEnter, TextField } from '../../ui';
import type { Backend } from '../backend';
import { formatList } from '../format';
import { LogoMark } from '../icons';
import { AccountPair } from '../another/AccountPair';
import { elementXLink, hostOf, usePhone } from '../another/elementX';
import { OpenOutIcon } from '../another/icons';
import a from '../another/Another.module.css';
import { ArrowRightIcon, ChevronIcon, EnvelopeIcon, EyeIcon } from './icons';
import s from './Join.module.css';

/** The signed-in person, when someone already is (JoinWrongAccount). */
export type Current = { person: Person; avatar?: string };

type Claimed = { identifier: string; session?: Session };

/** "henrik.dahl@nordlys.no" → "Henrik Dahl": the name field starts from the email (RulesM4 → First run). */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

/** 0 (empty) … 4 (strong), as InviteLanding draws it. */
export function strength(password: string): 0 | 1 | 2 | 3 | 4 {
  const len = password.length;
  if (len === 0) return 0;
  if (len < 8) return 1;
  if (len < 12) return 2;
  return /[^A-Za-z0-9]/.test(password) || len >= 16 ? 4 : 3;
}

/** Server + username for Element X and other apps; never shown anywhere else. */
function accountFor(claimed: Claimed, server: string) {
  const m = claimed.session?.userId.match(/^@([^:]+):(.+)$/);
  return m ? { username: m[1]!, server: m[2]! } : { username: claimed.identifier, server: hostOf(server) };
}

function guardImeEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && !isImeEnter(e)) e.preventDefault();
}

export function JoinPage({
  backend,
  code,
  current,
  onSignOut,
  onJoined,
}: {
  backend: Backend;
  code: string;
  current?: Current;
  onSignOut?: () => void;
  onJoined: (session: Session, identifier: string, preview: InvitePreview) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview>();
  const [unknown, setUnknown] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'weak-password' | 'other'>();
  const [claimed, setClaimed] = useState<Claimed>();
  const [other, setOther] = useState(false);
  const phone = usePhone();

  useEffect(() => {
    let live = true;
    backend.previewInvite(code).then(
      (p) => {
        if (!live) return;
        setPreview(p);
        setName((n) => n || nameFromEmail(p.email));
      },
      () => live && setUnknown(true),
    );
    return () => {
      live = false;
    };
  }, [backend, code]);

  const view = !preview
    ? unknown
      ? 'unknown'
      : 'loading'
    : claimed
      ? 'done'
      : preview.state === 'open'
        ? current
          ? 'wrong'
          : 'join'
        : preview.state;
  const score = strength(password);
  const ok = name.trim().length > 0 && password.length >= 8;

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setFailed(undefined);
    try {
      const identifier = await backend.claimInvite(code, name.trim(), password);
      const session = await backend.signIn(backend.defaultServer(), identifier, password).catch(() => undefined);
      setClaimed({ identifier, session });
    } catch (err) {
      if (err instanceof Error && err.message === 'weak-password') return setFailed('weak-password');
      // A used or expired link (410) reads as that state; anything else is a plain failure.
      const fresh = await backend.previewInvite(code).catch(() => undefined);
      if (fresh) setPreview(fresh);
      if (!fresh || fresh.state === 'open') setFailed('other');
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    if (!claimed || !preview || busy) return;
    if (claimed.session) return onJoined(claimed.session, claimed.identifier, preview);
    setBusy(true);
    try {
      onJoined(await backend.signIn(backend.defaultServer(), claimed.identifier, password), claimed.identifier, preview);
    } catch {
      navigate('/signin');
    }
  }

  const title =
    view === 'join' || view === 'wrong'
      ? t('join.join', { name: preview!.spaceName })
      : view === 'done'
        ? t('join.done')
        : view === 'expired'
          ? t('join.expired')
          : view === 'used'
            ? t('join.used')
            : t('shell.notAvailable.title');
  const team = preview?.team.slice(0, 3) ?? [];
  const account = claimed && accountFor(claimed, backend.defaultServer());

  const email = preview && (
    <div className={s.email}>
      <EnvelopeIcon />
      <span>{preview.email}</span>
    </div>
  );

  return (
    <div className={s.page}>
      <header className={s.header}>
        <span className={s.logo}>
          <LogoMark size={17} />
        </span>
        <span className={s.wordmark}>
          {t('common.brand')} <span>{t('common.brandSuffix')}</span>
        </span>
      </header>

      <main className={s.main}>
        {view !== 'loading' && (
          <div key={view} className={s.card}>
            <div className={s.head}>
              {preview && (
                <span className={s.spaceTile} style={{ background: preview.spaceKind === 'workspace' ? '#0E7C66' : avatarColor(preview.spaceName) }}>
                  {(Array.from(preview.spaceName)[0] ?? '').toUpperCase()}
                </span>
              )}
              <div className={s.headText}>
                <h1 className={s.title}>{title}</h1>
                {team.length > 0 && (
                  <div className={s.team} role="img" aria-label={t('join.people', { names: formatList(team.map((p) => p.name)) })}>
                    {team.map((p) => {
                      const initials = initialsOf(p.name);
                      return (
                        <span key={p.id} className={[s.face, isCjk(initials) && s.cjk].filter(Boolean).join(' ')} style={{ background: avatarColor(p.id) }}>
                          {initials}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {view === 'join' && (
              <form className={s.body} onSubmit={join} noValidate>
                {email}
                <TextField
                  label={t('join.name')}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={guardImeEnter}
                />
                <div>
                  <input type="hidden" name="username" autoComplete="username" value={preview!.email} />
                  <TextField
                    label={t('join.password')}
                    type={shown ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFailed(undefined);
                    }}
                    onKeyDown={guardImeEnter}
                    trailing={
                      <button
                        type="button"
                        className={s.eye}
                        aria-label={t(shown ? 'join.hidePassword' : 'join.showPassword')}
                        aria-pressed={shown}
                        onClick={() => setShown(!shown)}
                      >
                        <EyeIcon />
                      </button>
                    }
                  />
                  <div className={s.meter} data-score={score} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                {failed && (
                  <p role="alert" className={s.alert}>
                    {t(failed === 'weak-password' ? 'join.weakPassword' : 'join.failed')}
                  </p>
                )}
                <Button type="submit" size="lg" block className={s.cta} disabled={!ok} aria-busy={busy || undefined}>
                  {t('join.joinButton')}
                </Button>
              </form>
            )}

            {view === 'done' && account && (
              <div className={[s.body, s.tight].join(' ')}>
                {phone ? (
                  <>
                    <a className={a.elementX} href={elementXLink(account.server)}>
                      {t('another.openElementX')}
                      <OpenOutIcon />
                    </a>
                    <AccountPair server={account.server} username={account.username} look="card" />
                  </>
                ) : (
                  <>
                    <Button size="lg" block className={s.cta} aria-busy={busy || undefined} onClick={() => void open()}>
                      {t('join.open')}
                      <ArrowRightIcon />
                    </Button>
                    <button type="button" className={s.toggle} aria-expanded={other} onClick={() => setOther(!other)}>
                      <ChevronIcon />
                      {t('another.title')}
                    </button>
                    {other && <AccountPair server={account.server} username={account.username} look="card" />}
                  </>
                )}
              </div>
            )}

            {view === 'used' && (
              <div className={s.body}>
                {email}
                <Button size="lg" block className={s.cta} onClick={() => navigate('/signin')}>
                  {t('join.signIn')}
                  <ArrowRightIcon />
                </Button>
              </div>
            )}

            {view === 'wrong' && current && (
              <div className={s.body}>
                {email}
                <Button size="lg" block className={s.cta} onClick={onSignOut}>
                  {t('join.signOutAndJoin')}
                </Button>
                <div className={s.rule} aria-hidden="true" />
                <button type="button" className={s.stay} onClick={() => navigate('/')}>
                  <Avatar name={current.person.name} color={avatarColor(current.person.id)} src={current.avatar} size={32} presence="active" className={s.stayAvatar} />
                  <span>{t('join.continueAs', { name: current.person.name })}</span>
                  <ArrowRightIcon className={s.stayArrow} />
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
