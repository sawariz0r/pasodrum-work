// Thread panel (ThreadNew, ThreadLoading, ThreadError, ThreadComposer, ClientThread; Window1024, Window800).
// Beside the conversation from 1000px; under 1000px it replaces the conversation, with a back arrow.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type Message, type Timeline as TimelineData, type WorkspaceSnapshot } from '../../matrix';
import { IconButton } from '../../ui';
import { CloseIcon } from '../../ui/icons';
import { Composer } from '../composer/Composer';
import { ComposerProvider } from '../composer/context';
import { Timeline, type ThreadMode } from '../timeline/Timeline';
import tl from '../timeline/Timeline.module.css';
import { BackIcon } from './icons';
import s from './Thread.module.css';

/** The contract has no failure flag on timelines yet; matrix/ may add one (see M3-03 outcome). */
type ThreadTimeline = TimelineData & { failed?: boolean };

/** The thread timeline starts with the root; until it has loaded, show the root from the channel or the followed threads. */
function findRoot(snap: WorkspaceSnapshot, channelId: string, rootId: string): Message | undefined {
  const first = snap.threadTimelines[rootId]?.messages[0];
  return (
    (first?.id === rootId ? first : undefined) ??
    snap.timelines[channelId]?.messages.find((m) => m.id === rootId) ??
    snap.threads.find((x) => x.rootId === rootId)?.root
  );
}

type Props = { channelId: string; channelName: string; rootId: string; onClose: () => void };

export function ThreadPanel({ channelId, channelName, rootId, onClose }: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const raw = useWorkspace((snap) => snap.threadTimelines[rootId]) as ThreadTimeline | undefined;
  const root = useWorkspace((snap) => findRoot(snap, channelId, rootId));
  const meId = useWorkspace((snap) => snap.me.id);

  useEffect(() => {
    store.openThread(channelId, rootId);
  }, [store, channelId, rootId]);

  // The root leads the thread timeline; it is shown on top, the rest are the replies.
  const timeline = useMemo<TimelineData | undefined>(
    () => (raw && raw.messages[0]?.id === rootId ? { ...raw, messages: raw.messages.slice(1) } : raw),
    [raw, rootId],
  );
  const failed = !!raw?.failed;
  const thread = useMemo<ThreadMode>(
    () => ({ rootId, root, failed, onRetry: () => store.openThread(channelId, rootId) }),
    [rootId, root, failed, store, channelId],
  );

  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      // Esc belongs to whatever is open on top (viewer, menus, profile card, pickers).
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
      <aside className={s.panel} aria-label={t('thread.title')}>
        <header className={s.header}>
          <IconButton className={s.back} label={t('thread.back', { channel: channelName })} icon={<BackIcon />} onClick={onClose} />
          <h2 className={s.title}>
            <span>{t('thread.title')}</span>
            <span className={s.channel}>{t('common.channelName', { name: channelName })}</span>
          </h2>
          <IconButton className={s.close} label={t('thread.close')} icon={<CloseIcon />} onClick={onClose} />
        </header>
        <div className={tl.view} style={{ '--dock-h': `${dockHeight}px` } as CSSProperties}>
          <Timeline channelId={channelId} channelName={channelName} timeline={timeline} meId={meId} thread={thread} />
          <div className={tl.dockSlot} ref={dockRef}>
            <Composer channelId={channelId} channelName={channelName} threadRootId={rootId} />
          </div>
        </div>
      </aside>
    </ComposerProvider>
  );
}
