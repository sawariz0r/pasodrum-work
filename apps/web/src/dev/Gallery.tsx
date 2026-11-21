import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { ConfirmPage } from '../app/confirm/ConfirmPage';
import { EmailConfirmView, type EmailConfirmViewProps, type EmailScreen } from '../app/security/EmailConfirm';
import gateStyles from '../app/security/Security.module.css';
import { createFakeStore } from '../app/testing/fakeStore';
import { createFakeBackend } from './fakeBackend';
import { WorkspaceProvider } from '../matrix';
import {
  AttentionDot,
  Avatar,
  avatarColor,
  Badge,
  Banner,
  Button,
  Dialog,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuSegments,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
  TextField,
} from '../ui';
import s from './Gallery.module.css';

type Theme = 'light' | 'dark';
type Lang = 'en' | 'ja';

const T = {
  en: {
    addN: 'Add 2 people', cancel: 'Cancel', copyLink: 'Copy invite link', signIn: 'Sign in', openHome: 'Open #general',
    workEmail: 'Work email', password: 'Password', forgot: 'Forgot password?', wrong: 'Wrong password', newPassword: 'New password', show: 'Show password',
    offline: 'Offline', reconnecting: 'Reconnecting', tryNow: 'Try now', restored: 'Back online',
    language: 'Language', signOut: 'Sign out', profile: 'Your profile: Sam Okafor, active',
    addTo: 'Add people to #design-studio', close: 'Close', add: 'Add', newMessage: 'New message', addChannel: 'Add a channel', bold: 'Bold', more: 'More',
    people: ['Ingrid Holm', 'Maja Lind', 'Jonas Berg', 'Sam Okafor'],
    body: 'One line of copy, one clear action, no illustrations.',
  },
  ja: {
    addN: '2 人を追加', cancel: 'キャンセル', copyLink: '招待リンクをコピー', signIn: 'サインイン', openHome: '#general を開く',
    workEmail: '仕事用メールアドレス', password: 'パスワード', forgot: 'パスワードをお忘れですか？', wrong: 'パスワードが違います', newPassword: '新しいパスワード', show: 'パスワードを表示',
    offline: 'オフライン', reconnecting: '再接続しています', tryNow: '今すぐ再接続', restored: 'オンラインに戻りました',
    language: '言語', signOut: 'サインアウト', profile: 'プロフィール：Sam Okafor（アクティブ）',
    addTo: '#design-studio にメンバーを追加', close: '閉じる', add: '追加', newMessage: '新規メッセージ', addChannel: 'チャンネルを追加', bold: '太字', more: 'その他',
    people: ['平野 いずみ', '森 真由', 'Jonas Berg', 'Sam Okafor'],
    body: 'コピーは一行、アクションはひとつ、イラストはなしでいきます。',
  },
};

function initial<V extends string>(key: string, allowed: readonly V[], fallback: V): V {
  const v = new URLSearchParams(location.search).get(key);
  return allowed.includes(v as V) ? (v as V) : fallback;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{title}</h2>
      {children}
    </section>
  );
}

const Hash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
  </svg>
);
const Link = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);
const Pen = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const Plus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Bold = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
);
const Dots = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);
const Eye = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const Globe = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);
const SignOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </svg>
);

const noop = () => {};
// D-38 boards: EmailConfirmGate, EmailConfirmGateOther, EmailConfirmSent, EmailConfirmDone, EmailConfirmHelp, EmailConfirmHelped.
const emailScreens: { id: string; screen: EmailScreen; otherDevice?: boolean }[] = [
  { id: 'gate', screen: 'gate' },
  { id: 'gate-other', screen: 'gate', otherDevice: true },
  { id: 'sent', screen: 'sent' },
  { id: 'done', screen: 'done' },
  { id: 'no-link', screen: 'noLink' },
  { id: 'help', screen: 'help' },
  { id: 'helped', screen: 'helped' },
];
const emailProps: Omit<EmailConfirmViewProps, 'screen' | 'otherDevice'> = {
  email: 'henrik@nordlys.no',
  contact: { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' },
  canResend: true,
  asking: false,
  failed: false,
  onEmail: noop,
  onDevice: noop,
  onHelp: noop,
  onDidntGet: noop,
  onBack: noop,
  onStartFresh: noop,
};

export default function Gallery() {
  const { i18n } = useTranslation();
  const store = useMemo(() => createFakeStore(), []);
  const linkBackend = useMemo(() => createFakeBackend(), []);
  const [theme, setTheme] = useState<Theme>(() => initial('theme', ['light', 'dark'] as const, 'light'));
  const [lang, setLang] = useState<Lang>(() => initial('lang', ['en', 'ja'] as const, 'en'));
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(() => new URLSearchParams(location.search).has('menu'));
  const t = T[lang];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    void i18n.changeLanguage(lang);
    const q = new URLSearchParams(location.search);
    q.set('theme', theme);
    q.set('lang', lang);
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }, [theme, lang, i18n]);

  const [ih, ml, jb, so] = t.people as [string, string, string, string];

  return (
    <div className={s.page}>
      <header className={s.bar}>
        <h1 className={s.title}>Gallery</h1>
        <div className={s.toggles}>
          <Button variant="secondary" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? 'Dark' : 'Light'}
          </Button>
          <Button variant="secondary" onClick={() => setLang(lang === 'en' ? 'ja' : 'en')}>
            {lang === 'en' ? '日本語' : 'English'}
          </Button>
        </div>
      </header>

      <div className={s.grid}>
        <Section title="Button">
          <div className={s.row}>
            <Button>{t.addN}</Button>
            <Button variant="secondary">{t.cancel}</Button>
            <Button variant="ghost" icon={<Link />}>{t.copyLink}</Button>
            <Button disabled>{t.add}</Button>
          </div>
          <div className={s.row}>
            <Button icon={<Hash />} className={s.h38}>{t.openHome}</Button>
          </div>
          <div className={s.stack}>
            <Button size="lg" block>{t.signIn}</Button>
            <Button size="lg" variant="secondary" block>{t.cancel}</Button>
          </div>
        </Section>

        <Section title="IconButton">
          <div className={s.row}>
            <IconButton label={t.newMessage} icon={<Pen />} outline />
            <IconButton label={t.close} icon={<Pen />} />
            <IconButton label={t.more} icon={<Dots />} size={30} />
            <IconButton label={t.bold} icon={<Bold />} size={28} />
            <span className={s.sideSwatch}>
              <IconButton label={t.addChannel} icon={<Plus />} size={24} />
            </span>
          </div>
        </Section>

        <Section title="TextField">
          <div className={s.stack}>
            <TextField label={t.workEmail} type="email" placeholder="name@company.com" />
            <TextField
              label={t.password}
              type="password"
              defaultValue="nordlys2026"
              error={t.wrong}
              labelAside={<button type="button" className={s.link}>{t.forgot}</button>}
            />
            <TextField label={t.newPassword} hideLabel type="password" defaultValue="harbour-lights-42" trailing={<IconButton label={t.show} icon={<Eye />} />} />
          </div>
        </Section>

        <Section title="Avatar · Badge">
          <div className={s.row}>
            <Avatar name={ih} color="#C2410C" presence="active" />
            <Avatar name={ml} color="#7E22CE" presence="away" />
            <Avatar name={jb} color="#1D4ED8" />
            <Avatar name={so} color={avatarColor('@sam:pasodrum.work')} />
            <Avatar name={ih} color="#C2410C" size={32} />
            <Avatar name={jb} color="#1D4ED8" size={32} />
            <Avatar name={ml} color="#7E22CE" size={22} />
            <Avatar name={jb} color="#1D4ED8" size={22} />
            <span className={s.sideSwatch}>
              <Avatar name={ih} color="#C2410C" size={20} presence="active" />
              <Avatar name={ml} color="#7E22CE" size={20} presence="away" />
            </span>
          </div>
          <div className={s.row}>
            <Badge count={2} />
            <Badge count={12} />
            <span className={s.railSwatch}>
              <Badge count={1} size="sm" />
              <AttentionDot />
            </span>
          </div>
        </Section>

        <Section title="Banner">
          <div className={s.stack}>
            <Banner status="offline" text={t.offline} />
            <Banner status="reconnecting" text={t.reconnecting} actionLabel={t.tryNow} onAction={() => {}} />
            <Banner status="restored" text={t.restored} />
          </div>
        </Section>

        <Section title="Skeleton">
          <div className={s.skelRow}>
            <Skeleton width={36} height={36} radius={9} />
            <div className={s.skelLines}>
              <Skeleton width="34%" height={11} />
              <Skeleton width="92%" height={9} />
              <Skeleton width="60%" height={9} />
            </div>
          </div>
          <div className={s.railSwatch}>
            <Skeleton onRail width={40} height={40} radius={11} />
            <Skeleton onRail width={36} height={32} radius={9} />
            <Skeleton onRail width={36} height={36} radius={10} />
          </div>
        </Section>

        <Section title="Menu">
          <div className={s.rail}>
            <Menu open={menu} onOpenChange={setMenu}>
              <MenuTrigger asChild>
                <button type="button" className={s.me} aria-label={t.profile}>
                  <Avatar name={so} color="#0E7C66" presence="active" className={s.meAvatar} />
                </button>
              </MenuTrigger>
              <MenuContent side="right" align="end" sideOffset={24} width={264} aria-label={so}>
                <div className={s.menuHead}>
                  <Avatar name={so} color="#0E7C66" presence="active" className={s.menuAvatar} />
                  <span className={s.menuName}>{so}</span>
                </div>
                <MenuSeparator className={s.sepTop} />
                <MenuSegments
                  label={t.language}
                  icon={<Globe />}
                  value={lang}
                  onValueChange={(v) => setLang(v as Lang)}
                  options={[
                    { value: 'en', label: 'English', lang: 'en' },
                    { value: 'ja', label: '日本語', lang: 'ja' },
                  ]}
                />
                <MenuSeparator className={s.sepBottom} />
                <MenuItem icon={<SignOut />}>{t.signOut}</MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </Section>

        <Section title="Dialog">
          <Button variant="secondary" onClick={() => setDialog(true)}>{t.addTo}</Button>
          <Dialog
            open={dialog}
            onOpenChange={setDialog}
            title={t.addTo}
            closeLabel={t.close}
            footer={
              <>
                <Button variant="ghost" icon={<Link />} className={s.h36}>{t.copyLink}</Button>
                <span className={s.spacer} />
                <Button variant="secondary" onClick={() => setDialog(false)}>{t.cancel}</Button>
                <Button>{t.addN}</Button>
              </>
            }
          >
            <p className={s.body}>{t.body}</p>
          </Dialog>
        </Section>

        <Section title="Type">
          <div className={s.type}>
            <span className={s.typeTitle}>{t.addTo}</span>
            <span className={s.typeBody}>{t.body}</span>
          </div>
        </Section>
      </div>

      <WorkspaceProvider store={store}>
        <div className={s.screens}>
          {emailScreens.map((e) => (
            <section key={e.id} className={s.screen} data-screen={`email-${e.id}`}>
              <div className={gateStyles.gate}>
                <EmailConfirmView {...emailProps} screen={e.screen} otherDevice={!!e.otherDevice} />
              </div>
            </section>
          ))}
          {['open', 'gone', 'nohelp', 'offline'].map((code) => (
            <section key={code} className={s.screen} data-screen={`link-${code}`}>
              <MemoryRouter>
                <ConfirmPage backend={linkBackend} code={code} />
              </MemoryRouter>
            </section>
          ))}
        </div>
      </WorkspaceProvider>
    </div>
  );
}
