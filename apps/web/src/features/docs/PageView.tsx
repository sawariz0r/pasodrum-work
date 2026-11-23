// An open page: header (where it is, who's here, Copy link, More), title, body, Linked from; offline band and loading.
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useRegistry } from '../../app/RegistryProvider';
import { DrawerToggle } from '../../app/shell/Drawer';
import { HeaderEnd } from '../../app/shell/HeaderEnd';
import { NotAvailable } from '../../app/shell/NotAvailable';
import { useToast } from '../../app/toast';
import { useDocsBoards, useStore, useWorkspace, type PageSession, type PresencePeer } from '../../matrix';
import { avatarColor, Banner, initialsOf, isImeEnter, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui';
import { pagePath } from './actions';
import { DeleteDialog, MoveDialog } from './PageDialogs';
import { DocEditor, sourceOf } from './Editor';
import { ArrowRight, LinkIcon, More, PageIcon, Trash } from './icons';
import { flatten, type Located } from './model';
import { PageSkeleton } from './PageSkeleton';
import { sectionsOf, splitTitle, type SectionState } from './sections';
import { useT } from './strings';
import s from './Docs.module.css';

const noSub = () => () => {};
const noPeers: PresencePeer[] = [];

function usePageSession(pageId: string) {
  const store = useStore();
  const [session, setSession] = useState<PageSession | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let live = true;
    let opened: PageSession | undefined;
    store.docsBoards.openPage(pageId).then(
      (x) => {
        opened = x;
        if (live) setSession(x);
        else x.close();
      },
      () => live && setRefused(true),
    );
    return () => {
      live = false;
      opened?.close();
    };
  }, [store, pageId]);
  const subscribe = useMemo(() => (session ? (cb: () => void) => session.subscribe(cb) : noSub), [session]);
  const status = useSyncExternalStore(subscribe, () => session?.getState().status ?? 'loading');
  const offline = useSyncExternalStore(subscribe, () => session?.getState().offline ?? false);
  return { session, status: refused ? ('failed' as const) : status, offline };
}

function usePeers(pageId: string) {
  const store = useStore();
  const presence = useMemo(() => store.docsBoards.presence(pageId), [store, pageId]);
  useEffect(() => () => presence.close(), [presence]);
  const peers = useSyncExternalStore(
    (cb) => presence.subscribe(cb),
    () => presence.peers() ?? noPeers,
  );
  const meId = useWorkspace((x) => x.me.id);
  return useMemo(() => {
    const seen = new Set<string>([meId]);
    return peers.filter((p) => !seen.has(p.user.id) && seen.add(p.user.id)).map((p) => p.user);
  }, [peers, meId]);
}

/** The title alone, when the page starts with a heading (its own section). */
const TITLE_ONLY = -1;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function PageView({ located }: { located: Located }) {
  const { node, path } = located;
  const pageId = node.id;
  const t = useT();
  const store = useStore();
  const { session, status, offline } = usePageSession(pageId);
  const connection = useWorkspace((x) => x.connection);
  const translator = useRegistry().translation?.useTranslator(node.spaceId) ?? null;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [sections, setSections] = useState<ReadonlyMap<number, SectionState>>(() => new Map());
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null);

  const translate = useCallback(
    (first: number) => {
      if (!editor || !translator) return;
      const sec = sectionsOf(editor.state.doc).find((x) => x.first === first);
      if (!sec && first !== TITLE_ONLY) return;
      const src = sec ? sourceOf(editor, sec, node.title) : { body: node.title, html: `<h1>${escapeHtml(node.title)}</h1>` };
      const set = (st: SectionState) => setSections((m) => new Map(m).set(first, st));
      set({ status: 'translating', source: src.html });
      translator.translate({ id: `${pageId}:${first}`, body: src.body, html: src.html }).then(
        (r) => {
          const full = r.html ?? `<p>${escapeHtml(r.text ?? '')}</p>`;
          const parts = !sec || (first === 0 && !sec.heading) ? splitTitle(full) : { html: full };
          set({ status: 'translated', source: src.html, ...parts });
        },
        () => set({ status: 'failed', source: src.html }),
      );
    },
    [editor, translator, node.title, pageId],
  );
  const showOriginal = useCallback((first: number) => setSections((m) => new Map([...m].filter(([k]) => k !== first))), []);

  if (status === 'failed') return <NotAvailable />;
  if (!session || status === 'loading') return <PageSkeleton />;

  const titleKey = editor && sectionsOf(editor.state.doc)[0]?.heading ? TITLE_ONLY : 0;
  const titleSection = sections.get(titleKey);
  return (
    <div className={s.page}>
      {offline && connection === 'online' && <Banner status="offline" text={t('offline')} />}
      <Header located={located} onMove={() => setDialog('move')} onDelete={() => setDialog('delete')} />
      <div className={s.scroll}>
        <article className={s.article}>
          <TitleField
            key={pageId}
            pageId={pageId}
            title={node.title}
            editor={editor}
            translated={titleSection?.status === 'translated' ? titleSection.title : undefined}
            offer={() => {
              if (!editor || !translator || !node.title || sections.has(titleKey)) return false;
              const first = sectionsOf(editor.state.doc)[0];
              const src = first && !first.heading ? sourceOf(editor, first, node.title) : { body: node.title, html: `<h1>${escapeHtml(node.title)}</h1>` };
              return translator.offers(src.body, src.html);
            }}
            translateIcon={translator?.icon}
            translateLabel={translator?.labels.translate}
            onTranslate={() => translate(titleKey)}
            onShowOriginal={() => showOriginal(titleKey)}
          />
          <DocEditor
            session={session}
            pageId={pageId}
            spaceId={node.spaceId}
            title={node.title}
            translator={translator}
            sections={sections}
            onTranslate={translate}
            onShowOriginal={showOriginal}
            onEditor={setEditor}
          />
          <LinkedFrom pageId={pageId} />
        </article>
      </div>
      <MoveDialog open={dialog === 'move'} node={node} parent={path.at(-1)?.id} onClose={() => setDialog(null)} />
      <DeleteDialog open={dialog === 'delete'} node={node} onClose={() => setDialog(null)} />
      <TypingStopper pageId={pageId} store={store} />
    </div>
  );
}

function TypingStopper({ pageId, store }: { pageId: string; store: ReturnType<typeof useStore> }) {
  useEffect(() => () => store.docsBoards.setTyping(pageId, false), [pageId, store]);
  return null;
}

function Header({ located, onMove, onDelete }: { located: Located; onMove: () => void; onDelete: () => void }) {
  const { node, path } = located;
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const space = useWorkspace((x) => x.spaces.find((sp) => sp.id === node.spaceId));
  const typing = useDocsBoards((x) => x.typing[node.id]);
  const peers = usePeers(node.id);
  const typer = typing?.[0];
  const [before, after] = t('typing', { name: '\u0000' }).split('\u0000');

  const copy = () =>
    void (navigator.clipboard?.writeText(store.docsBoards.pageLink(node.id)) ?? Promise.reject(new Error('no clipboard'))).then(
      () => toast(t('linkCopied')),
      () => {},
    );

  return (
    <header className={s.header}>
      <DrawerToggle />
      <nav aria-label={t('crumbs')} className={s.crumbs}>
        {space && (
          <>
            <span className={s.crumb}>{space.name}</span>
            <span className={s.crumbSep} aria-hidden="true" />
          </>
        )}
        {path.map((p) => (
          <span key={p.id} className={s.crumbItem}>
            <Link to={pagePath(p.id)} className={s.crumbLink}>
              {p.title || t('untitled')}
            </Link>
            <span className={s.crumbSep} aria-hidden="true" />
          </span>
        ))}
        <span className={s.crumbHere} aria-current="page">
          {node.title || t('untitled')}
        </span>
      </nav>
      <span className={s.grow} />
      {typer && (
        <span className={s.typing}>
          <span className={s.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            {before}
            <b>{typer.name}</b>
            {after}
          </span>
        </span>
      )}
      {peers.length > 0 && (
        <span className={s.peers}>
          {peers.map((p) => (
            <span key={p.id} title={p.name} className={s.peer} style={{ '--face-bg': avatarColor(p.id) } as CSSProperties}>
              {initialsOf(p.name)}
            </span>
          ))}
        </span>
      )}
      <button type="button" className={s.headButton} aria-label={t('copyLink')} onClick={copy}>
        <LinkIcon />
      </button>
      <Menu modal={false}>
        <MenuTrigger asChild>
          <button type="button" className={s.headButton} aria-label={t('more')}>
            <More />
          </button>
        </MenuTrigger>
        <MenuContent align="end" width={220} className={s.menu}>
          <MenuItem className={s.menuRow} icon={<LinkIcon size={16} />} onSelect={copy}>
            {t('copyLink')}
          </MenuItem>
          <MenuItem className={s.menuRow} icon={<ArrowRight />} onSelect={onMove}>
            {t('moveTo')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem className={`${s.menuRow} ${s.danger}`} icon={<Trash />} onSelect={onDelete}>
            {t('deletePage')}
          </MenuItem>
        </MenuContent>
      </Menu>
      <HeaderEnd />
    </header>
  );
}

function TitleField(props: {
  pageId: string;
  title: string;
  editor: Editor | null;
  translated?: string;
  offer: () => boolean;
  translateIcon?: React.ReactNode;
  translateLabel?: string;
  onTranslate: () => void;
  onShowOriginal: () => void;
}) {
  const { pageId, title, editor, translated, offer, translateIcon, translateLabel, onTranslate, onShowOriginal } = props;
  const t = useT();
  const store = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(title);
  const [seen, setSeen] = useState(title);
  const [offered, setOffered] = useState(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (title !== seen) {
    setSeen(title);
    if (pending.current === null) setValue(title);
  }

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next !== null) void store.docsBoards.renamePage(pageId, next.trim()).catch(() => {});
  }, [store, pageId]);

  useEffect(() => flush, [flush]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, translated]);

  const focusTitle = (location.state as { focusTitle?: boolean } | null)?.focusTitle;
  useEffect(() => {
    if (!focusTitle) return;
    ref.current?.focus();
    navigate('.', { replace: true, state: null });
  }, [focusTitle, navigate]);

  if (translated !== undefined) {
    return (
      <h1 className={`${s.title} ${s.titleTranslated}`} onMouseDown={onShowOriginal}>
        {translated}
      </h1>
    );
  }

  return (
    <div className={s.titleRow} onMouseEnter={() => setOffered(offer())} onMouseLeave={() => setOffered(false)}>
      {offered && translateIcon && (
        <button type="button" className={`${s.handleButton} ${s.handleTranslate} ${s.titleTranslate}`} aria-label={translateLabel} onClick={onTranslate}>
          {translateIcon}
        </button>
      )}
      <textarea
        ref={ref}
        rows={1}
        className={s.title}
        value={value}
        placeholder={t('untitled')}
        aria-label={t('title')}
        onChange={(e) => {
          const next = e.target.value.replace(/\n/g, ' ');
          setValue(next);
          pending.current = next;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 1000);
        }}
        onBlur={flush}
        onKeyDown={(e) => {
          if (isImeEnter(e)) {
            e.preventDefault();
            flush();
            editor?.view.focus();
            editor?.commands.focus('start');
          }
        }}
      />
    </div>
  );
}

function LinkedFrom({ pageId }: { pageId: string }) {
  const t = useT();
  const pages = useDocsBoards((x) => x.pages);
  const from = useMemo(
    () =>
      Object.values(pages)
        .flatMap((sp) => flatten(sp.roots))
        .map((x) => x.node)
        .filter((n) => n.id !== pageId && n.linksTo.includes(pageId)),
    [pages, pageId],
  );
  if (!from.length) return null;
  return (
    <div className={s.linkedFrom}>
      <span className={s.linkedLabel}>{t('linkedFrom')}</span>
      {from.map((n) => (
        <Link key={n.id} to={pagePath(n.id)} className={s.pageLink}>
          <span className={s.pageLinkIcon}>
            <PageIcon size={14} />
          </span>
          {n.title || t('untitled')}
        </Link>
      ))}
    </div>
  );
}
