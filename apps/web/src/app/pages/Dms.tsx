// DMs (Batch C DMs / DMEmpty / ClientDMs): every DM, newest first, in a 340px column; the conversation beside it.
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useWorkspace, type Dm } from '../../matrix';
import { Badge, Button, IconButton } from '../../ui';
import { ChatIcon } from '../icons';
import { DmFace, Face, others, SystemFace } from '../people/Face';
import { useDmName } from '../people/names';
import { useNewMessage } from '../people/NewMessage';
import { useProfileCard } from '../people/ProfileCardContext';
import { dmPath } from '../places';
import { noStoredTabs } from '../registry';
import { ChannelTabs } from '../shell/ChannelTabs';
import { ChevronDownIcon, ComposeIcon } from '../shell/icons';
import { FindButton } from '../find/Switcher';
import { rememberRecent } from '../prefs';
import { useConversationScreen } from '../screenContext';
import { PrivacyLock, usePrivacyText } from '../security/Privacy';
import { DrawerToggle } from '../shell/Drawer';
import { HeaderEnd } from '../shell/HeaderEnd';
import shell from '../shell/Shell.module.css';
import { useListTime } from './lists';
import s from './Pages.module.css';
import { previewText } from './Preview';
import { useHiddenText } from '../security/Gate';

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
  const meId = useWorkspace((x) => x.me.id);
  const last = useWorkspace((x) => x.timelines[dm.id]?.messages.findLast((m) => m.kind !== 'system')) ?? dm.last;
  const unread = dm.unread > 0 && !current;
  const group = others(dm, meId).length > 1;
  let preview = '';
  // M6: the same quiet words as in the conversation (UndecryptableDM); none of its text before this device is confirmed.
  const hidden = useHiddenText(dm.id);
  const unavailable = !!last && (hidden || last.kind === 'undecryptable');
  if (unavailable) preview = t('security.unavailable');
  else if (last?.help) preview = t('security.helpCard.needs', { name: last.help.who.name });
  else if (last) {
    const text = previewText(last);
    if (last.sender.id === meId) preview = t('pages.dms.you', { text });
    else if (group) preview = t('pages.dms.from', { name: last.sender.name.split(/\s+/)[0], text });
    else preview = text;
  }
  return (
    <Link to={dmPath(dm.id)} className={[s.lrow, s.dmRow, unread && s.unread].filter(Boolean).join(' ')} aria-current={current ? 'page' : undefined}>
      <DmFace dm={dm} meId={meId} />
      <span className={s.rowMain}>
        <span className={s.rowTop}>
          <span className={s.rowName}>{name(dm)}</span>
          <span className={s.time}>{time(last?.ts ?? dm.lastTs)}</span>
        </span>
        {(preview || unread) && (
          <span className={s.dmPreview}>
            <span className={unavailable ? s.quietPreview : undefined}>{preview}</span>
            {unread && <Badge count={dm.unread} />}
          </span>
        )}
      </span>
    </Link>
  );
}

/** DmsEmpty: the DMs page with none yet, in place of a conversation. */
export function DmsEmpty() {
  const { t } = useTranslation();
  const newMessage = useNewMessage();
  return (
    <div className={s.dmsEmpty}>
      <div className={s.pageEmptyIcon}>
        <ChatIcon size={30} strokeWidth={1.8} />
      </div>
      <h2 className={s.emptyTitle}>{t('pages.dms.none')}</h2>
      <Button className={s.dmsEmptyButton} icon={<ComposeIcon size={16} strokeWidth={2} />} onClick={newMessage}>
        {t('shell.sidebar.newMessage')}
      </Button>
    </div>
  );
}

/** A DM: its header (name opens the profile card for a 1:1) and the same conversation view as a channel. */
export function DmConversation({ dmId }: { dmId: string }) {
  const dm = useWorkspace((x) => x.dms.find((d) => d.id === dmId));
  const meId = useWorkspace((x) => x.me.id);
  const name = useDmName();
  const card = useProfileCard();
  const title = useRef<HTMLButtonElement>(null);
  const privacy = usePrivacyText(dm);
  useEffect(() => rememberRecent(dmId), [dmId]);
  useConversationScreen(dm ? { kind: 'dm', layer: 'page', room: dm.id, label: name(dm) } : null);
  if (!dm) return null;
  const list = others(dm, meId);
  const single = list.length === 1 ? list[0] : undefined;

  return (
    <>
      <header className={`${shell.header} ${s.dmHeader}`}>
        <DrawerToggle />
        {dm.system ? (
          <h1 className={s.dmTitle}>
            <SystemFace size={26} />
            <span>{name(dm)}</span>
          </h1>
        ) : single ? (
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
            <DmFace dm={dm} meId={meId} size={20} />
            <span>{name(dm)}</span>
          </h1>
        )}
        {privacy && <PrivacyLock text={privacy} />}
        <FindButton />
        <HeaderEnd afterSearch />
      </header>
      <ChannelTabs key={dm.id} channelId={dm.id} stored={noStoredTabs} />
    </>
  );
}
