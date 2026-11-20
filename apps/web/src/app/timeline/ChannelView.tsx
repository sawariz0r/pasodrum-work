import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore, useWorkspace, type WorkspaceSnapshot } from '../../matrix';
import { ComposerProvider } from '../composer/context';
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
  const name = useWorkspace((snap) => findChannel(snap, channelId)?.name ?? '');
  const meId = useWorkspace((snap) => snap.me.id);
  const [unreadAtOpen] = useState(() => findChannel(store.getSnapshot(), channelId)?.unread ?? 0);

  useEffect(() => {
    store.openTimeline(channelId);
  }, [store, channelId]);

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
      <div className={s.view} style={{ '--dock-h': `${dockHeight}px` } as CSSProperties}>
        <Timeline channelId={channelId} channelName={name} timeline={timeline} meId={meId} unreadAtOpen={unreadAtOpen} />
        <div className={s.floor}>
          <TypingIndicator channelId={channelId} />
        </div>
        <div className={s.dockSlot} ref={dockRef}>
          <Composer channelId={channelId} channelName={name} />
        </div>
      </div>
    </ComposerProvider>
  );
}

export function ChannelView({ channelId }: { channelId: string }) {
  return <ChannelPane key={channelId} channelId={channelId} />;
}
