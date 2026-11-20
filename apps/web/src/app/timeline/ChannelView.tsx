import { useCallback, useEffect } from 'react';
import { useStore, useWorkspace, type WorkspaceSnapshot } from '../../matrix';
import { Composer } from './Composer';
import { Timeline } from './Timeline';
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

  useEffect(() => {
    store.openTimeline(channelId);
  }, [store, channelId]);

  const send = useCallback((body: string) => store.sendText(channelId, body), [store, channelId]);

  return (
    <div className={s.view}>
      <Timeline channelId={channelId} channelName={name} timeline={timeline} meId={meId} />
      <Composer channelName={name} onSend={send} />
    </div>
  );
}

export function ChannelView({ channelId }: { channelId: string }) {
  return <ChannelPane key={channelId} channelId={channelId} />;
}
