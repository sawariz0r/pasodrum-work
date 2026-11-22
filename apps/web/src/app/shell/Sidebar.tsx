import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useWorkspace, type Channel, type Dm, type Space } from '../../matrix';
import { Badge, IconButton, SideHeading, sideRow } from '../../ui';
import { useDrafts } from '../drafts';
import { HashIcon, LockIcon } from '../icons';
import { DmFace } from '../people/Face';
import { useDmName } from '../people/names';
import { useNewMessage } from '../people/NewMessage';
import { SideCard } from '../notify/SideCard';
import { channelPath, draftsPath, spaceDmPath, threadsPath } from '../places';
import { ComposeIcon, PlusIcon, SendIcon, ThreadIcon } from './icons';
import s from './Shell.module.css';
import { useSpaceDrafts } from './spaceRooms';
import { ChannelsPlusMenu, WorkspaceMenu } from '../channels/ChannelMenus';

const noChannels: Channel[] = [];

export type SidebarActive = { channelId: string } | { dmId: string } | { view: 'threads' | 'drafts' };

/** The space you're in (D-23): Threads, Drafts, channels, its DMs. Client spaces live on the rail. */
export function Sidebar({ space, active }: { space: Space; active?: SidebarActive }) {
  const { t } = useTranslation();
  const newMessage = useNewMessage();
  const all = useWorkspace((x) => x.channels[space.id] ?? noChannels);
  // E2: archived channels leave the sidebar (nobody is removed); Browse lists them.
  const channels = useMemo(() => all.filter((c) => !c.archived), [all]);
  const allDms = useWorkspace((x) => x.dms);
  const threads = useWorkspace((x) => x.threads);
  const drafts = useSpaceDrafts(space.id, useDrafts());
  const dms = allDms.filter((d) => d.spaceIds.includes(space.id));
  const unreadThreads = threads.filter((th) => th.unread && channels.some((c) => c.id === th.channelId)).length;
  const is = (key: string, value: string) => !!active && key in active && (active as Record<string, string>)[key] === value;

  return (
    <aside aria-label={t('shell.sidebar.label', { workspace: space.name })} className={s.sidebar}>
      <div className={s.sideHead}>
        <WorkspaceMenu space={space} className={s.spaceName} />
        <IconButton outline label={t('shell.sidebar.newMessage')} icon={<ComposeIcon />} onClick={newMessage} />
      </div>
      <div className={s.sideList}>
        <NavRow
          to={threadsPath(space.id)}
          current={is('view', 'threads')}
          strong={unreadThreads > 0}
          icon={<ThreadIcon />}
          name={t('shell.sidebar.threads')}
          end={!is('view', 'threads') && <Badge count={unreadThreads} />}
        />
        <NavRow
          to={draftsPath(space.id)}
          current={is('view', 'drafts')}
          icon={<SendIcon />}
          name={t('shell.sidebar.drafts')}
          end={drafts.length > 0 && <span className={sideRow.count}>{drafts.length}</span>}
        />

        <Section label={t('shell.sidebar.channels')} action={<ChannelsPlusMenu space={space} className={sideRow.sectionAction} />}>
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
          action={<IconButton size={24} className={sideRow.sectionAction} label={t('shell.sidebar.newDirectMessage')} icon={<PlusIcon size={14} strokeWidth={2.2} />} onClick={newMessage} />}
        >
          {dms.map((d) => (
            <DmRow key={d.id} dm={d} spaceId={space.id} current={is('dmId', d.id)} />
          ))}
        </Section>
      </div>
      <SideCard />
    </aside>
  );
}

function NavRow({ to, current, strong, icon, name, end, dm }: { to: string; current: boolean; strong?: boolean; icon: ReactNode; name: string; end?: ReactNode; dm?: boolean }) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={[sideRow.row, dm && sideRow.dm, !current && strong && sideRow.strong].filter(Boolean).join(' ')}
    >
      {icon}
      <span className={sideRow.name}>{name}</span>
      {end}
    </Link>
  );
}

function DmRow({ dm, spaceId, current }: { dm: Dm; spaceId: string; current: boolean }) {
  const meId = useWorkspace((x) => x.me.id);
  const name = useDmName();
  return (
    <NavRow
      dm
      to={spaceDmPath(spaceId, dm.id)}
      current={current}
      strong={dm.unread > 0}
      icon={<DmFace dm={dm} meId={meId} size={20} />}
      name={name(dm)}
      end={!current && <Badge count={dm.unread} />}
    />
  );
}

function Section({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <SideHeading open={open} onToggle={() => setOpen(!open)} label={label} action={action} />
      {open && children}
    </>
  );
}
