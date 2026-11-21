import * as RD from '@radix-ui/react-dialog';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PasswordRequired, useStore, useWorkspace, type Device, type NotifyLevel, type Profile } from '../../matrix';
import { avatarColor, Button, Dialog, IconButton, initialsOf, isCjk, isImeEnter, TextField, useMenuReturnFocus } from '../../ui';
import { currentLanguage, setLanguage, type Language } from '../i18n';
import { timeIn, useCityName } from '../people/localTime';
import { setThemePref, useThemePref, type ThemePref } from '../prefs';
import { useMediaUrl } from '../timeline/Media';
import {
  BellIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  LaptopIcon,
  LeaveIcon,
  MailIcon,
  PhoneIcon,
  SunIcon,
  UserIcon,
} from './icons';
import s from './Settings.module.css';

export const settingsTabs = ['profile', 'notifications', 'appearance', 'devices'] as const;
export type SettingsTab = (typeof settingsTabs)[number];

const tabIcons: Record<SettingsTab, ReactNode> = {
  profile: <UserIcon />,
  notifications: <BellIcon />,
  appearance: <SunIcon />,
  devices: <LaptopIcon />,
};

/** Settings dialog (SettingsProfile, SettingsNotifications, SettingsAppearance, SettingsDevices). Changes save as you make them. */
export function Settings({ tab, onTab, onClose }: { tab: SettingsTab; onTab: (tab: SettingsTab) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const returnFocus = useMenuReturnFocus(true);
  return (
    <RD.Root open onOpenChange={(open) => !open && onClose()}>
      <RD.Portal>
        <RD.Overlay className={s.overlay}>
          <RD.Content className={s.dialog} aria-describedby={undefined} onCloseAutoFocus={returnFocus}>
            <nav className={s.nav} aria-label={t('settings.title')}>
              <RD.Title className={s.navTitle}>{t('settings.title')}</RD.Title>
              {settingsTabs.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={s.tab}
                  aria-current={id === tab ? 'page' : undefined}
                  onClick={() => onTab(id)}
                >
                  {tabIcons[id]}
                  {t(`settings.tabs.${id}`)}
                </button>
              ))}
            </nav>
            <section className={s.content} aria-labelledby={titleId}>
              <div className={s.header}>
                <h2 id={titleId} className={s.title}>
                  {t(`settings.tabs.${tab}`)}
                </h2>
                <RD.Close asChild>
                  <IconButton label={t('settings.close')} icon={<CloseIcon />} className={s.close} />
                </RD.Close>
              </div>
              <div className={s.body}>
                {tab === 'profile' && <ProfilePane key={tab} />}
                {tab === 'notifications' && <NotificationsPane key={tab} labelledBy={titleId} />}
                {tab === 'appearance' && <AppearancePane key={tab} />}
                {tab === 'devices' && <DevicesPane key={tab} />}
              </div>
            </section>
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function ProfilePane() {
  const { t } = useTranslation();
  const store = useStore();
  const me = useWorkspace((x) => x.me);
  const avatar = useMediaUrl(me.avatarUrl, true);
  const cityName = useCityName();
  const file = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const zoneId = useId();
  const [profile, setProfile] = useState<Profile>();
  const [name, setName] = useState(me.name);
  const [zone, setZone] = useState<string>();
  const [failed, setFailed] = useState<'name' | 'photo' | 'zone'>();

  useEffect(() => {
    let live = true;
    store.profile(me.id).then(
      (p) => live && setProfile(p),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, me.id]);

  const current = zone ?? profile?.timeZone ?? deviceZone();
  const label = useCallback(
    (tz: string) => {
      const city = cityName(tz);
      const time = timeIn(tz, new Date());
      return city && time ? t('settings.profile.zone', { city, time }) : tz;
    },
    [cityName, t],
  );
  const zones = useMemo(() => zoneOptions(current, label), [current, label]);

  const saveName = () => {
    const next = name.trim();
    if (!next || next === me.name) return setName(me.name);
    setFailed(undefined);
    store.updateProfile({ name: next }).catch(() => setFailed('name'));
  };

  const initials = initialsOf(me.name);

  return (
    <div className={s.pane}>
      <div className={s.photoRow}>
        <span className={[s.photo, isCjk(initials) && s.cjk].filter(Boolean).join(' ')} style={{ background: avatarColor(me.id) }} aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : initials}
        </span>
        <Button variant="secondary" className={s.smallButton} onClick={() => file.current?.click()}>
          {t('settings.profile.uploadPhoto')}
        </Button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = '';
            if (!picked) return;
            setFailed(undefined);
            store.updateProfile({ avatar: picked }).catch(() => setFailed('photo'));
          }}
        />
      </div>
      {failed === 'photo' && <Failed />}

      <div>
        <label htmlFor={nameId} className={s.label}>
          {t('settings.profile.name')}
        </label>
        <input
          id={nameId}
          className={s.field}
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (isImeEnter(e)) e.currentTarget.blur();
          }}
        />
        {failed === 'name' && <Failed />}
      </div>

      <div>
        <label htmlFor={zoneId} className={s.label}>
          {t('settings.profile.timeZone')}
        </label>
        <div className={s.select}>
          <ClockIcon className={s.selectIcon} />
          <span className={s.selectValue}>{label(current)}</span>
          <ChevronDownIcon className={s.selectChevron} />
          <select
            id={zoneId}
            value={current}
            onChange={(e) => {
              const timeZone = e.target.value;
              setZone(timeZone);
              setFailed(undefined);
              store.updateProfile({ timeZone }).catch(() => setFailed('zone'));
            }}
          >
            {zones.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </select>
        </div>
        {failed === 'zone' && <Failed />}
      </div>

      {profile?.email && (
        <div>
          <div className={s.label}>{t('settings.profile.email')}</div>
          <div className={s.email}>
            <MailIcon />
            <span>{profile.email}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Every zone that is a place, by name; the current one always included. */
function zoneOptions(current: string, label: (tz: string) => string) {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf('timeZone');
  } catch {
    all = [];
  }
  const set = new Set(all.filter((z) => z.includes('/') && !z.startsWith('Etc/')));
  set.add(current);
  const collator = new Intl.Collator(currentLanguage());
  return [...set].map((value) => ({ value, label: label(value) })).sort((a, b) => collator.compare(a.label, b.label));
}

function Failed({ text }: { text?: string }) {
  const { t } = useTranslation();
  return (
    <p role="alert" className={s.error}>
      {text ?? t('settings.profile.failed')}
    </p>
  );
}

function NotificationsPane({ labelledBy }: { labelledBy: string }) {
  const { t } = useTranslation();
  const store = useStore();
  const [level, setLevel] = useState<NotifyLevel>(() => store.notifyLevel('default'));
  const [failed, setFailed] = useState(false);
  const name = useId();

  const pick = (next: NotifyLevel) => {
    const prev = level;
    setLevel(next);
    setFailed(false);
    store.setNotifyLevel('default', next).catch(() => {
      setLevel(prev);
      setFailed(true);
    });
  };

  return (
    <div className={s.pane}>
      <div role="radiogroup" aria-labelledby={labelledBy} className={s.radios}>
        {(['all', 'mentions', 'none'] as const).map((id) => (
          <label key={id} className={s.radio}>
            <input type="radio" name={name} value={id} checked={level === id} onChange={() => pick(id)} />
            <span className={s.ring} aria-hidden="true" />
            {t(`settings.notifications.${id}`)}
          </label>
        ))}
      </div>
      {failed && <Failed />}
    </div>
  );
}

const previews: Record<'light' | 'dark', { bg: string; side: string; rail: string; line: string }> = {
  light: { bg: '#FFFFFF', side: '#F7F6F3', rail: '#18171D', line: '#E8E6E1' },
  dark: { bg: '#1B1B20', side: '#141418', rail: '#0D0D10', line: '#2C2C33' },
};

function AppearancePane() {
  const { t } = useTranslation();
  const pref = useThemePref();
  const [lang, setLang] = useState<Language>(currentLanguage);
  const themeId = useId();
  const langId = useId();
  const themeName = useId();
  const langName = useId();

  return (
    <div className={[s.pane, s.wide].join(' ')}>
      <div>
        <div id={themeId} className={s.label}>
          {t('settings.appearance.theme')}
        </div>
        <div role="radiogroup" aria-labelledby={themeId} className={s.themes}>
          {(['light', 'dark', 'system'] as const satisfies readonly ThemePref[]).map((id) => (
            <label key={id} className={s.themeCard}>
              <input type="radio" name={themeName} value={id} checked={pref === id} onChange={() => setThemePref(id)} />
              {id === 'system' ? (
                <span className={s.systemPreview} aria-hidden="true">
                  <span />
                  <span />
                </span>
              ) : (
                <span
                  className={s.preview}
                  aria-hidden="true"
                  style={{ background: previews[id].bg, borderColor: previews[id].line }}
                >
                  <span style={{ background: previews[id].rail }} />
                  <span style={{ background: previews[id].side }} />
                  <span>
                    <span style={{ background: previews[id].line }} />
                    <span style={{ background: previews[id].line }} />
                    <span style={{ borderColor: previews[id].line }} />
                  </span>
                </span>
              )}
              <span className={s.themeName}>{t(`settings.appearance.${id}`)}</span>
            </label>
          ))}
        </div>
      </div>
      <div className={s.langBlock}>
        <div id={langId} className={s.label}>
          {t('settings.appearance.language')}
        </div>
        <div role="radiogroup" aria-labelledby={langId} className={s.segments}>
          {(['en', 'ja'] as const).map((id) => (
            <label key={id} className={s.segment} lang={id}>
              <input
                type="radio"
                name={langName}
                value={id}
                checked={lang === id}
                onChange={() => {
                  setLang(id);
                  void setLanguage(id);
                }}
              />
              {t(id === 'en' ? 'shell.profileMenu.english' : 'shell.profileMenu.japanese')}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

const phoneRe = /iphone|ipad|android|ios|phone|mobile/i;

function lastSeen(device: Device, now: number, lng: Language, yesterday: string, activeNow: string): string {
  const ts = device.lastSeenTs;
  if (device.current) return activeNow;
  if (ts === undefined) return '';
  if (now - ts < 5 * 60_000) return activeNow;
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto' });
  const diff = now - ts;
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(new Date(ts))) / 86_400_000);
  if (days === 0) return rtf.format(-Math.round(diff / 3_600_000), 'hour');
  if (days === 1) return yesterday;
  return new Intl.DateTimeFormat(lng === 'en' ? 'en-GB' : lng, { day: 'numeric', month: 'short' }).format(ts);
}

function DevicesPane() {
  const { t } = useTranslation();
  const store = useStore();
  const [devices, setDevices] = useState<Device[]>();
  const [busy, setBusy] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState<{ title: string; retry: (password: string) => Promise<void>; keep: (d: Device) => boolean }>();

  useEffect(() => {
    let live = true;
    store.devices().then(
      (list) => live && setDevices([...list].sort((a, b) => Number(b.current) - Number(a.current))),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [store]);

  const run = async (key: string, title: string, action: () => Promise<void>, keep: (d: Device) => boolean) => {
    if (busy) return;
    setBusy(key);
    setFailed(false);
    try {
      await action();
      setDevices((list) => list?.filter(keep));
    } catch (err) {
      // The server can ask for the password again before signing devices out.
      if (err instanceof PasswordRequired) setAsk({ title, retry: err.retry, keep });
      else setFailed(true);
    } finally {
      setBusy(undefined);
    }
  };

  const [now] = useState(() => Date.now());
  const lng = currentLanguage();
  const others = devices?.some((d) => !d.current);

  return (
    <div className={[s.pane, s.wide, s.devices].join(' ')}>
      {devices && devices.length > 0 && (
        <ul className={s.deviceList}>
          {devices.map((d) => (
            <li key={d.id} className={s.device}>
              <span className={s.deviceIcon}>{phoneRe.test(d.name) ? <PhoneIcon /> : <LaptopIcon size={19} />}</span>
              <span className={s.deviceText}>
                <span className={s.deviceNameRow}>
                  <span className={s.deviceName}>{d.name}</span>
                  {d.current && <span className={s.thisDevice}>{t('settings.devices.thisDevice')}</span>}
                </span>
                <span className={s.deviceMeta}>
                  {lastSeen(d, now, lng, t('settings.devices.yesterday'), t('settings.devices.activeNow'))}
                </span>
              </span>
              {!d.current && (
                <button
                  type="button"
                  className={s.deviceSignOut}
                  aria-busy={busy === d.id || undefined}
                  onClick={() =>
                    void run(d.id, t('settings.devices.signOutOf', { name: d.name }), () => store.signOutDevice(d.id), (x) => x.id !== d.id)
                  }
                >
                  {t('settings.devices.signOut')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {others && (
        <button
          type="button"
          className={s.signOutOthers}
          aria-busy={busy === 'others' || undefined}
          onClick={() => void run('others', t('settings.devices.signOutOthers'), () => store.signOutOtherDevices(), (x) => x.current)}
        >
          <LeaveIcon />
          {t('settings.devices.signOutOthers')}
        </button>
      )}
      {failed && <Failed text={t('settings.devices.failed')} />}
      {ask && (
        <PasswordPrompt
          title={ask.title}
          retry={ask.retry}
          onClose={(done) => {
            if (done) setDevices((list) => list?.filter(ask.keep));
            else if (done === false) setFailed(true);
            setAsk(undefined);
          }}
        />
      )}
    </div>
  );
}

/** The password again before signing devices out. `onClose(true)` done, `(false)` failed, `()` cancelled. */
function PasswordPrompt({ title, retry, onClose }: { title: string; retry: (password: string) => Promise<void>; onClose: (done?: boolean) => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    try {
      await retry(password);
      onClose(true);
    } catch (err) {
      setBusy(false);
      if (err instanceof Error && err.message === 'wrong-password') setWrong(true);
      else onClose(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title} closeLabel={t('settings.close')} width={420} top={160}>
      <form className={s.prompt} onSubmit={submit}>
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isImeEnter(e)) e.preventDefault();
          }}
        />
        <div className={s.promptActions}>
          <Button variant="secondary" onClick={() => onClose()}>
            {t('settings.devices.cancel')}
          </Button>
          <Button type="submit" variant="danger" disabled={!password} aria-busy={busy || undefined}>
            {t('settings.devices.signOut')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
