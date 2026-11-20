import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useWorkspace, type WorkspaceSnapshot } from '../../matrix';
import { EmptyChannelAddPeople } from '../channels/ChannelMenus';
import { ComposerProvider } from '../composer/context';
import { DmIntro } from '../people/DmIntro';
import { useDmName } from '../people/names';
import { ThreadPanel } from '../thread/ThreadPanel';
import { useOpenThread, useThreadNav } from '../thread/useThread';
import { Composer } from './Composer';
import { Timeline } from './Timeline';
import { TypingIndicator } from './TypingIndicator';
import s from './Timeline.module.css';

function findChannel(snapshot: WorkspaceSnapshot, channelId: string) {
  for (const list of Object.values(snapshot.channels)) {
    const found = list.find((c) => c.id === channelId);
    if (found) return found;
  }
  return undefined;
}

function ChannelPane({ channelId }: { channelId: string }) {
  const store = useStore();
  const timeline = useWorkspace((snap) => snap.timelines[channelId]);
  const channelName = useWorkspace((snap) => findChannel(snap, channelId)?.name);
  // A DM's room id works as a channel id (D-24); it reads its name from the people in it.
  const dm = useWorkspace((snap) => (channelName === undefined ? snap.dms.find((d) => d.id === channelId) : undefined));
  const dmName = useDmName();
  const name = channelName ?? (dm ? dmName(dm) : '');
  const meId = useWorkspace((snap) => snap.me.id);
  const [unreadAtOpen] = useState(() => {
    const snap = store.getSnapshot();
    return findChannel(snap, channelId)?.unread ?? snap.dms.find((d) => d.id === channelId)?.unread ?? 0;
  });

  useEffect(() => {
    store.openTimeline(channelId);
  }, [store, channelId]);

  const threadId = useOpenThread();
  const threads = useThreadNav();

  // The thread panel sits beside <main> in the shell row (full height, its own header), so it is portalled there.
  const viewRef = useRef<HTMLDivElement>(null);
  const [row, setRow] = useState<HTMLElement | null | undefined>(undefined);
  useLayoutEffect(() => {
    setRow(viewRef.current?.closest('main')?.parentElement ?? null);
  }, []);

  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const measure = () => setDockHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <ComposerProvider>
      <div ref={viewRef} className={s.view} style={{ '--dock-h': `${dockHeight}px` } as CSSProperties}>
        <Timeline
          channelId={channelId}
          channelName={name}
          timeline={timeline}
          meId={meId}
          unreadAtOpen={unreadAtOpen}
          onOpenThread={threads.open}
          intro={dm && <DmIntro dm={dm} />}
          emptyAction={!dm && <EmptyChannelAddPeople channelId={channelId} />}
        />
        <div className={s.floor}>
          <TypingIndicator channelId={channelId} />
        </div>
        <div className={s.dockSlot} ref={dockRef}>
          <Composer channelId={channelId} channelName={name} isDm={!!dm} />
        </div>
      </div>
      {threadId && row !== undefined && (
        <Portal into={row}>
          <ThreadPanel key={threadId} channelId={channelId} channelName={name} rootId={threadId} onClose={threads.close} />
        </Portal>
      )}
    </ComposerProvider>
  );
}

function Portal({ into, children }: { into: HTMLElement | null; children: ReactNode }) {
  return into ? createPortal(children, into) : children;
}

export function ChannelView({ channelId }: { channelId: string }) {
  return <ChannelPane key={channelId} channelId={channelId} />;
}
