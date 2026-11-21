// Activity (Batch C Activity / Mentions / ActivityEmpty): mentions of you and replies to you, across every space.
// A row opens the message in its channel (or thread) beside the list and marks it read; the list keeps its order while open.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type ActivityItem, type WorkspaceSnapshot } from '../../matrix';
import { HashIcon, LockIcon } from '../icons';
import { Face } from '../people/Face';
import { useDmName } from '../people/names';
import { AtIcon, BellIcon, ReplyKindIcon, ThreadIcon } from '../shell/icons';
import { useListTime, useStableOrder } from './lists';
import s from './Pages.module.css';
import { previewParts } from './Preview';
import { useHiddenText } from '../security/Gate';

type Filter = 'all' | 'mentions' | 'replies';
const filters: Filter[] = ['all', 'mentions', 'replies'];

export function ActivityColumn({ selectedId }: { selectedId?: string }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const activity = useWorkspace((x) => x.activity);
  const [filter, setFilter] = useState<Filter>('all');
  const ordered = useStableOrder(activity, (a) => a.id);
  const shown = ordered.filter((a) => filter === 'all' || (filter === 'mentions' ? a.kind === 'mention' : a.kind === 'reply'));

  const open = (item: ActivityItem) => {
    if (item.unread) store.markActivityRead(item.id);
    const q = new URLSearchParams({ item: item.id });
    if (item.threadRootId) q.set('thread', item.threadRootId);
    navigate(`/activity?${q}`);
  };

  return (
    <aside aria-label={t('shell.rail.activity')} className={s.column}>
      <div className={s.columnHead}>
        <h1 className={s.columnTitle}>{t('shell.rail.activity')}</h1>
      </div>
      <div role="radiogroup" aria-label={t('shell.rail.activity')} className={s.filters}>
        {filters.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={f === filter} className={s.filter} onClick={() => setFilter(f)}>
            {t(`pages.activity.${f}`)}
          </button>
        ))}
      </div>
      <div className={s.columnList}>
        {shown.length === 0 ? (
          <div className={s.columnEmpty}>
            <div className={s.columnEmptyIcon}>
              <BellIcon size={24} strokeWidth={1.8} />
            </div>
            <h2 className={s.emptyTitle}>{t('pages.activity.empty')}</h2>
          </div>
        ) : (
          shown.map((item) => <Row key={item.id} item={item} selected={item.id === selectedId} onOpen={() => open(item)} />)
        )}
      </div>
    </aside>
  );
}

function placeOf(x: WorkspaceSnapshot, roomId: string) {
  for (const list of Object.values(x.channels)) {
    const c = list.find((ch) => ch.id === roomId);
    if (c) return c;
  }
  return x.dms.find((d) => d.id === roomId);
}

function Row({ item, selected, onOpen }: { item: ActivityItem; selected: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const time = useListTime();
  const dmName = useDmName();
  const place = useWorkspace((x) => placeOf(x, item.channelId));
  const { message } = item;
  const quote = message.replyTo;
  const unread = item.unread && !selected;
  // M6: no text of an encrypted conversation before this device is confirmed.
  const hidden = useHiddenText(item.channelId);
  const where = !place ? '' : 'people' in place ? dmName(place) : place.name;
  const whereIcon = item.threadRootId ? <ThreadIcon size={12} strokeWidth={2.2} /> : place && 'private' in place && place.private ? <LockIcon size={12} strokeWidth={2.2} /> : <HashIcon size={12} strokeWidth={2.2} />;

  return (
    <button
      type="button"
      className={[s.lrow, unread && s.unread].filter(Boolean).join(' ')}
      aria-current={selected ? 'true' : undefined}
      onClick={onOpen}
    >
      <span className={s.actFace}>
        <Face person={message.sender} size={36} />
        <span role="img" aria-label={t(item.kind === 'mention' ? 'pages.activity.mention' : 'pages.activity.reply')} className={[s.kind, item.kind === 'mention' && s.kindMention].filter(Boolean).join(' ')}>
          {item.kind === 'mention' ? <AtIcon /> : <ReplyKindIcon />}
        </span>
      </span>
      <span className={s.rowMain}>
        <span className={s.rowTop}>
          <span className={s.rowName}>{message.sender.name}</span>
          <span className={s.time}>{time(message.ts)}</span>
          {unread && <span role="img" aria-label={t('pages.activity.unread')} className={s.dot} />}
        </span>
        {where && (
          <span className={s.where}>
            {whereIcon}
            <span>{where}</span>
          </span>
        )}
        {item.kind === 'reply' && quote && !hidden && <span className={s.quote}>{quote.body}</span>}
        <span className={[s.actText, s.clamp2, hidden && s.quietText].filter(Boolean).join(' ')}>{hidden ? t('security.unavailable') : previewParts(message)}</span>
      </span>
    </button>
  );
}

