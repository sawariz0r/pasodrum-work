import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { useWorkspace, type Space } from '../../matrix';
import { AttentionDot, Badge } from '../../ui';
import { useChannels } from '../channels/ChannelsProvider';
import { canManage } from '../channels/roles';
import { forgetFreshSpace, isFreshSpace, spaceColour } from '../channels/shared';
import { LogoMark, MoonIcon, SunIcon } from '../icons';
import { channelPath, spaceHome } from '../places';
import { setTheme, useTheme } from '../prefs';
import type { RailItem } from '../registry';
import { useRegistry } from '../RegistryProvider';
import { BellIcon, BubbleIcon, HomeIcon, PlusIcon } from './icons';
import { ProfileMenu } from './ProfileMenu';
import { useMediaUrl } from '../timeline/Media';
import s from './Shell.module.css';

/** Which rail section the page belongs to (D-23): a space's sidebar (Home), DMs, Activity, or a feature's own page. */
export type Section = 'home' | 'dms' | 'activity' | 'feature';

export function Rail({ section, activeSpaceId, onSignOut }: { section: Section; activeSpaceId?: string; onSignOut: () => void }) {
  const { t } = useTranslation();
  const spaces = useWorkspace((x) => x.spaces);
  const unreadDms = useWorkspace((x) => x.dms.filter((d) => d.unread > 0).length);
  const unreadActivity = useWorkspace((x) => x.activity.filter((a) => a.unread).length);
  const { rail } = useRegistry();
  const theme = useTheme();
  const mayCreate = useWorkspace((x) => canManage(x.myRoles[x.spaces.find((sp) => sp.kind === 'workspace')?.id ?? '']));
  const channels = useChannels();

  return (
    <nav aria-label={t('shell.rail.label')} className={s.rail}>
      {spaces.map((space) => (
        <SpaceTile key={space.id} space={space} active={space.id === activeSpaceId} />
      ))}
      {mayCreate && (
        <button type="button" className={s.tileNew} aria-label={t('spaces.newClientSpace')} onClick={() => channels.newClientSpace()}>
          <PlusIcon size={18} strokeWidth={2} />
        </button>
      )}
      <div className={s.railDivider} />
      <SectionLink to="/" label={t('shell.rail.home')} icon={<HomeIcon />} current={section === 'home'} />
      <SectionLink to="/dms" label={t('shell.rail.dms')} icon={<BubbleIcon />} current={section === 'dms'} badge={unreadDms} />
      <SectionLink to="/activity" label={t('shell.rail.activity')} icon={<BellIcon />} current={section === 'activity'} badge={unreadActivity} />
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

function SpaceTile({ space, active }: { space: Space; active: boolean }) {
  const { t } = useTranslation();
  const home = useWorkspace((x) => spaceHome(x, space.id)?.id);
  const attention = useWorkspace((x) => !active && (x.channels[space.id] ?? []).some((c) => !c.archived && (c.unread > 0 || c.mentions > 0)));
  const isWorkspace = space.kind === 'workspace';
  const style = { '--tile-bg': spaceColour(space) } as CSSProperties;
  // ClientSpaceCreated: a space just made here pops in once.
  const [fresh] = useState(() => isFreshSpace(space));
  useEffect(() => {
    if (fresh) forgetFreshSpace(space.name);
  }, [fresh, space.name]);
  const avatar = useMediaUrl(space.avatarUrl, true);
  const content = avatar ? (
    <img src={avatar} alt="" />
  ) : isWorkspace ? (
    <LogoMark />
  ) : (
    (Array.from(space.name.trim())[0] ?? '').toUpperCase()
  );
  return (
    <Link
      to={home ? channelPath(space.id, home) : `/w/${encodeURIComponent(space.id)}`}
      className={[s.tile, space.archived && s.tileArchived, fresh && s.tileFresh].filter(Boolean).join(' ')}
      style={style}
      aria-label={t(isWorkspace ? 'shell.rail.workspace' : 'shell.rail.clientSpace', { name: space.name })}
      aria-current={active ? 'page' : undefined}
    >
      {content}
      {attention && <AttentionDot className={s.tileDot} />}
    </Link>
  );
}

function SectionLink({ to, label, icon, current, badge = 0 }: { to: string; label: string; icon: ReactNode; current: boolean; badge?: number }) {
  const { t } = useTranslation();
  return (
    <Link
      to={to}
      className={s.railItem}
      aria-current={current ? 'page' : undefined}
      aria-label={badge > 0 ? t('shell.rail.unread', { label, count: badge }) : label}
    >
      <span className={s.railIcon}>{icon}</span>
      {label}
      <Badge count={badge} size="sm" className={s.railBadge} />
    </Link>
  );
}

const noBadge = () => 0;

function RailLink({ item }: { item: RailItem }) {
  const { t } = useTranslation();
  const label = item.useLabel();
  const useBadge = item.useBadge ?? noBadge;
  const badge = useBadge();
  return (
    <NavLink to={item.to} className={s.railItem} aria-label={badge > 0 ? t('shell.rail.unread', { label, count: badge }) : undefined}>
      <span className={s.railIcon}>{item.icon}</span>
      {label}
      <Badge count={badge} size="sm" className={s.railBadge} />
    </NavLink>
  );
}
