import { useTranslation } from 'react-i18next';
import { useWorkspace } from '../../matrix';
import { Avatar, avatarColor, Menu, MenuContent, MenuItem, MenuSegments, MenuSeparator, MenuTrigger } from '../../ui';
import { currentLanguage, setLanguage, type Language } from '../i18n';
import { GlobeIcon, SignOutIcon } from '../icons';
import s from './Shell.module.css';

export function ProfileMenu({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  const me = useWorkspace((x) => x.me);
  const online = useWorkspace((x) => x.connection === 'online');
  const color = avatarColor(me.id);
  const dot = <span className={[s.meDot, online && s.online].filter(Boolean).join(' ')} />;

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={s.me}
          aria-label={t(online ? 'shell.rail.profileActive' : 'shell.rail.profileOffline', { name: me.name })}
        >
          <Avatar name={me.name} color={color} src={me.avatarUrl} className={s.meAvatar} />
          {dot}
        </button>
      </MenuTrigger>
      <MenuContent side="right" align="end" sideOffset={24} width={264} aria-label={me.name}>
        <div className={s.menuHead}>
          <span className={s.menuAvatar}>
            <Avatar name={me.name} color={color} src={me.avatarUrl} className={s.meAvatar} />
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
        <MenuSeparator />
        <MenuItem icon={<SignOutIcon />} onSelect={onSignOut}>
          {t('shell.profileMenu.signOut')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
