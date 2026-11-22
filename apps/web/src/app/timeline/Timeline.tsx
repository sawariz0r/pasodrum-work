import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useInRouterContext, useSearchParams } from 'react-router';
import { useStore, type Message, type Timeline as TimelineData } from '../../matrix';
import { Skeleton } from '../../ui';
import { AlertIcon } from '../../ui/icons';
import { useComposer } from '../composer/context';
import { ArrowDownIcon, CheckIcon } from '../icons';
import { TimelineContext, useTimeline, type TimelineActions } from './context';
import { DayDivider } from './DayDivider';
import { DeleteConfirm } from '../composer/DeleteConfirm';
import { ImageViewer } from './ImageViewer';
import { buildItems } from './items';
import { MessageRow } from './MessageRow';
import s from './Timeline.module.css';

const toastMs = 2000;
const flashMs = 1240;

const bottomSlackPx = 40;
/** A jump's smooth scroll starts at the bottom: for this long the view doesn't count as "at the bottom" (or stick to it). */
const jumpMs = 1000;
/** How far back a jump from Pins pages before giving up (a pinned thread reply is never in the channel's history). */
const jumpPages = 10;
const loadOlderWithinPx = 400;
/** Where a conversation left scrolled up was, to return to it: the first message on screen and its offset from the top. */
const positions = new Map<string, { id: string; top: number }>();
/** Conversations showing their messages now. A rail page switch remounts the page around one (Activity → Home on the same
 * channel); its messages stay put instead of fading in again from blank. */
const shown = new Map<string, number>();

const skeletonRows: [string, string, string][] = [
  ['22%', '74%', '48%'], ['16%', '58%', ''], ['26%', '82%', '64%'], ['18%', '40%', ''],
  ['24%', '70%', '36%'], ['20%', '62%', ''], ['14%', '88%', '52%'],
];

function Skeletons({ count, small = false }: { count: number; small?: boolean }) {
  return skeletonRows.slice(0, count).map(([head, w1, w2], i) => (
    <div key={i} className={small ? `${s.skelRow} ${s.skelSmall}` : s.skelRow} aria-hidden="true">
      {small ? <Skeleton width={32} height={32} radius={8} /> : <Skeleton width={36} height={36} radius={9} />}
      <div className={s.skelLines}>
        <Skeleton width={head} height={small ? 10 : 11} />
        <Skeleton width={w1} height={9} />
        {w2 && <Skeleton width={w2} height={9} />}
      </div>
    </div>
  ));
}

/** M6: the loading timeline on its own, while this device's encryption is still starting (or another tab holds it). */
export function TimelineSkeleton({ small = false }: { small?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={s.pane}>
      <div className={s.scroller} aria-busy="true">
        <div className={small ? `${s.content} ${s.threadContent}` : s.content}>
          <span className={s.srOnly}>{t('common.loading')}</span>
          <Skeletons count={small ? 3 : 7} small={small} />
        </div>
      </div>
    </div>
  );
}

function HashIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
  );
}

const smooth = (): ScrollBehavior => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');
const pending = (m: Message) => m.status !== 'sent';
const quiet = (m: Message) => m.kind === 'deleted' || m.kind === 'system';

/** The first of the last `unread` messages from other people. */
function firstUnread(messages: readonly Message[], unread: number, meId: string): string | null {
  if (unread <= 0) return null;
  let left = unread;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.sender.id === meId || quiet(m)) continue;
    if (--left === 0) return m.id;
  }
  return messages.find((m) => m.sender.id !== meId && !quiet(m))?.id ?? null;
}

type RowKeys = {
  messages: readonly Message[];
  ready: boolean;
  paging: boolean;
  keys: ReadonlyMap<string, string>;
  arrived: ReadonlySet<string>;
};

function nextRowKeys(prev: RowKeys, messages: readonly Message[], ready: boolean, paging: boolean): RowKeys {
  const keys = new Map(prev.keys);
  const keyOf = (m: Message) => keys.get(m.id) ?? m.id;
  const ids = new Set(messages.map((m) => m.id));
  const known = new Set(prev.messages.map((m) => m.id));
  const gone = prev.messages.filter((m) => pending(m) && !ids.has(m.id));
  for (const m of messages) {
    if (known.has(m.id) || keys.has(m.id)) continue;
    const was = gone.find((g) => g.sender.id === m.sender.id && g.body === m.body);
    if (was) keys.set(m.id, keyOf(was));
  }
  let arrived = prev.arrived;
  if (prev.ready && ready) {
    const newest = prev.messages.at(-1);
    const at = newest ? messages.findIndex((m) => keyOf(m) === keyOf(newest)) : -1;
    const from = newest ? (at < 0 ? messages.length : at + 1) : prev.paging ? messages.length : 0;
    if (from < messages.length) arrived = new Set([...arrived, ...messages.slice(from).map(keyOf)]);
  }
  return { messages, ready, paging, keys, arrived };
}

/**
 * Row keys that survive a pending message getting its server id (so sending → sent eases instead of remounting),
 * and the keys of messages that arrived at the end while the channel was open (not initial load or older history).
 */
function useRowKeys(messages: readonly Message[], ready: boolean, paging: boolean) {
  const [state, setState] = useState<RowKeys>(() => ({ messages, ready, paging, keys: new Map(), arrived: new Set() }));
  let current = state;
  if (state.messages !== messages || state.ready !== ready || state.paging !== paging) {
    current = nextRowKeys(state, messages, ready, paging);
    setState(current);
  }
  return { keyOf: (m: Message) => current.keys.get(m.id) ?? m.id, arrived: current.arrived };
}

/** `?msg=<id>` (from the Pins tab): scroll to that message and flash it, paging older history until it loads. */
function JumpTarget({ messages, hasOlder, busy }: { messages: readonly Message[]; hasOlder: boolean; busy: boolean }) {
  const store = useStore();
  const tl = useTimeline();
  const [params, setParams] = useSearchParams();
  const target = params.get('msg');
  const pages = useRef(0);
  useEffect(() => {
    if (!target || busy) return;
    const done = () =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete('msg');
          return next;
        },
        { replace: true },
      );
    if (messages.some((m) => m.id === target)) {
      tl.jumpTo(target, true);
      done();
    } else if (hasOlder && pages.current < jumpPages) {
      pages.current++;
      store.loadOlder(tl.channelId);
    } else {
      done();
    }
  }, [target, busy, messages, hasOlder, store, tl, setParams]);
  return null;
}

type Props = {
  channelId: string;
  channelName: string;
  timeline: TimelineData | undefined;
  meId: string;
  /** Unread count when the channel was opened: the New line goes above the first of these. */
  unreadAtOpen?: number;
  /** Opens a root's thread (hover bar Thread, summary row). Absent inside a thread. */
  onOpenThread?: (rootId: string) => void;
  /** Thread panel: the root on top, its replies below, read and paging per thread. */
  thread?: ThreadMode;
  /** Shown in place of the channel's empty state (the start of a DM, Batch C DMEmpty). */
  intro?: ReactNode;
  /** At the conversation start, also above its first message; replaces `intro` and the empty state (SIDE-02). */
  start?: ReactNode;
  /** Under the empty channel's name (Add people). */
  emptyAction?: ReactNode;
};

export type ThreadMode = { rootId: string; root?: Message; failed?: boolean; onRetry: () => void };

export function Timeline({ channelId, channelName, timeline, meId, unreadAtOpen = 0, onOpenThread, thread, intro, start, emptyAction }: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const composer = useComposer();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const jumpedAt = useRef(Number.NEGATIVE_INFINITY);
  const jumpTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const lastId = useRef<string | undefined>(undefined);
  const markedId = useRef<string | null | undefined>(undefined);
  const stuckAt = useRef<number | null>(null);
  const restore = useRef(true);

  const initialLoading = timeline?.initialLoading ?? true;
  const loadingOlder = timeline?.loadingOlder ?? false;
  const hasOlder = timeline?.hasOlder ?? false;
  const messages = useMemo(() => timeline?.messages ?? [], [timeline?.messages]);
  // The New line is placed once, when the history first arrives, and stays until you leave the channel.
  const [newFrom, setNewFrom] = useState<string | null | undefined>(undefined);
  if (newFrom === undefined && !initialLoading) setNewFrom(firstUnread(messages, unreadAtOpen, meId));
  const items = useMemo(() => {
    const all = buildItems(messages, newFrom);
    return thread ? all.filter((x) => x.kind !== 'day') : all;
  }, [messages, newFrom, thread]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const images = useMemo(() => messages.filter((m) => m.kind === 'image' && m.media), [messages]);

  const [seenId, setSeenId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Message[] | null>(null);
  const [toast, setToast] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const expanded = useRef(new Set<string>());
  const { keyOf, arrived } = useRowKeys(messages, !initialLoading, loadingOlder);
  const now = new Date();

  const rootId = thread?.rootId;
  const routed = useInRouterContext();
  const state = useRef({ initialLoading, loadingOlder, hasOlder, newestId: undefined as string | undefined });
  useLayoutEffect(() => {
    state.current = { initialLoading, loadingOlder, hasOlder, newestId: messages.at(-1)?.id };
  });

  const shownKey = rootId ?? channelId;
  const [still] = useState(() => shown.has(shownKey));
  useLayoutEffect(() => {
    if (initialLoading) return;
    shown.set(shownKey, (shown.get(shownKey) ?? 0) + 1);
    return () => {
      const n = shown.get(shownKey)! - 1;
      if (n) shown.set(shownKey, n);
      else shown.delete(shownKey);
    };
  }, [shownKey, initialLoading]);

  const stickToBottom = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stuckAt.current = el.scrollTop;
    atBottom.current = true;
  }, []);

  const check = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const st = state.current;
    if (st.initialLoading) return;
    // Unmoved since sticking, the content grew below (the composer's height applied) before the resize observer ran: still at the bottom.
    if (atBottom.current && el.scrollTop === stuckAt.current) stickToBottom();
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= bottomSlackPx && performance.now() - jumpedAt.current > jumpMs;
    if (atBottom.current) setSeenId(st.newestId ?? null);
    // Read only while the window has focus: a hidden window's open conversation still badges and notifies.
    if (atBottom.current && document.hasFocus() && markedId.current !== (st.newestId ?? null)) {
      markedId.current = st.newestId ?? null;
      if (rootId) store.markThreadRead(channelId, rootId);
      else store.markRead(channelId);
    }
    if (st.hasOlder && !st.loadingOlder && el.scrollTop < loadOlderWithinPx) {
      if (rootId) store.loadOlderInThread(channelId, rootId);
      else store.loadOlder(channelId);
    }
  }, [store, channelId, rootId, stickToBottom]);

  useEffect(() => {
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [check]);

  // Keep what's on screen in place: stick to the bottom when there, otherwise hold the first message still
  // while older history or its skeleton is inserted above it.
  useLayoutEffect(() => {
    const el = scroller.current;
    const box = content.current;
    if (!el || !box) return;
    const newest = messages.at(-1);
    const sentByMe = newest && newest.id !== lastId.current && newest.sender.id === meId && newest.status === 'sending';
    lastId.current = newest?.id;
    const saved = restore.current && !initialLoading ? positions.get(rootId ?? channelId) : undefined;
    if (!initialLoading) restore.current = false;
    const back = saved && Array.from(box.querySelectorAll<HTMLElement>('[data-message-id]')).find((n) => n.dataset.messageId === saved.id);
    if (back && saved) {
      el.scrollTop += back.getBoundingClientRect().top - el.getBoundingClientRect().top - saved.top;
      atBottom.current = false;
    } else if (atBottom.current || sentByMe) {
      stickToBottom();
    } else if (anchor.current) {
      const id = anchor.current.id;
      const node = Array.from(box.querySelectorAll<HTMLElement>('[data-message-id]')).find((n) => n.dataset.messageId === id);
      if (node) el.scrollTop += node.offsetTop - anchor.current.top;
    }
    const first = box.querySelector<HTMLElement>('[data-message-id]');
    anchor.current = first ? { id: first.dataset.messageId!, top: first.offsetTop } : null;
    check();
  }, [messages, initialLoading, loadingOlder, meId, stickToBottom, check, rootId, channelId]);

  // Leaving scrolled up remembers the first message on screen; leaving at the bottom returns to the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    const box = content.current;
    const key = rootId ?? channelId;
    return () => {
      if (!el || !box || state.current.initialLoading) return;
      if (atBottom.current) return void positions.delete(key);
      const top = el.getBoundingClientRect().top;
      const first = Array.from(box.querySelectorAll<HTMLElement>('[data-message-id]')).find((n) => n.getBoundingClientRect().bottom > top);
      if (first) positions.set(key, { id: first.dataset.messageId!, top: first.getBoundingClientRect().top - top });
    };
  }, [rootId, channelId]);

  // The composer growing, fonts loading or a language switch change sizes without new messages.
  useLayoutEffect(() => {
    const el = scroller.current;
    const box = content.current;
    if (!el || !box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) stickToBottom();
      const first = box.querySelector<HTMLElement>('[data-message-id]');
      anchor.current = first ? { id: first.dataset.messageId!, top: first.offsetTop } : null;
    });
    ro.observe(el);
    // Border box: the composer's height arrives as the content's bottom padding.
    ro.observe(box, { box: 'border-box' });
    return () => ro.disconnect();
  }, [stickToBottom]);

  const onRetry = useCallback((id: string) => store.retry(channelId, id), [store, channelId]);
  const onDiscard = useCallback((id: string) => store.discard(channelId, id), [store, channelId]);
  const stopEdit = composer.stopEdit;
  const busy = initialLoading || loadingOlder;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(0), toastMs);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), flashMs);
    return () => clearTimeout(id);
  }, [flash]);

  const actions = useMemo<TimelineActions>(
    () => ({
      channelId,
      meId,
      openViewer: setViewing,
      askDelete: setDeleting,
      linkCopied: () => setToast((n) => n + 1),
      jumpTo(id, instant) {
        const row = content.current?.querySelector<HTMLElement>(`[data-ids~="${CSS.escape(id)}"]`);
        if (!row) return;
        // Leaving the bottom: size changes (images, fonts) must not pull the view back down mid-scroll.
        atBottom.current = false;
        jumpedAt.current = performance.now();
        // A target in the last screenful scrolls little or not at all: look again once the window ends.
        clearTimeout(jumpTimer.current);
        jumpTimer.current = setTimeout(check, jumpMs + 50);
        row.scrollIntoView?.({ block: 'center', behavior: instant ? 'instant' : smooth() });
        setFlash(row.dataset.messageId ?? id);
      },
      isExpanded: (id) => expanded.current.has(id),
      expand: (id) => void expanded.current.add(id),
      openThread: onOpenThread,
    }),
    [channelId, meId, onOpenThread, check],
  );
  useEffect(() => () => clearTimeout(jumpTimer.current), []);

  // Messages from others that arrived below while scrolled up.
  const seenAt = seenId ? messages.findIndex((m) => m.id === seenId) : -1;
  const below = seenAt < 0 ? 0 : messages.slice(seenAt + 1).filter((m) => m.sender.id !== meId && !quiet(m)).length;
  const jumpToLatest = () => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: smooth() });
    else el.scrollTop = el.scrollHeight;
  };

  return (
    <TimelineContext.Provider value={actions}>
    {routed && !thread && <JumpTarget messages={messages} hasOlder={hasOlder} busy={busy} />}
    <div className={s.pane}>
    <div ref={scroller} className={s.scroller} onScroll={check} aria-busy={busy}>
      <div ref={content} className={thread ? `${s.content} ${s.threadContent}` : s.content}>
        {busy && <span className={s.srOnly}>{t('common.loading')}</span>}
        {thread?.root && (
          <div className={s.threadRoot}>
            <MessageRow
              message={thread.root}
              head
              meId={meId}
              editing={composer.editingId === thread.root.id}
              onEditDone={stopEdit}
              onRetry={onRetry}
              onDiscard={onDiscard}
            />
          </div>
        )}
        {thread?.failed ? (
          <div role="alert" className={s.threadError}>
            <AlertIcon className={s.threadErrorIcon} size={16} strokeWidth={2.2} />
            <span className={s.threadErrorText}>{t('thread.loadFailed')}</span>
            <button type="button" className={s.threadRetry} onClick={thread.onRetry}>
              {t('thread.retry')}
            </button>
          </div>
        ) : initialLoading ? (
          <Skeletons count={thread ? 3 : 7} small={!!thread} />
        ) : (
          <>
            {loadingOlder && <Skeletons count={2} small={!!thread} />}
            {thread && messages.length > 0 && (
              <div className={s.repliesRule}>
                <span>{t('thread.replies', { count: Math.max(messages.length, thread.root?.thread?.count ?? 0) })}</span>
                <span className={s.rule} />
              </div>
            )}
            {!thread && !hasOlder && start}
            {!thread && items.length === 0 && !hasOlder && !start && intro}
            {!thread && items.length === 0 && !hasOlder && !start && !intro && (
              <div className={s.empty}>
                <div className={s.emptyIcon}>
                  <HashIcon />
                </div>
                <h2 className={s.emptyTitle}>{t('common.channelName', { name: channelName })}</h2>
                {emptyAction && <div className={s.emptyAction}>{emptyAction}</div>}
              </div>
            )}
            <div
              role="log"
              aria-label={thread ? t('thread.title') : t('common.channelName', { name: channelName })}
              className={[s.log, thread && s.replies, still && s.still].filter(Boolean).join(' ')}
            >
              {items.map((item) => {
                if (item.kind === 'day') return <DayDivider key={item.key} day={item.day} now={now} />;
                if (item.kind === 'new') {
                  return (
                    <div key="new" className={s.newLine} role="separator" aria-label={t('timeline.newLineLabel')}>
                      <span className={s.newRule} />
                      <span className={s.newLabel} aria-hidden="true">{t('timeline.newLine')}</span>
                    </div>
                  );
                }
                const m = item.message;
                const key = keyOf(m);
                return (
                  <MessageRow
                    key={key}
                    message={m}
                    group={item.group}
                    head={item.head}
                    arrive={arrived.has(key)}
                    original={m.replyTo ? byId.get(m.replyTo.id) : undefined}
                    meId={meId}
                    compact={!!thread}
                    editing={composer.editingId === m.id}
                    onEditDone={stopEdit}
                    flash={flash === m.id}
                    onRetry={onRetry}
                    onDiscard={onDiscard}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
    <div className={s.floats}>
      {below > 0 && (
        <button type="button" className={s.jump} aria-label={t('timeline.jumpLabel', { count: below })} onClick={jumpToLatest}>
          <ArrowDownIcon />
          {t('timeline.newCount', { count: below })}
        </button>
      )}
      {toast > 0 && below === 0 && (
        <div key={toast} className={s.toast} role="status">
          <span className={s.toastIcon}>
            <CheckIcon />
          </span>
          {t('timeline.linkCopied')}
        </div>
      )}
    </div>
    </div>
    {viewing && <ImageViewer images={images} startId={viewing} onClose={() => setViewing(null)} />}
    {deleting && (
      <DeleteConfirm
        message={deleting[0]!}
        open
        onCancel={() => setDeleting(null)}
        onDelete={() => {
          for (const m of deleting) store.remove(channelId, m.id);
          setDeleting(null);
        }}
      />
    )}
    </TimelineContext.Provider>
  );
}
