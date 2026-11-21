import { useEffect, useState } from 'react';
import { useStore, useWorkspace, type Message, type WorkspaceSnapshot } from '../../matrix';
import { Skeleton } from '../../ui';
import { PinIcon } from '../../app/icons';
import { useListTime } from '../../app/pages/lists';
import { PersonAvatar } from '../../app/timeline/PersonAvatar';
import { useT } from './strings';
import s from './Pins.module.css';

export function usePinsLabel() {
  return useT()('pins');
}

function canPinIn(x: WorkspaceSnapshot, channelId: string) {
  for (const list of Object.values(x.channels)) {
    const c = list.find((ch) => ch.id === channelId);
    if (c) return !!c.canPin;
  }
  return !!x.dms.find((d) => d.id === channelId)?.canPin;
}

const skeletons = ['22%', '16%', '26%'];

/** PinsTab: newest pin first; a row jumps to the message in Messages; Unpin on hover or focus. */
export function PinsTab({ channelId, jumpTo }: { channelId: string; jumpTo: (messageId: string) => void }) {
  const t = useT();
  const store = useStore();
  const listTime = useListTime();
  const canPin = useWorkspace((x) => canPinIn(x, channelId));
  // Pins made or removed elsewhere reach the loaded timeline first; fetch again when they change.
  const pinKey = useWorkspace((x) => (x.timelines[channelId]?.messages ?? []).filter((m) => m.pinned).map((m) => m.id).join(' '));
  const [reload, setReload] = useState(0);
  const [pins, setPins] = useState<Message[] | null>(null);

  useEffect(() => {
    let live = true;
    store.pins(channelId).then(
      (list) => live && setPins(list),
      () => live && setPins((p) => p ?? []),
    );
    return () => {
      live = false;
    };
  }, [store, channelId, pinKey, reload]);

  const unpin = (m: Message) => {
    setPins((p) => p?.filter((x) => x.id !== m.id) ?? null);
    store.unpin(channelId, m.id).catch(() => setReload((n) => n + 1));
  };

  return (
    <div className={s.pane} aria-busy={pins === null}>
      {pins === null &&
        skeletons.map((w, i) => (
          <div key={i} className={s.skel} aria-hidden="true">
            <Skeleton width={36} height={36} radius={9} />
            <div className={s.skelLines}>
              <Skeleton width={w} height={11} />
              <Skeleton width="74%" height={9} />
              <Skeleton width="38%" height={9} />
            </div>
          </div>
        ))}
      {pins?.map((m) => (
        <div key={m.id} className={s.card}>
          <button type="button" className={s.jump} onClick={() => jumpTo(m.id)}>
            <PersonAvatar size={36} person={m.sender} className={s.avatar} />
            <span className={s.main}>
              <span className={s.meta}>
                <span className={s.name}>{m.sender.name}</span>
                <time className={s.time} dateTime={new Date(m.ts).toISOString()}>
                  {listTime(m.ts)}
                </time>
              </span>
              <span className={s.text}>{m.body || m.media?.name}</span>
            </span>
          </button>
          {canPin && (
            <button type="button" className={s.unpin} onClick={() => unpin(m)}>
              {t('unpin')}
            </button>
          )}
        </div>
      ))}
      {pins?.length === 0 && (
        <div className={s.empty}>
          <div className={s.emptyIcon}>
            <PinIcon size={30} strokeWidth={1.8} />
          </div>
          <h2 className={s.emptyTitle}>{t('noPins')}</h2>
        </div>
      )}
    </div>
  );
}
