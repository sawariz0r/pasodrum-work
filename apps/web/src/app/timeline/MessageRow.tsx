import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Message } from '../../matrix';
import { AlertIcon } from '../../ui/icons';
import { MessageEditor } from '../composer/MessageEditor';
import { useProfileCard } from '../people/ProfileCardContext';
import { formatList, formatTime } from '../format';
import { BoxIcon, TrashIcon, UserPlusIcon } from '../icons';
import { useTimeline } from './context';
import { AudioPlayer, FileCard, ImageGrid, ImageSingle, VideoPlayer } from './Media';
import { MessageActions } from './MessageActions';
import { Reactions } from './Reactions';
import { PlainText, RichText } from './RichText';
import r from './Rich.module.css';
import s from './Timeline.module.css';
import { PersonAvatar } from './PersonAvatar';

type Props = {
  message: Message;
  /** Images or files shown together in this row (first is `message`). */
  group?: Message[];
  head: boolean;
  arrive?: boolean;
  /** The loaded original of a reply, if any. */
  original?: Message;
  meId: string;
  editing?: boolean;
  onEditDone: () => void;
  flash?: boolean;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  /** Thread replies: 32px avatar, 14.5px text. */
  compact?: boolean;
};

const longLines = 15;

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Over 15 lines: 10 lines with a fade and Show more; opens once, on click. */
function Long({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation();
  const tl = useTimeline();
  const box = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [openTo, setOpenTo] = useState<number | null>(null);
  const expanded = tl.isExpanded(id);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || expanded || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      if (lh) setLong(el.scrollHeight > lh * longLines + 1);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  const collapsed = long && !expanded;
  return (
    <>
      <div
        ref={box}
        className={collapsed ? r.clamp : openTo !== null ? r.opening : undefined}
        style={openTo !== null ? { maxHeight: openTo } : undefined}
        onTransitionEnd={() => setOpenTo(null)}
      >
        {children}
      </div>
      {collapsed && (
        <button
          type="button"
          className={r.showMore}
          aria-expanded={false}
          onClick={() => {
            setOpenTo(box.current?.scrollHeight ?? null);
            tl.expand(id);
          }}
        >
          {t('timeline.showMore')}
        </button>
      )}
    </>
  );
}

function ReplyQuote({ reply, original }: { reply: NonNullable<Message['replyTo']>; original?: Message }) {
  const { t } = useTranslation();
  const tl = useTimeline();
  const found = reply.found && original;
  const sender = found ? original.sender : reply.sender;
  const text = found
    ? original.kind === 'deleted'
      ? t('timeline.deleted')
      : original.body || original.media?.name || ''
    : reply.body;
  const inner = (
    <>
      {found && <PersonAvatar size={16} person={sender!} />}
      {sender && <span className={r.replyName}>{sender.name}</span>}
      <span className={r.replyText}>{text}</span>
    </>
  );
  return found ? (
    <button type="button" className={r.replyQuote} onClick={() => tl.jumpTo(original.id)}>
      {inner}
    </button>
  ) : (
    <div className={r.replyQuote}>{inner}</div>
  );
}

function Content({ m, group, tail }: { m: Message; group?: Message[]; tail?: ReactNode }) {
  const { t } = useTranslation();
  const tl = useTimeline();
  const caption = m.body && m.body !== m.media?.name ? <PlainText text={m.body} /> : null;
  const kind = m.kind ?? 'text';
  if (m.media && (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'file')) {
    return (
      <>
        {caption}
        {kind === 'image' && (group ? <ImageGrid messages={group} onOpen={tl.openViewer} /> : <ImageSingle message={m} onOpen={tl.openViewer} />)}
        {kind === 'video' && <VideoPlayer media={m.media} />}
        {kind === 'audio' && <AudioPlayer media={m.media} />}
        {kind === 'file' && <FileCard messages={group ?? [m]} />}
      </>
    );
  }
  if (kind === 'text' || kind === 'emote' || kind === 'notice') {
    return <Long id={m.id}>{m.html ? <RichText html={m.html} tail={tail} /> : <PlainText text={m.body} tail={tail} />}</Long>;
  }
  return (
    <div className={r.unsupported}>
      <BoxIcon />
      <span className={r.unsupportedText}>{m.body || t('timeline.cantShow')}</span>
    </div>
  );
}

/** Under a thread root: who replied and how many (Main, ClientThread). */
function ThreadSummary({ thread, onOpen }: { thread: NonNullable<Message['thread']>; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={s.threadSummary} onClick={onOpen}>
      <span className={s.threadPeople}>
        {thread.participants.slice(0, 3).map((p) => (
          <PersonAvatar key={p.id} size={22} person={p} />
        ))}
      </span>
      <span className={s.threadCount}>{t('thread.replies', { count: thread.count })}</span>
    </button>
  );
}

function DeletedRow({ m }: { m: Message }) {
  const { t } = useTranslation();
  const date = new Date(m.ts);
  return (
    <div className={`${s.row} ${s.quietRow}`} data-message-id={m.id} data-ids={m.id}>
      <div className={s.quietIcon}>
        <TrashIcon size={15} />
      </div>
      <div className={s.quietText}>
        <span>{t('timeline.deleted')}</span>
        <time className={s.hoverTime} dateTime={date.toISOString()}>{formatTime(date)}</time>
      </div>
    </div>
  );
}

function SystemRow({ m }: { m: Message }) {
  const { t } = useTranslation();
  const names = (list: { name: string }[]) => formatList(list.map((p) => t('timeline.person', { name: p.name })));
  const joined = m.system?.joined ?? [];
  const left = m.system?.left ?? [];
  return (
    <div className={s.systemRow} data-message-id={m.id} data-ids={m.id}>
      <span className={s.systemIcon}>
        <UserPlusIcon />
      </span>
      <span>
        {joined.length > 0 && t('timeline.joined', { names: names(joined) })}
        {joined.length > 0 && left.length > 0 && ' '}
        {left.length > 0 && t('timeline.left', { names: names(left) })}
      </span>
    </div>
  );
}

export const MessageRow = memo(function MessageRow({
  message: m,
  group,
  head,
  arrive = false,
  original,
  meId,
  editing = false,
  onEditDone,
  flash = false,
  onRetry,
  onDiscard,
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const tl = useTimeline();
  const profile = useProfileCard();
  const [force, setForce] = useState(false);
  if (m.kind === 'deleted') return <DeletedRow m={m} />;
  if (m.kind === 'system') return <SystemRow m={m} />;

  const sending = m.status === 'sending';
  const failed = m.status === 'failed';
  const own = m.sender.id === meId;
  const date = new Date(m.ts);
  const time = <time dateTime={date.toISOString()}>{formatTime(date)}</time>;
  const tail = m.edited ? (
    <span className={r.edited}>
      {' '}
      {t('timeline.edited')}
    </span>
  ) : undefined;
  const ids = (group ?? [m]).map((x) => x.id).join(' ');
  const toggle = (key: string, mine: boolean) => (mine ? store.unreact(tl.channelId, m.id, key) : store.react(tl.channelId, m.id, key));
  const pick = (key: string) => {
    if (!m.reactions?.some((x) => x.key === key && x.mine)) store.react(tl.channelId, m.id, key);
  };

  const cls = [
    s.row,
    head ? s.head : s.cont,
    compact && s.compact,
    arrive && s.arrive,
    m.mentionsMe && s.mention,
    force && s.force,
    editing && s.editing,
    flash && s.flash,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} data-message-id={m.id} data-ids={ids}>
      <div className={s.gutter}>
        {head ? (
          <button type="button" className={s.avatarButton} tabIndex={-1} aria-hidden="true" onClick={(e) => profile.open(m.sender.id, e.currentTarget)}>
            <PersonAvatar size={compact ? 32 : 36} person={m.sender} />
          </button>
        ) : (
          !sending && <span className={s.hoverTime}>{time}</span>
        )}
      </div>
      <div className={s.main}>
        {head && (
          <div className={s.meta}>
            <button type="button" className={s.name} aria-haspopup="dialog" onClick={(e) => profile.open(m.sender.id, e.currentTarget)}>
              {m.sender.name}
            </button>
            {sending ? (
              <span role="img" aria-label={t('timeline.sending')} className={s.sending}>
                <ClockIcon />
              </span>
            ) : (
              <span className={s.time}>{time}</span>
            )}
          </div>
        )}
        {m.replyTo && <ReplyQuote reply={m.replyTo} original={original} />}
        {editing ? (
          <MessageEditor message={m} onDone={onEditDone} />
        ) : (
          <div className={[s.body, sending && s.dim, !head && m.media && !(m.body && m.body !== m.media.name) && s.mediaOnly].filter(Boolean).join(' ')}>
            <Content m={m} group={group} tail={tail} />
          </div>
        )}
        {failed && (
          <div role="alert" className={s.failed}>
            <AlertIcon className={s.failedIcon} size={15} strokeWidth={2.2} />
            <span className={s.notSent}>{t('timeline.notSent')}</span>
            <span aria-hidden="true" className={s.dot} />
            <button type="button" className={s.retry} onClick={() => onRetry(m.id)}>
              {t('timeline.retry')}
            </button>
            <span aria-hidden="true" className={s.dot} />
            <button type="button" className={s.discard} onClick={() => onDiscard(m.id)}>
              {t('timeline.delete')}
            </button>
          </div>
        )}
        {m.reactions && m.reactions.length > 0 && <Reactions reactions={m.reactions} meId={meId} onToggle={toggle} onPick={pick} />}
        {m.thread && m.thread.count > 0 && tl.openThread && <ThreadSummary thread={m.thread} onOpen={() => tl.openThread?.(m.id)} />}
      </div>
      {m.status === 'sent' && !editing && <MessageActions message={m} group={group} own={own} onOpenChange={setForce} />}
    </div>
  );
});
