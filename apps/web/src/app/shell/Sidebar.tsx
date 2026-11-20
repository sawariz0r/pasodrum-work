import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useWorkspace, type Channel, type Dm, type Space } from '../../matrix';
import { avatarColor, Badge, IconButton } from '../../ui';
import { useDrafts } from '../drafts';
import { HashIcon, LockIcon } from '../icons';
import { DmFace } from '../people/Face';
import { useDmName, useShowExternal } from '../people/names';
import { useNewMessage } from '../people/NewMessage';
import { channelPath, draftsPath, spaceDmPath, spaceHome, threadsPath } from '../places';
import { ChevronDownIcon, ComposeIcon, PlusIcon, SendIcon, ThreadIcon } from './icons';
import { useMediaUrl } from '../timeline/Media';
import s from './Shell.module.css';
import { useSpaceDrafts } from './spaceRooms';

const noChannels: Channel[] = [];

export type SidebarActive = { channelId: string } | { dmId: string } | { view: 'threads' | 'drafts' };

/** The space you're in (D-23): Threads, Drafts, channels, its DMs, client spaces. */
export function Sidebar({ space, active }: { space: Space; active?: SidebarActive }) {
  const { t } = useTranslation();
  const newMessage = useNewMessage();
  const channels = useWorkspace((x) => x.channels[space.id] ?? noChannels);
  const allDms = useWorkspace((x) => x.dms);
  const spaces = useWorkspace((x) => x.spaces);
  const threads = useWorkspace((x) => x.threads);
  const drafts = useSpaceDrafts(space.id, useDrafts());
  const dms = allDms.filter((d) => d.spaceIds.includes(space.id));
  const clients = space.kind === 'workspace' ? spaces.filter((x) => x.kind === 'client') : [];
  const unreadThreads = threads.filter((th) => th.unread && channels.some((c) => c.id === th.channelId)).length;
  const is = (key: string, value: string) => !!active && key in active && (active as Record<string, string>)[key] === value;

  return (
    <aside aria-label={t('shell.sidebar.label', { workspace: space.name })} className={s.sidebar}>
      <div className={s.sideHead}>
        <h2 className={s.spaceName}>{space.name}</h2>
        <IconButton outline label={t('shell.sidebar.newMessage')} icon={<ComposeIcon />} onClick={newMessage} />
      </div>
      <div className={s.sideList}>
        <NavRow
          to={threadsPath(space.id)}
          current={is('view', 'threads')}
          strong={unreadThreads > 0}
          icon={<ThreadIcon />}
          name={t('shell.sidebar.threads')}
          end={<Badge count={unreadThreads} />}
        />
        <NavRow
          to={draftsPath(space.id)}
          current={is('view', 'drafts')}
          icon={<SendIcon />}
          name={t('shell.sidebar.drafts')}
          end={drafts.length > 0 && <span className={s.quietCount}>{drafts.length}</span>}
        />

        <Section label={t('shell.sidebar.channels')}>
          {channels.map((c) => {
            const current = is('channelId', c.id);
            return (
              <NavRow
                key={c.id}
                to={channelPath(space.id, c.id)}
                current={current}
                strong={c.unread > 0 || c.mentions > 0}
                icon={c.private ? <LockIcon /> : <HashIcon />}
                name={c.name}
                end={!current && <Badge count={c.mentions} />}
              />
            );
          })}
        </Section>

        <Section
          label={t('shell.sidebar.directMessages')}
          action={<IconButton size={24} className={s.sectionAction} label={t('shell.sidebar.newDirectMessage')} icon={<PlusIcon size={14} strokeWidth={2.2} />} onClick={newMessage} />}
        >
          {dms.map((d) => (
            <DmRow key={d.id} dm={d} spaceId={space.id} current={is('dmId', d.id)} />
          ))}
        </Section>

        {clients.length > 0 && (
          <Section label={t('shell.sidebar.clientSpaces')}>
            {clients.map((c) => (
              <ClientRow key={c.id} space={c} />
            ))}
          </Section>
        )}
      </div>
    </aside>
  );
}

function NavRow({ to, current, strong, icon, name, end, dm }: { to: string; current: boolean; strong?: boolean; icon: ReactNode; name: string; end?: ReactNode; dm?: boolean }) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={[s.row, dm && s.dmRow, !current && strong && s.strong].filter(Boolean).join(' ')}
    >
      {icon}
      <span className={s.rowName}>{name}</span>
      {end}
    </Link>
  );
}

function DmRow({ dm, spaceId, current }: { dm: Dm; spaceId: string; current: boolean }) {
  const meId = useWorkspace((x) => x.me.id);
  const name = useDmName();
  const showExternal = useShowExternal();
  return (
    <NavRow
      dm
      to={spaceDmPath(spaceId, dm.id)}
      current={current}
      strong={dm.unread > 0}
      icon={<DmFace dm={dm} meId={meId} size={20} showExternal={showExternal} />}
      name={name(dm)}
      end={!current && <Badge count={dm.unread} />}
    />
  );
}

function ClientRow({ space }: { space: Space }) {
  const home = useWorkspace((x) => spaceHome(x, space.id)?.id);
  const avatar = useMediaUrl(space.avatarUrl, true);
  return (
    <NavRow
      to={home ? channelPath(space.id, home) : `/w/${encodeURIComponent(space.id)}`}
      current={false}
      icon={
        <span className={s.spaceChip} style={{ '--tile-bg': avatarColor(space.id) } as CSSProperties} aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : (Array.from(space.name.trim())[0] ?? '').toUpperCase()}
        </span>
      }
      name={space.name}
    />
  );
}

function Section({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <div className={s.sectionHead}>
        <button type="button" className={s.sectionToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDownIcon className={s.sectionChevron} />
          {label}
        </button>
        {action}
      </div>
      {open && children}
    </>
  );
}
