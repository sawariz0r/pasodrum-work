import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useWorkspace, type WorkspaceSnapshot } from '../../matrix';
import { EmptyChannelAddPeople } from '../channels/ChannelMenus';
import { ComposerProvider } from '../composer/context';
import { DmIntro } from '../people/DmIntro';
import { useDmName } from '../people/names';
import { LockIcon } from '../icons';
import { ConfirmGate, KeyGate, useGate } from '../security/Gate';
import { PrivacyLine, usePrivacyText } from '../security/Privacy';
import { useAssistantShown } from '../shell/RightPanel';
import { ThreadPanel } from '../thread/ThreadPanel';
import { useOpenThread, useThreadNav } from '../thread/useThread';
import { ArchivedBar, useArchived } from './ArchivedBar';
import { Composer } from './Composer';
import { Timeline, TimelineSkeleton } from './Timeline';
import { TypingIndicator } from './TypingIndicator';
import s from './Timeline.module.css';

function findChannel(snapshot: WorkspaceSnapshot, channelId: string) {
  for (const list of Object.values(snapshot.channels)) {
    const found = list.find((c) => c.id === channelId);
    if (found) return found;
  }
  return undefined;
}

/** M6: an encrypted conversation shows the confirm card (unconfirmed device) or the key card (no recovery key yet) instead (RulesM6). */
function ChannelPane({ channelId }: { channelId: string }) {
  const gate = useGate(channelId);
  // After confirming, the card fades and the conversation fades in.
  const [gated, setGated] = useState(gate !== 'open');
  if (gate !== 'open' && !gated) setGated(true);
  if (gate === 'gate') return <ConfirmGate />;
  if (gate === 'key') return <KeyGate />;
  if (gate === 'wait') return <TimelineSkeleton />;
  return <Conversation channelId={channelId} fadeIn={gated} />;
}

function Conversation({ channelId, fadeIn }: { channelId: string; fadeIn: boolean }) {
  const store = useStore();
  const timeline = useWorkspace((snap) => snap.timelines[channelId]);
  const channel = useWorkspace((snap) => findChannel(snap, channelId));
  const channelName = channel?.name;
  // A DM's room id works as a channel id (D-24); it reads its name from the people in it.
  const dm = useWorkspace((snap) => (channelName === undefined ? snap.dms.find((d) => d.id === channelId) : undefined));
  const dmName = useDmName();
  const name = channelName ?? (dm ? dmName(dm) : '');
  const privacy = usePrivacyText(channel ?? dm);
  const emptyAction = !dm && <EmptyChannelAddPeople channelId={channelId} />;
  // D-38: the system sender's DM is one-way: no composer, no intro, no privacy line.
  // SIDE-02: an encrypted conversation's start says who can read it (PrivateDM, PrivateGroupDM, PrivateChannel).
  const start =
    privacy &&
    !dm?.system &&
    (dm ? (
      <DmIntro dm={dm}>
        <PrivacyLine text={privacy} />
      </DmIntro>
    ) : (
      <div className={s.empty}>
        <div className={s.emptyIcon}>
          <LockIcon size={28} strokeWidth={2} />
        </div>
        <h2 className={s.emptyTitle}>{name}</h2>
        <PrivacyLine text={privacy} />
        {!timeline?.messages.length && emptyAction && <div className={s.emptyAction}>{emptyAction}</div>}
      </div>
    ));
  const meId = useWorkspace((snap) => snap.me.id);
  const archived = useArchived(channelId);
  const [unreadAtOpen] = useState(() => {
    const snap = store.getSnapshot();
    return findChannel(snap, channelId)?.unread ?? snap.dms.find((d) => d.id === channelId)?.unread ?? 0;
  });

  useEffect(() => {
    store.openTimeline(channelId);
  }, [store, channelId]);

  const threadId = useOpenThread();
  const threads = useThreadNav();
  const assistantShown = useAssistantShown();

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
      <div ref={viewRef} className={[s.view, fadeIn && s.fadeIn].filter(Boolean).join(' ')} style={{ '--dock-h': `${dockHeight}px` } as CSSProperties}>
        <Timeline
          channelId={channelId}
          channelName={name}
          timeline={timeline}
          meId={meId}
          unreadAtOpen={unreadAtOpen}
          onOpenThread={threads.open}
          intro={dm && !dm.system && <DmIntro dm={dm} />}
          start={start}
          emptyAction={emptyAction}
        />
        <div className={s.floor}>
          <TypingIndicator channelId={channelId} />
        </div>
        <div className={s.dockSlot} ref={dockRef}>
          {archived ? <ArchivedBar archived={archived} /> : !dm?.system && <Composer channelId={channelId} channelName={name} isDm={!!dm} />}
        </div>
      </div>
      {threadId && row !== undefined && !assistantShown && (
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
