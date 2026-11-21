import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router';
import { useWorkspace, type Channel, type Space } from '../../matrix';
import { useDraftsFor } from '../drafts';
import { BrowseChannels } from '../channels/BrowseChannels';
import { ChannelHeaderBar } from '../channels/ChannelMenus';
import { ChannelsProvider } from '../channels/ChannelsProvider';
import { ActivityColumn } from '../pages/Activity';
import { DmConversation, DmsColumn, DmsEmpty } from '../pages/Dms';
import { DraftsView } from '../pages/Drafts';
import { FindProvider } from '../find/Switcher';
import { SearchPage } from '../find/SearchPage';
import { ThreadsView } from '../pages/Threads';
import { NewMessageProvider } from '../people/NewMessage';
import { ProfileCardProvider } from '../people/ProfileCard';
import { channelPath, dmPath, fallbackSpace, homeChannel, spaceHome } from '../places';
import { rememberPlace } from '../prefs';
import { ThreadPanel } from '../thread/ThreadPanel';
import { useOpenThread, useThreadNav } from '../thread/useThread';
import { noStoredTabs } from '../registry';
import { useRegistry } from '../RegistryProvider';
import { ToastProvider } from '../toast';
import { AppStart } from './AppStart';
import { ChannelTabs } from './ChannelTabs';
import { ConnectionBanner } from './ConnectionBanner';
import { DrawerContext, DrawerToggle, useNarrow } from './Drawer';
import { NotAvailable } from './NotAvailable';
import { Rail, type Section } from './Rail';
import s from './Shell.module.css';
import { Sidebar } from './Sidebar';

const SignOut = createContext<() => void>(() => {});

/** Everything behind sign-in. The URL is the navigation state (D-19, D-23). */
export function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const starting = useWorkspace((x) => x.connection === 'starting');
  const meId = useWorkspace((x) => x.me.id);
  const { routes } = useRegistry();
  useDraftsFor(meId);
  if (starting) return <AppStart />;
  return (
    <SignOut.Provider value={onSignOut}>
      <ToastProvider>
      <FindProvider>
      <ProfileCardProvider>
        <NewMessageProvider>
          <ChannelsProvider>
            <Routes>
              <Route index element={<HomeRedirect />} />
              <Route path="w/:spaceId" element={<SpaceRedirect />} />
              <Route path="w/:spaceId/c/:channelId" element={<ChannelRoute />} />
              <Route path="w/:spaceId/channels" element={<BrowseRoute />} />
              <Route path="w/:spaceId/dm/:dmId" element={<SpaceDmRoute />} />
              <Route path="threads" element={<SpaceViewRoute view="threads" />} />
              <Route path="drafts" element={<SpaceViewRoute view="drafts" />} />
              <Route path="dms" element={<DmsRoute />} />
              <Route path="dms/:dmId" element={<DmsRoute />} />
              <Route path="activity" element={<ActivityRoute />} />
              <Route path="search" element={<SearchRoute />} />
              {routes.map((r) => (
                <Route key={r.path} path={r.path} element={<Frame section="feature" column={null}>{r.element}</Frame>} />
              ))}
              <Route path="*" element={<UnknownRoute />} />
            </Routes>
          </ChannelsProvider>
        </NewMessageProvider>
      </ProfileCardProvider>
      </FindProvider>
      </ToastProvider>
    </SignOut.Provider>
  );
}

function HomeRedirect() {
  const home = useWorkspace((x) => homeChannel(x)?.id);
  const spaceId = useWorkspace((x) => homeChannel(x)?.spaceId);
  if (!home || !spaceId) return <Navigate to="/unavailable" replace />;
  // Draws the channel while redirecting: a bare <Navigate> commits an empty frame first.
  return (
    <>
      <Navigate to={channelPath(spaceId, home)} replace />
      <ChannelRoute at={{ spaceId, channelId: home }} />
    </>
  );
}

function SpaceRedirect() {
  const { spaceId = '' } = useParams();
  const home = useWorkspace((x) => spaceHome(x, spaceId)?.id);
  if (!home) return <UnknownRoute />;
  return <Navigate to={channelPath(spaceId, home)} replace />;
}

function useFallbackSpace(spaceId?: string): Space | undefined {
  const spaces = useWorkspace((x) => x.spaces);
  return fallbackSpace(spaces, spaceId);
}

function ChannelRoute({ at }: { at?: { spaceId: string; channelId: string } }) {
  const params = useParams();
  const { spaceId, channelId } = at ?? params;
  const spaces = useWorkspace((x) => x.spaces);
  const channel = useWorkspace((x) => (spaceId && channelId ? x.channels[spaceId]?.find((c) => c.id === channelId) : undefined));
  const fallback = useFallbackSpace(spaceId);
  const space = channel ? spaces.find((x) => x.id === channel.spaceId) : fallback;

  useEffect(() => {
    if (channel) rememberPlace(channel.spaceId, channel.id);
  }, [channel]);

  return (
    <Frame section="home" space={space} column={space && <Sidebar space={space} active={channel ? { channelId: channel.id } : undefined} />}>
      {channel ? <ChannelPage channel={channel} /> : <NotAvailable />}
    </Frame>
  );
}

function BrowseRoute() {
  const { spaceId } = useParams();
  const fallback = useFallbackSpace(spaceId);
  const space = fallback?.id === spaceId ? fallback : undefined;
  return (
    <Frame section="home" space={fallback} column={fallback && <Sidebar space={fallback} />}>
      {space ? <BrowseChannels key={space.id} space={space} /> : <NotAvailable />}
    </Frame>
  );
}

function SpaceDmRoute() {
  const { spaceId, dmId } = useParams();
  const space = useFallbackSpace(spaceId);
  const known = useWorkspace((x) => x.dms.some((d) => d.id === dmId));
  return (
    <Frame section="home" space={space} column={space && <Sidebar space={space} active={known && dmId ? { dmId } : undefined} />}>
      {known && dmId ? <DmConversation dmId={dmId} /> : <NotAvailable />}
    </Frame>
  );
}

function SpaceViewRoute({ view }: { view: 'threads' | 'drafts' }) {
  const [params] = useSearchParams();
  const space = useFallbackSpace(params.get('space') ?? undefined);
  const nav = useThreadNav();
  const rootId = useOpenThread();
  const open = useWorkspace((x) => (view === 'threads' && rootId ? x.threads.find((th) => th.rootId === rootId) : undefined));
  const channelName = useWorkspace((x) => (open ? x.channels[space?.id ?? '']?.find((c) => c.id === open.channelId)?.name : undefined));
  // Threads1024: the thread opens beside the list, as in a channel.
  const aside = open && channelName !== undefined && (
    <ThreadPanel key={open.rootId} channelId={open.channelId} channelName={channelName} rootId={open.rootId} onClose={nav.close} />
  );
  return (
    <Frame section="home" space={space} column={space && <Sidebar space={space} active={{ view }} />} aside={aside}>
      {!space ? <NotAvailable /> : view === 'threads' ? <ThreadsView space={space} /> : <DraftsView space={space} />}
    </Frame>
  );
}

function DmsRoute() {
  const params = useParams();
  const space = useFallbackSpace();
  const newest = useWorkspace((x) => x.dms[0]?.id);
  const narrow = useNarrow();
  // Draws the newest DM while redirecting to it: a bare <Navigate> commits an empty frame first.
  const redirect = !params.dmId && newest && !narrow ? newest : undefined;
  const dmId = params.dmId ?? redirect;
  const known = useWorkspace((x) => (dmId ? x.dms.some((d) => d.id === dmId) : false));
  const none = useWorkspace((x) => x.dms.length === 0);
  return (
    <>
      {redirect && <Navigate to={dmPath(redirect)} replace />}
      <Frame section="dms" space={space} column={<DmsColumn activeId={dmId} />} list={{ back: '/dms', detail: !!dmId }}>
        {known && dmId ? <DmConversation dmId={dmId} /> : dmId ? <NotAvailable /> : none ? <DmsEmpty /> : <HomePage />}
      </Frame>
    </>
  );
}

function ActivityRoute() {
  const [params] = useSearchParams();
  const space = useFallbackSpace();
  const itemId = params.get('item') ?? undefined;
  const item = useWorkspace((x) => (itemId ? x.activity.find((a) => a.id === itemId) : undefined));
  const channel = useWorkspace((x) => {
    if (!item) return undefined;
    for (const list of Object.values(x.channels)) {
      const c = list.find((ch) => ch.id === item.channelId);
      if (c) return c;
    }
    return undefined;
  });
  const isDm = useWorkspace((x) => !!item && x.dms.some((d) => d.id === item.channelId));
  return (
    <Frame section="activity" space={space} column={<ActivityColumn selectedId={item?.id} />} list={{ back: '/activity', detail: !!item }}>
      {channel ? <ChannelPage channel={channel} /> : isDm && item ? <DmConversation dmId={item.channelId} /> : <HomePage />}
    </Frame>
  );
}

function SearchRoute() {
  const space = useFallbackSpace();
  return (
    <Frame section="home" space={space} column={space && <Sidebar space={space} />}>
      <SearchPage />
    </Frame>
  );
}

function UnknownRoute() {
  const space = useFallbackSpace();
  return (
    <Frame section="home" space={space} column={space && <Sidebar space={space} />}>
      <NotAvailable />
    </Frame>
  );
}

/** The last channel, when a rail page has nothing picked. */
function HomePage() {
  const home = useWorkspace((x) => homeChannel(x));
  return home ? <ChannelPage channel={home} /> : <NotAvailable />;
}

/** Rail + the left column (sidebar or a rail page's list) + main. Below 1000px the column is a drawer. */
type FrameProps = {
  section: Section;
  space?: Space;
  column: ReactNode;
  children: ReactNode;
  /** Beside main (the thread panel in the Threads view). */
  aside?: ReactNode;
  /** Rail pages with a list column (DMs, Activity): at ≤800px the list and the open item take turns. */
  list?: { back: string; detail: boolean };
};

function Frame({ section, space, column, children, aside, list }: FrameProps) {
  const onSignOut = useContext(SignOut);
  const location = useLocation();
  // The drawer belongs to the page it was opened on: any navigation closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === location.key;
  const toggle = () => setOpenAt(open ? null : location.key);
  const threadOpen = useOpenThread() !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenAt(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <DrawerContext.Provider value={{ open, toggle, back: list?.back }}>
      <div
        className={[
          s.shell,
          open && s.drawerOpen,
          open && 'drawer-open',
          threadOpen && s.threadFold,
          threadOpen && 'thread-fold',
          list && s.listPage,
          list && (list.detail ? 'pane-detail' : 'pane-list'),
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Rail section={section} activeSpaceId={space?.id} onSignOut={onSignOut} />
        {column}
        <div className={s.scrim} aria-hidden="true" onClick={() => setOpenAt(null)} />
        <main className={s.main}>
          <ConnectionBanner />
          {children}
        </main>
        {aside}
      </div>
    </DrawerContext.Provider>
  );
}

function ChannelPage({ channel }: { channel: Channel }) {
  return (
    <>
      <header className={s.header}>
        <DrawerToggle />
        <ChannelHeaderBar channel={channel} />
      </header>
      <ChannelTabs key={channel.id} channelId={channel.id} stored={noStoredTabs} />
    </>
  );
}
