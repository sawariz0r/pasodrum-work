import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useWorkspace } from '../../matrix';
import { platform } from '../../platform';
import { PhoneIcon } from '../another/icons';
import { Avatar, avatarColor, Menu, MenuContent, MenuItem, MenuSegments, MenuSeparator, MenuTrigger } from '../../ui';
import { currentLanguage, setLanguage, type Language } from '../i18n';
import { lazyComponent } from '../lazy';
import { DownloadIcon, GlobeIcon, SignOutIcon, ThemeIcon } from '../icons';
import { setTheme, useTheme, type Theme } from '../prefs';
import { GearIcon } from '../settings/icons';
import { settingsState } from '../settings/SettingsRoute';
import { useMediaUrl } from '../timeline/Media';
import s from './Shell.module.css';

const AnotherAppDialog = lazyComponent(() => import('../another/AnotherApp').then((m) => m.AnotherAppDialog));

export function ProfileMenu({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useWorkspace((x) => x.me);
  const online = useWorkspace((x) => x.connection === 'online');
  const theme = useTheme();
  const color = avatarColor(me.id);
  const avatar = useMediaUrl(me.avatarUrl, true);
  const dot = <span className={[s.meDot, online && s.online].filter(Boolean).join(' ')} />;
  // null until first opened: the dialog's code loads then (M8).
  const [another, setAnother] = useState<boolean | null>(null);
  const download = platform.downloadUrl();

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={s.me}
          aria-label={t(online ? 'shell.rail.profileActive' : 'shell.rail.profileOffline', { name: me.name })}
        >
          <Avatar name={me.name} color={color} src={avatar} className={s.meAvatar} />
          {dot}
        </button>
      </MenuTrigger>
      <MenuContent side="right" align="end" sideOffset={24} width={264} aria-label={me.name}>
        <div className={s.menuHead}>
          <span className={s.menuAvatar}>
            <Avatar name={me.name} color={color} src={avatar} className={s.meAvatar} />
            {dot}
          </span>
          <span className={s.menuName}>{me.name}</span>
        </div>
        <MenuSeparator />
        <MenuSegments
          label={t('shell.profileMenu.language')}
          icon={<GlobeIcon />}
          value={currentLanguage()}
          onValueChange={(v) => void setLanguage(v as Language)}
          options={[
            { value: 'en', label: t('shell.profileMenu.english'), lang: 'en' },
            { value: 'ja', label: t('shell.profileMenu.japanese'), lang: 'ja' },
          ]}
        />
        <MenuSegments
          label={t('shell.profileMenu.theme')}
          icon={<ThemeIcon />}
          value={theme}
          onValueChange={(v) => setTheme(v as Theme)}
          options={[
            { value: 'light', label: t('shell.profileMenu.light') },
            { value: 'dark', label: t('shell.profileMenu.dark') },
          ]}
        />
        <MenuSeparator />
        <MenuItem icon={<GearIcon />} onSelect={() => navigate('/settings', { state: settingsState(location) })}>
          {t('shell.profileMenu.settings')}
        </MenuItem>
        <MenuItem icon={<PhoneIcon />} onSelect={() => setAnother(true)}>
          {t('another.title')}
        </MenuItem>
        {download && (
          <MenuItem icon={<DownloadIcon />} onSelect={() => window.location.assign(download)}>
            {t('download.mac')}
          </MenuItem>
        )}
        <MenuItem icon={<SignOutIcon />} onSelect={onSignOut}>
          {t('shell.profileMenu.signOut')}
        </MenuItem>
      </MenuContent>
      {another !== null && <AnotherAppDialog open={another} onOpenChange={setAnother} />}
    </Menu>
  );
}
