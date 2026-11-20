import { useEffect, useState } from 'react';
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

  return (
    <ComposerProvider>
      <div className={s.view}>
        <Timeline channelId={channelId} channelName={name} timeline={timeline} meId={meId} unreadAtOpen={unreadAtOpen} />
        <div className={s.floor}>
          <TypingIndicator channelId={channelId} />
        </div>
        <Composer channelId={channelId} channelName={name} />
      </div>
    </ComposerProvider>
  );
}

export function ChannelView({ channelId }: { channelId: string }) {
  return <ChannelPane key={channelId} channelId={channelId} />;
}
