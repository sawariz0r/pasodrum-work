// Threads (Batch C Threads / ThreadsEmpty): threads you follow in this space, unread first; the order holds while open.
import { useTranslation } from 'react-i18next';
import { useWorkspace, type Channel, type Space, type ThreadSummary } from '../../matrix';
import { HashIcon, LockIcon } from '../icons';
import { Face } from '../people/Face';
import { DrawerToggle } from '../shell/Drawer';
import { HeaderEnd } from '../shell/HeaderEnd';
import { useOpenThread, useThreadNav } from '../thread/useThread';
import { ThreadIcon } from '../shell/icons';
import { useListTime, useStableOrder } from './lists';
import s from './Pages.module.css';
import { previewParts, previewText } from './Preview';
import { useHiddenText } from '../security/Gate';

const none: Channel[] = [];

export function ThreadsView({ space }: { space: Space }) {
  const { t } = useTranslation();
  const channels = useWorkspace((x) => x.channels[space.id] ?? none);
  const all = useWorkspace((x) => x.threads);
  const mine = all.filter((th) => channels.some((c) => c.id === th.channelId));
  const sorted = [...mine].sort((a, b) => Number(b.unread) - Number(a.unread) || b.lastTs - a.lastTs);
  const threads = useStableOrder(sorted, (th) => th.rootId);
  const openId = useOpenThread();
  const nav = useThreadNav();

  return (
    <div className={s.page}>
      <header className={s.pageHeader}>
        <DrawerToggle />
        <ThreadIcon size={18} strokeWidth={2.1} />
        <h1 className={s.pageTitle}>{t('shell.sidebar.threads')}</h1>
        <HeaderEnd />
      </header>
      <div className={s.pageBody}>
        {threads.length === 0 ? (
          <div className={s.pageEmpty}>
            <div className={s.pageEmptyIcon}>
              <ThreadIcon size={30} strokeWidth={1.8} />
            </div>
            <h2 className={s.emptyTitle}>{t('pages.threads.empty')}</h2>
          </div>
        ) : (
          threads.map((th) => <Card key={th.rootId} thread={th} channel={channels.find((c) => c.id === th.channelId)!} selected={th.rootId === openId} onOpen={() => nav.open(th.rootId)} />)
        )}
      </div>
    </div>
  );
}

function Card({ thread, channel, selected, onOpen }: { thread: ThreadSummary; channel: Channel; selected: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const time = useListTime();
  const { root, lastReply } = thread;
  const unread = thread.unread && !selected;
  // M6: messages this device can't open, or any text of an encrypted channel before it is confirmed.
  const hidden = useHiddenText(thread.channelId);
  const unavailable = t('security.unavailable');
  const shown = (m: typeof root) => !hidden && m.kind !== 'undecryptable';
  return (
    <button
      type="button"
      className={[s.card, unread && s.unread, selected && s.selected].filter(Boolean).join(' ')}
      aria-current={selected ? 'true' : undefined}
      onClick={onOpen}
    >
      <div className={s.cardWhere}>
        {channel.private ? <LockIcon size={14} strokeWidth={2.2} /> : <HashIcon size={14} strokeWidth={2.2} />}
        <span className={s.cardChannel}>{channel.name}</span>
        <span className={s.time}>{time(thread.lastTs)}</span>
        {unread && <span role="img" aria-label={t('pages.activity.unread')} className={s.dot} />}
      </div>
      <div className={s.cardBody}>
        <Face person={root.sender} size={32} />
        <div className={s.rowMain}>
          <div className={s.cardName}>{root.sender.name}</div>
          <div className={[s.cardText, s.clamp2, !shown(root) && s.quietText].filter(Boolean).join(' ')}>{shown(root) ? previewParts(root) : unavailable}</div>
          {lastReply && (
            <div className={s.cardLast}>
              <Face person={lastReply.sender} size={20} />
              <span className={s.lastName}>{lastReply.sender.name}</span>
              <span className={[s.lastText, !shown(lastReply) && s.quietText].filter(Boolean).join(' ')}>{shown(lastReply) ? previewText(lastReply) : unavailable}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
