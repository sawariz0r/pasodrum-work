import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Message, type Timeline as TimelineData } from '../../matrix';
import { Skeleton } from '../../ui';
import { DayDivider } from './DayDivider';
import { buildItems } from './items';
import { MessageRow } from './MessageRow';
import s from './Timeline.module.css';

const bottomSlackPx = 40;
const loadOlderWithinPx = 400;

const skeletonRows: [string, string, string][] = [
  ['22%', '74%', '48%'], ['16%', '58%', ''], ['26%', '82%', '64%'], ['18%', '40%', ''],
  ['24%', '70%', '36%'], ['20%', '62%', ''], ['14%', '88%', '52%'],
];

function Skeletons({ count }: { count: number }) {
  return skeletonRows.slice(0, count).map(([head, w1, w2], i) => (
    <div key={i} className={s.skelRow} aria-hidden="true">
      <Skeleton width={36} height={36} radius={9} />
      <div className={s.skelLines}>
        <Skeleton width={head} height={11} />
        <Skeleton width={w1} height={9} />
        {w2 && <Skeleton width={w2} height={9} />}
      </div>
    </div>
  ));
}

function HashIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
  );
}

const pending = (m: Message) => m.status !== 'sent';

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

type Props = {
  channelId: string;
  channelName: string;
  timeline: TimelineData | undefined;
  meId: string;
};

export function Timeline({ channelId, channelName, timeline, meId }: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const lastId = useRef<string | undefined>(undefined);
  const markedId = useRef<string | null | undefined>(undefined);

  const initialLoading = timeline?.initialLoading ?? true;
  const loadingOlder = timeline?.loadingOlder ?? false;
  const hasOlder = timeline?.hasOlder ?? false;
  const messages = useMemo(() => timeline?.messages ?? [], [timeline?.messages]);
  const items = useMemo(() => buildItems(messages), [messages]);
  const { keyOf, arrived } = useRowKeys(messages, !initialLoading, loadingOlder);
  const now = new Date();

  const state = useRef({ initialLoading, loadingOlder, hasOlder, newestId: undefined as string | undefined });
  useLayoutEffect(() => {
    state.current = { initialLoading, loadingOlder, hasOlder, newestId: messages.at(-1)?.id };
  });

  const check = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const st = state.current;
    if (st.initialLoading) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= bottomSlackPx;
    if (atBottom.current && markedId.current !== (st.newestId ?? null)) {
      markedId.current = st.newestId ?? null;
      store.markRead(channelId);
    }
    if (st.hasOlder && !st.loadingOlder && el.scrollTop < loadOlderWithinPx) store.loadOlder(channelId);
  }, [store, channelId]);

  const stickToBottom = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
  }, []);

  // Keep what's on screen in place: stick to the bottom when there, otherwise hold the first message still
  // while older history or its skeleton is inserted above it.
  useLayoutEffect(() => {
    const el = scroller.current;
    const box = content.current;
    if (!el || !box) return;
    const newest = messages.at(-1);
    const sentByMe = newest && newest.id !== lastId.current && newest.sender.id === meId && newest.status === 'sending';
    lastId.current = newest?.id;
    if (atBottom.current || sentByMe) {
      stickToBottom();
    } else if (anchor.current) {
      const id = anchor.current.id;
      const node = Array.from(box.querySelectorAll<HTMLElement>('[data-message-id]')).find((n) => n.dataset.messageId === id);
      if (node) el.scrollTop += node.offsetTop - anchor.current.top;
    }
    const first = box.querySelector<HTMLElement>('[data-message-id]');
    anchor.current = first ? { id: first.dataset.messageId!, top: first.offsetTop } : null;
    check();
  }, [messages, initialLoading, loadingOlder, meId, stickToBottom, check]);

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
    ro.observe(box);
    return () => ro.disconnect();
  }, [stickToBottom]);

  const onRetry = useCallback((id: string) => store.retry(channelId, id), [store, channelId]);
  const onDiscard = useCallback((id: string) => store.discard(channelId, id), [store, channelId]);
  const busy = initialLoading || loadingOlder;

  return (
    <div ref={scroller} className={s.scroller} onScroll={check} aria-busy={busy}>
      <div ref={content} className={s.content}>
        {busy && <span className={s.srOnly}>{t('common.loading')}</span>}
        {initialLoading ? (
          <Skeletons count={7} />
        ) : (
          <>
            {loadingOlder && <Skeletons count={2} />}
            {items.length === 0 && !hasOlder && (
              <div className={s.empty}>
                <div className={s.emptyIcon}>
                  <HashIcon />
                </div>
                <h2 className={s.emptyTitle}>{t('common.channelName', { name: channelName })}</h2>
              </div>
            )}
            <div role="log" aria-label={t('common.channelName', { name: channelName })} className={s.log}>
              {items.map((item) => {
                if (item.kind === 'day') return <DayDivider key={item.key} day={item.day} now={now} />;
                const key = keyOf(item.message);
                return (
                  <MessageRow
                    key={key}
                    message={item.message}
                    head={item.head}
                    arrive={arrived.has(key)}
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
  );
}
