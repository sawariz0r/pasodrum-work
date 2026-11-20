// DMs (Batch C DMs / DMEmpty / ClientDMs): every DM, newest first, in a 340px column; the conversation beside it.
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useWorkspace, type Dm } from '../../matrix';
import { Badge, IconButton } from '../../ui';
import { DmFace, Face, others } from '../people/Face';
import { useDmName, useShowExternal } from '../people/names';
import { useNewMessage } from '../people/NewMessage';
import { useProfileCard } from '../people/ProfileCardContext';
import { dmPath } from '../places';
import { noStoredTabs } from '../registry';
import { ChannelTabs } from '../shell/ChannelTabs';
import { ChevronDownIcon, ComposeIcon } from '../shell/icons';
import { DrawerToggle } from '../shell/Drawer';
import shell from '../shell/Shell.module.css';
import { useListTime } from './lists';
import s from './Pages.module.css';
import { previewText } from './Preview';

export function DmsColumn({ activeId }: { activeId?: string }) {
  const { t } = useTranslation();
  const newMessage = useNewMessage();
  const dms = useWorkspace((x) => x.dms);
  return (
    <aside aria-label={t('shell.sidebar.directMessages')} className={s.column}>
      <div className={s.columnHead}>
        <h1 className={s.columnTitle}>{t('shell.sidebar.directMessages')}</h1>
        <IconButton outline label={t('shell.sidebar.newMessage')} icon={<ComposeIcon />} onClick={newMessage} />
      </div>
      <div className={s.columnList}>
        {dms.map((dm) => (
          <DmRow key={dm.id} dm={dm} current={dm.id === activeId} />
        ))}
      </div>
    </aside>
  );
}

function DmRow({ dm, current }: { dm: Dm; current: boolean }) {
  const { t } = useTranslation();
  const time = useListTime();
  const name = useDmName();
  const showExternal = useShowExternal();
  const meId = useWorkspace((x) => x.me.id);
  const last = useWorkspace((x) => x.timelines[dm.id]?.messages.findLast((m) => m.kind !== 'system')) ?? dm.last;
  const unread = dm.unread > 0 && !current;
  const group = others(dm, meId).length > 1;
  let preview = '';
  if (last) {
    const text = previewText(last);
    if (last.sender.id === meId) preview = t('pages.dms.you', { text });
    else if (group) preview = t('pages.dms.from', { name: last.sender.name.split(/\s+/)[0], text });
    else preview = text;
  }
  return (
    <Link to={dmPath(dm.id)} className={[s.lrow, s.dmRow, unread && s.unread].filter(Boolean).join(' ')} aria-current={current ? 'page' : undefined}>
      <DmFace dm={dm} meId={meId} showExternal={showExternal} />
      <span className={s.rowMain}>
        <span className={s.rowTop}>
          <span className={s.rowName}>{name(dm)}</span>
          <span className={s.time}>{time(last?.ts ?? dm.lastTs)}</span>
        </span>
        {(preview || unread) && (
          <span className={s.dmPreview}>
            <span>{preview}</span>
            {unread && <Badge count={dm.unread} />}
          </span>
        )}
      </span>
    </Link>
  );
}

/** A DM: its header (name opens the profile card for a 1:1) and the same conversation view as a channel. */
export function DmConversation({ dmId }: { dmId: string }) {
  const dm = useWorkspace((x) => x.dms.find((d) => d.id === dmId));
  const meId = useWorkspace((x) => x.me.id);
  const name = useDmName();
  const showExternal = useShowExternal();
  const card = useProfileCard();
  const title = useRef<HTMLButtonElement>(null);
  if (!dm) return null;
  const list = others(dm, meId);
  const single = list.length === 1 ? list[0] : undefined;

  return (
    <>
      <header className={`${shell.header} ${s.dmHeader}`}>
        <DrawerToggle />
        {single ? (
          <h1 className={s.dmHeading}>
            <button
              ref={title}
              type="button"
              className={s.dmTitle}
              aria-haspopup="dialog"
              onClick={() => title.current && card.open(single.id, title.current)}
            >
              <Face person={single} size={26} />
              <span>{single.name}</span>
              <ChevronDownIcon size={15} strokeWidth={2.2} />
            </button>
          </h1>
        ) : (
          <h1 className={s.dmTitle}>
            <DmFace dm={dm} meId={meId} size={20} showExternal={showExternal} />
            <span>{name(dm)}</span>
          </h1>
        )}
      </header>
      <ChannelTabs key={dm.id} channelId={dm.id} stored={noStoredTabs} />
    </>
  );
}
