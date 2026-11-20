import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { useWorkspace, type Channel } from '../../matrix';
import { IconButton } from '../../ui';
import { HashIcon, LockIcon, SidebarIcon } from '../icons';
import { channelPath, fallbackSpace, homeChannel, spaceHome } from '../places';
import { rememberPlace } from '../prefs';
import { noStoredTabs } from '../registry';
import { AppStart } from './AppStart';
import { ChannelTabs } from './ChannelTabs';
import { ConnectionBanner } from './ConnectionBanner';
import { NotAvailable } from './NotAvailable';
import { Rail } from './Rail';
import s from './Shell.module.css';
import { Sidebar } from './Sidebar';

/** Everything behind sign-in. The URL is the navigation state (D-19). */
export function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const starting = useWorkspace((x) => x.connection === 'starting');
  if (starting) return <AppStart />;
  return (
    <Routes>
      <Route index element={<HomeRedirect />} />
      <Route path="w/:spaceId" element={<SpaceRedirect onSignOut={onSignOut} />} />
      <Route path="w/:spaceId/c/:channelId" element={<Shell onSignOut={onSignOut} />} />
      <Route path="*" element={<Shell onSignOut={onSignOut} />} />
    </Routes>
  );
}

function HomeRedirect() {
  const home = useWorkspace((x) => homeChannel(x)?.id);
  const spaceId = useWorkspace((x) => homeChannel(x)?.spaceId);
  if (!home || !spaceId) return <Navigate to="/unavailable" replace />;
  return <Navigate to={channelPath(spaceId, home)} replace />;
}

function SpaceRedirect({ onSignOut }: { onSignOut: () => void }) {
  const { spaceId = '' } = useParams();
  const home = useWorkspace((x) => spaceHome(x, spaceId)?.id);
  if (!home) return <Shell onSignOut={onSignOut} />;
  return <Navigate to={channelPath(spaceId, home)} replace />;
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { spaceId, channelId } = useParams();
  const spaces = useWorkspace((x) => x.spaces);
  const channel = useWorkspace((x) => (spaceId && channelId ? x.channels[spaceId]?.find((c) => c.id === channelId) : undefined));
  const space = channel ? spaces.find((x) => x.id === channel.spaceId) : fallbackSpace(spaces, spaceId);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (channel) rememberPlace(channel.spaceId, channel.id);
  }, [channel]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <div className={[s.shell, drawer && s.drawerOpen].filter(Boolean).join(' ')}>
      <Rail activeSpaceId={space?.id} onSignOut={onSignOut} />
      {space && <Sidebar space={space} activeChannelId={channel?.id} onNavigate={() => setDrawer(false)} />}
      <div className={s.scrim} aria-hidden="true" onClick={() => setDrawer(false)} />
      <main className={s.main}>
        <ConnectionBanner />
        {channel ? (
          <ChannelPage channel={channel} drawer={drawer} onToggleDrawer={() => setDrawer(!drawer)} />
        ) : (
          <NotAvailable />
        )}
      </main>
    </div>
  );
}

function ChannelPage({ channel, drawer, onToggleDrawer }: { channel: Channel; drawer: boolean; onToggleDrawer: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <header className={s.header}>
        <IconButton
          className={s.drawerToggle}
          label={t('shell.sidebar.toggle')}
          icon={<SidebarIcon />}
          aria-expanded={drawer}
          onClick={onToggleDrawer}
        />
        <h1 className={s.channelName}>
          {channel.private ? <LockIcon size={18} strokeWidth={2.1} /> : <HashIcon size={18} strokeWidth={2.1} />}
          <span>{channel.name}</span>
        </h1>
      </header>
      <ChannelTabs key={channel.id} channelId={channel.id} stored={noStoredTabs} />
    </>
  );
}
