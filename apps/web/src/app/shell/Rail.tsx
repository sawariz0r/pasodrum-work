import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { useWorkspace, type Space } from '../../matrix';
import { AttentionDot, avatarColor } from '../../ui';
import { ExternalIcon, LogoMark, MoonIcon, SunIcon } from '../icons';
import { channelPath, spaceHome } from '../places';
import { setTheme, useTheme } from '../prefs';
import type { RailItem } from '../registry';
import { useRegistry } from '../RegistryProvider';
import { ProfileMenu } from './ProfileMenu';
import s from './Shell.module.css';

export function Rail({ activeSpaceId, onSignOut }: { activeSpaceId?: string; onSignOut: () => void }) {
  const { t } = useTranslation();
  const spaces = useWorkspace((x) => x.spaces);
  const { rail } = useRegistry();
  const theme = useTheme();
  const isTeam = spaces.some((x) => x.kind === 'workspace');

  return (
    <nav aria-label={t('shell.rail.label')} className={s.rail}>
      {spaces.map((space) => (
        <SpaceTile key={space.id} space={space} active={space.id === activeSpaceId} external={isTeam && space.kind === 'client'} />
      ))}
      {rail.length > 0 && <div className={s.railDivider} />}
      {rail.map((item) => (
        <RailLink key={item.id} item={item} />
      ))}
      <div className={s.railSpacer} />
      <button
        type="button"
        className={`${s.railItem} ${s.railToggle}`}
        aria-label={t(theme === 'dark' ? 'shell.rail.lightTheme' : 'shell.rail.darkTheme')}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        <span className={s.railIcon}>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</span>
      </button>
      <ProfileMenu onSignOut={onSignOut} />
    </nav>
  );
}

function SpaceTile({ space, active, external }: { space: Space; active: boolean; external: boolean }) {
  const { t } = useTranslation();
  const home = useWorkspace((x) => spaceHome(x, space.id)?.id);
  const attention = useWorkspace((x) => !active && (x.channels[space.id] ?? []).some((c) => c.unread > 0 || c.mentions > 0));
  const isWorkspace = space.kind === 'workspace';
  const style = { '--tile-bg': isWorkspace ? '#0E7C66' : avatarColor(space.id) } as CSSProperties;
  const content = space.avatarUrl ? (
    <img src={space.avatarUrl} alt="" />
  ) : isWorkspace ? (
    <LogoMark />
  ) : (
    (Array.from(space.name.trim())[0] ?? '').toUpperCase()
  );
  return (
    <Link
      to={home ? channelPath(space.id, home) : `/w/${encodeURIComponent(space.id)}`}
      className={s.tile}
      style={style}
      aria-label={t(isWorkspace ? 'shell.rail.workspace' : 'shell.rail.clientSpace', { name: space.name })}
      aria-current={active ? 'page' : undefined}
    >
      {content}
      {external && (
        <span className={s.tileExternal}>
          <ExternalIcon />
        </span>
      )}
      {attention && <AttentionDot className={s.tileDot} />}
    </Link>
  );
}

function RailLink({ item }: { item: RailItem }) {
  const label = item.useLabel();
  return (
    <NavLink to={item.to} className={s.railItem}>
      <span className={s.railIcon}>{item.icon}</span>
      {label}
    </NavLink>
  );
}
