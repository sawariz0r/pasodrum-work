// Message search (SearchResults, SearchSearching, SearchEmpty, SearchUnconfirmedDevice; RulesM8, D-13): a local
// substring scan, flat and newest first. Rows arrive while it scans; Search older messages goes further back.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { useStore, useWorkspace, type SearchHit, type WorkspaceSnapshot } from '../../matrix';
import { isImeEnter, Skeleton } from '../../ui';
import { ChatIcon, HashIcon, LockIcon } from '../icons';
import { Face } from '../people/Face';
import { useDmName } from '../people/names';
import { useWorkspaceName } from '../channels/shared';
import { channelPath, dmPath } from '../places';
import { useListTime } from '../pages/lists';
import { useSecurityUi } from '../security/SecurityProvider';
import { DrawerToggle } from '../shell/Drawer';
import { HeaderEnd } from '../shell/HeaderEnd';
import { SearchIcon, SmallCloseIcon, ThreadIcon } from '../shell/icons';
import { highlight, type Part } from './highlight';
import s from './Find.module.css';

type Run = { hits: SearchHit[]; next?: string; busy: boolean };

/** A match further in than this is shown from shortly before it, so the two lines include it. */
const leadIn = 60;

function place(x: WorkspaceSnapshot, id: string) {
  for (const list of Object.values(x.channels)) {
    const c = list.find((ch) => ch.id === id);
    if (c) return c;
  }
  return x.dms.find((d) => d.id === id);
}

function excerpt(parts: Part[]): Part[] {
  const first = parts.findIndex((p) => p.hit);
  const before = parts.slice(0, first).reduce((n, p) => n + p.text.length, 0);
  if (first <= 0 || before <= leadIn) return parts;
  const lead = parts.slice(0, first).map((p) => p.text).join('');
  const cut = lead.slice(-leadIn / 2).replace(/^\S*\s/, '');
  return [{ text: `…${cut}`, hit: false }, ...parts.slice(first)];
}

export function SearchPage() {
  const { t } = useTranslation();
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const unconfirmed = useWorkspace((x) => x.security.device === 'unconfirmed');
  const [draft, setDraft] = useState(query);
  const [run, setRun] = useState<Run>({ hits: [], busy: !!query.trim() });
  const security = useSecurityUi();
  const workspace = useWorkspaceName();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  // A new query (from ⌘K or this field), or this device just confirmed: start over.
  const runKey = `${query}\n${unconfirmed}`;
  const [was, setWas] = useState(runKey);
  if (was !== runKey) {
    setWas(runKey);
    setDraft(query);
    setRun({ hits: [], busy: !!query.trim() });
  }

  const scan = (cursor?: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    if (!query.trim()) return ctl;
    const add = (batch: SearchHit[]) =>
      setRun((r) => {
        const seen = new Set(r.hits.map((h) => h.message.id));
        const hits = [...r.hits, ...batch.filter((h) => !seen.has(h.message.id))].sort((a, b) => b.message.ts - a.message.ts);
        return { ...r, hits };
      });
    store.search(query, { cursor, signal: ctl.signal, onHits: add }).then(
      ({ next }) => !ctl.signal.aborted && setRun((r) => ({ ...r, next, busy: false })),
      () => !ctl.signal.aborted && setRun((r) => ({ ...r, next: undefined, busy: false })),
    );
    return ctl;
  };

  // The scan behind the old query stops.
  useEffect(() => {
    const ctl = scan();
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, runKey]);

  const older = () => {
    setRun((r) => ({ ...r, busy: true }));
    scan(run.next);
  };

  const submit = (q: string) => setParams({ q: q.trim() }, { replace: true });
  const empty = !run.busy && run.hits.length === 0 && !!query.trim();

  return (
    <div className={s.page}>
      <header className={s.pageHead}>
        <DrawerToggle />
        <div role="search" className={s.field}>
          <SearchIcon size={16} strokeWidth={2} />
          <input
            ref={input}
            type="text"
            enterKeyHint="search"
            aria-label={t('find.placeholder', { workspace })}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (isImeEnter(e)) {
                e.preventDefault();
                submit(draft);
              }
            }}
          />
          {draft && (
            <button
              type="button"
              className={s.clear}
              aria-label={t('find.clear')}
              onClick={() => {
                setDraft('');
                input.current?.focus();
              }}
            >
              <SmallCloseIcon size={15} strokeWidth={2} />
            </button>
          )}
        </div>
        <HeaderEnd />
      </header>
      <div className={s.results} aria-busy={run.busy}>
        {unconfirmed && (
          <div role="status" className={s.unconfirmed}>
            <LockIcon size={16} strokeWidth={2} />
            <span>{t('find.unconfirmed')}</span>
            <button type="button" className={s.confirm} onClick={security.confirm}>
              {t('find.confirm')}
            </button>
          </div>
        )}
        {run.hits.length > 0 && (
          <ul className={s.rows}>
            {run.hits.map((h) => (
              <Row key={h.message.id} hit={h} query={query} />
            ))}
          </ul>
        )}
        {run.busy &&
          (['38%', '30%'] as const).map((w, i) => (
            <div key={i} aria-hidden="true" className={s.skel}>
              <Skeleton width={36} height={36} radius={9} />
              <div className={s.skelLines}>
                <Skeleton width={w} height={11} />
                <Skeleton width="12%" height={9} />
                <Skeleton width={i ? '64%' : '78%'} height={9} />
              </div>
            </div>
          ))}
        {empty && (
          <div className={s.empty}>
            <div className={s.emptyIcon}>
              <SearchIcon size={30} strokeWidth={1.8} />
            </div>
            <h2 className={s.emptyTitle}>{t('find.none', { query: query.trim() })}</h2>
          </div>
        )}
        {(run.busy || run.next) && (
          <div className={s.more}>
            {run.busy ? (
              <button type="button" disabled aria-busy="true" className={s.moreButton}>
                <span aria-hidden="true" className={s.dots}>
                  <span />
                  <span />
                  <span />
                </span>
                {t('find.searching')}
              </button>
            ) : (
              <button type="button" className={s.moreButton} onClick={older}>
                {t('find.older')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ hit, query }: { hit: SearchHit; query: string }) {
  const navigate = useNavigate();
  const time = useListTime();
  const dmName = useDmName();
  const { message, threadRootId } = hit;
  const where = useWorkspace((x) => place(x, message.channelId));
  if (!where) return null;
  const isDm = 'people' in where;
  const open = () => {
    const q = new URLSearchParams(threadRootId ? { thread: threadRootId } : { msg: message.id });
    navigate(`${isDm ? dmPath(where.id) : channelPath(where.spaceId, where.id)}?${q}`);
  };
  const icon = threadRootId ? (
    <ThreadIcon size={12} strokeWidth={2.2} />
  ) : isDm ? (
    <ChatIcon size={12} strokeWidth={2.2} />
  ) : where.private ? (
    <LockIcon size={12} strokeWidth={2.2} />
  ) : (
    <HashIcon size={12} strokeWidth={2.2} />
  );
  return (
    <li>
      <button type="button" className={s.row} onClick={open}>
        <Face person={message.sender} size={36} className={s.rowFace} />
        <span className={s.rowMain}>
          <span className={s.rowTop}>
            <span className={s.rowName}>{message.sender.name}</span>
            <span className={s.rowTime}>{time(message.ts)}</span>
          </span>
          <span className={s.rowWhere}>
            {icon}
            <span>{isDm ? dmName(where) : where.name}</span>
          </span>
          <span className={s.rowText}>
            {excerpt(highlight(message.body, query)).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
          </span>
        </span>
      </button>
    </li>
  );
}
