// The page body (DocsPage, DocsBlocks, DocsLink, DocsDragBlock, DocsTranslated): TipTap over the page's Y.Doc.
import DragHandle from '@tiptap/extension-drag-handle-react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type NodeViewProps, type Range } from '@tiptap/react';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { TextSelection } from '@tiptap/pm/state';
import { useNavigate } from 'react-router';
import { createSuggestStore, type SuggestStore } from '../../app/composer/suggest';
import type { TextTranslation } from '../../app/registry';
import { FileCard } from '../../app/timeline/Media';
import { useToast } from '../../app/toast';
import { useDocsBoards, useStore, useWorkspace, type Message, type PageSession, type SpacePages } from '../../matrix';
import { isImeEnter } from '../../ui';
import { pagePath } from './actions';
import { editorExtras } from './editorExtras';
import { applyBlock, BLOCKS, docsExtensions, type BlockId, type LinkItem } from './extensions';
import { BlockIcons, Grip, PageIcon, Plus } from './icons';
import { locate } from './model';
import { sectionKey, sectionPlugin, sectionSource, sectionsOf, type Section, type SectionState } from './sections';
import { useT, type DocsKey } from './strings';
import s from './Docs.module.css';

export type Translator = NonNullable<ReturnType<TextTranslation['useTranslator']>>;

const blockLabel: Record<BlockId, DocsKey> = {
  text: 'b_text',
  h1: 'b_h1',
  h2: 'b_h2',
  bullets: 'b_bullets',
  numbered: 'b_numbered',
  checklist: 'b_checklist',
  quote: 'b_quote',
  callout: 'b_callout',
  code: 'b_code',
  table: 'b_table',
  image: 'b_image',
  pageLink: 'b_pageLink',
  divider: 'b_divider',
};

interface Live {
  t: ReturnType<typeof useT>;
  title: string;
  sections: ReadonlyMap<number, SectionState>;
  translator: Translator | null;
  onShowOriginal: (first: number) => void;
  onTranslate: (first: number) => void;
  slashItems: (q: string) => BlockId[];
  linkItems: (q: string) => LinkItem[];
  pickSlash: (id: BlockId, range: Range) => void;
  pickLink: (item: LinkItem, range: Range) => void;
  addFiles: (files: Iterable<File>) => void;
}

/** The current render's handlers, for editor callbacks created once. */
function createBridge<T>() {
  let current: T | undefined;
  return {
    set(v: T) {
      current = v;
    },
    get(): T {
      return current!;
    },
  };
}

const handlePlacement = { placement: 'left-start' as const, strategy: 'absolute' as const };

function useSuggestState<T>(store: SuggestStore<T>) {
  return useSyncExternalStore(store.subscribe, store.get);
}

export interface DocEditorProps {
  session: PageSession;
  pageId: string;
  spaceId: string;
  title: string;
  translator: Translator | null;
  sections: ReadonlyMap<number, SectionState>;
  onTranslate: (first: number) => void;
  onShowOriginal: (first: number) => void;
  onEditor: (editor: Editor | null) => void;
}

export function DocEditor({ session, pageId, spaceId, title, translator, sections, onTranslate, onShowOriginal, onEditor }: DocEditorProps) {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const [slash] = useState(() => createSuggestStore<BlockId>());
  const [links] = useState(() => createSuggestStore<LinkItem>());
  const slashState = useSuggestState(slash);
  const linkState = useSuggestState(links);
  const [hovered, setHovered] = useState<{ pos: number } | null>(null);
  const [plus, setPlus] = useState<{ pos: number; index: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const iconHost = useRef<HTMLSpanElement>(null);

  const spaceName = useWorkspace((x) => x.spaces.find((sp) => sp.id === spaceId)?.name ?? '');
  const [bridge] = useState(() => createBridge<Live>());
  const me = useWorkspace((x) => x.me);

  const [extensions] = useState(() => [
    ...docsExtensions({
      doc: session.doc,
      slash,
      links,
      slashItems: (q) => bridge.get().slashItems(q),
      linkItems: (q) => bridge.get().linkItems(q),
      onSlash: (id, range) => bridge.get().pickSlash(id, range),
      onLink: (item, range) => bridge.get().pickLink(item, range),
      views: { pageLink: ReactNodeViewRenderer(PageLinkView), image: ReactNodeViewRenderer(ImageView), file: ReactNodeViewRenderer(FileView) },
    }),
    ...editorExtras(session, me),
  ]);

  const editor = useEditor({
    extensions,
    editorProps: {
      attributes: { class: s.prose!, 'aria-label': t('title') },
      handlePaste(_view, e) {
        const files = e.clipboardData?.files;
        if (!files?.length || e.clipboardData?.getData('text/plain')) return false;
        bridge.get().addFiles(files);
        return true;
      },
      handleDrop(view, e, _slice, moved) {
        const files = e.dataTransfer?.files;
        if (moved || !files?.length) return false;
        const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
        bridge.get().addFiles(files);
        return true;
      },
    },
  });

  useEffect(() => {
    editor.registerPlugin(
      sectionPlugin({
        states: () => bridge.get().sections as Map<number, SectionState>,
        title: () => bridge.get().title,
        icon: () => iconHost.current?.firstElementChild as HTMLElement | null,
        labels: () => ({
          translating: bridge.get().t('translating'),
          showOriginal: bridge.get().translator?.labels.showOriginal ?? '',
          failed: bridge.get().translator?.labels.failed ?? '',
          retry: bridge.get().translator?.labels.retry ?? '',
        }),
        classes: { pulse: s.pulse!, hidden: s.hiddenBlock!, line: s.trLine!, failedLine: s.trFailed!, glyph: s.trGlyph!, dots: s.dots!, link: s.trLink!, translated: s.translated!, sep: s.trSep! },
        onRetry: (first) => bridge.get().onTranslate(first),
        onShowOriginal: (first) => bridge.get().onShowOriginal(first),
      }),
    );
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(sectionKey);
    };
  }, [editor, bridge]);

  useEffect(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(sectionKey, true));
  }, [editor, sections, title]);

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

  // Typing (m.typing) on my own edits; links saved a moment after the last change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const saveLinks = () => {
      const ids = new Set<string>();
      editor.state.doc.descendants((n) => {
        if (n.type.name === 'pageLink' && n.attrs.id) ids.add(String(n.attrs.id));
      });
      const now = locate(store.docsBoards.getSnapshot().pages, pageId)?.node.linksTo ?? [];
      const next = [...ids].sort();
      if (next.join() !== [...now].sort().join()) store.docsBoards.setPageLinks(pageId, next).catch(() => {});
    };
    const onUpdate = ({ transaction }: { transaction: Parameters<typeof isChangeOrigin>[0] }) => {
      if (isChangeOrigin(transaction)) return;
      store.docsBoards.setTyping(pageId, true);
      clearTimeout(timer);
      timer = setTimeout(saveLinks, 1500);
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      if (timer) {
        clearTimeout(timer);
        saveLinks();
      }
    };
  }, [editor, store, pageId]);

  const pickSlash = (id: BlockId, range: Range) => {
    editor.chain().focus().deleteRange(range).run();
    if (id === 'image') fileInput.current?.click();
    else applyBlock(editor, id);
  };

  const pickLink = (item: LinkItem, range: Range) => {
    editor.chain().focus().deleteRange(range).run();
    const insert = (id: string, title: string) => editor.chain().focus().insertContent([{ type: 'pageLink', attrs: { id, title } }, { type: 'text', text: ' ' }]).run();
    if (item.kind === 'page') insert(item.id, item.title);
    else
      store.docsBoards.createPage({ spaceId, parent: pageId, title: item.title }).then(
        (id) => insert(id, item.title),
        () => toast(t('createFailed')),
      );
  };

  const openPlus = (pos: number) => {
    editor.view.dispatch(editor.state.tr.setMeta('lockDragHandle', true));
    setPlus({ pos, index: 0 });
  };
  const closePlus = () => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('lockDragHandle', false));
    setPlus(null);
  };
  const pickPlus = (id: BlockId) => {
    const at = plus?.pos ?? 0;
    closePlus();
    const node = editor.state.doc.nodeAt(at);
    if (node?.type.name === 'paragraph' && node.content.size === 0) editor.chain().focus().setTextSelection(at + 1).run();
    else {
      const end = at + (node?.nodeSize ?? 0);
      editor.chain().focus().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).run();
    }
    if (id === 'image') fileInput.current?.click();
    else applyBlock(editor, id);
  };

  const addFiles = (files: Iterable<File>) => {
    for (const file of files)
      store.docsBoards.uploadMedia(pageId, file).then(
        (src) =>
          editor
            .chain()
            .focus()
            .insertContentAt(
              editor.state.selection.to,
              file.type.startsWith('image/') ? { type: 'image', attrs: { src, alt: file.name } } : { type: 'docFile', attrs: { src, name: file.name, size: file.size } },
            )
            .run(),
        () => toast(t('uploadFailed', { name: file.name })),
      );
  };

  useLayoutEffect(() => {
    bridge.set({
      t,
      title,
      sections,
      translator,
      onShowOriginal,
      onTranslate,
      slashItems: (q) => {
        const query = q.toLowerCase();
        return BLOCKS.filter((b) => !query || b.startsWith(query) || t(blockLabel[b]).toLowerCase().includes(query));
      },
      linkItems: (q) => linkItems(store.docsBoards.getSnapshot().pages, spaceId, spaceName, pageId, q),
      pickSlash,
      pickLink,
      addFiles,
    });
  });

  const empty = useEditorState({ editor, selector: (c) => c.editor.isEmpty });

  const section = hovered ? sectionsOf(editor.state.doc).find((x) => x.from === hovered.pos && x.heading) : undefined;
  const offerTranslate = !!translator && !!section && !sections.has(section.first) && offers(editor, translator, section, title);

  return (
    <div className={[s.editorWrap, dragging && s.dragging].filter(Boolean).join(' ')}>
      <span ref={iconHost} hidden>
        {translator?.icon}
      </span>
      <DragHandle
        editor={editor}
        computePositionConfig={handlePlacement}
        onNodeChange={({ node, pos }) => setHovered(node ? { pos } : null)}
        onElementDragStart={() => setDragging(true)}
        onElementDragEnd={() => setDragging(false)}
      >
        <div className={s.handle}>
          {offerTranslate && section && (
            <button type="button" className={`${s.handleButton} ${s.handleTranslate}`} aria-label={translator.labels.translate} onClick={() => onTranslate(section.first)}>
              {translator.icon}
            </button>
          )}
          <button type="button" className={s.handleButton} aria-label={t('addBlock')} onClick={() => hovered && openPlus(hovered.pos)}>
            <Plus />
          </button>
          <span className={`${s.handleButton} ${s.grip}`} role="img" aria-label={t('moveBlock')}>
            <Grip />
          </span>
        </div>
      </DragHandle>
      {empty && !plus && (
        <button type="button" className={`${s.handleButton} ${s.emptyPlus}`} aria-label={t('addBlock')} onClick={() => openPlus(0)}>
          <Plus />
        </button>
      )}
      <EditorContent editor={editor} className={s.content} />
      {slashState && slashState.items.length > 0 && (
        <BlockMenu
          items={slashState.items}
          index={slashState.index}
          onPick={(i) => slash.pick(i)}
          onHover={(i) => slash.hover(i)}
          place={(el) => placeBelow(el, editor.view.dom.getBoundingClientRect().left - 54, slashState.rect?.bottom ?? 0)}
        />
      )}
      {plus && (
        <BlockMenu
          items={BLOCKS}
          index={plus.index}
          focus
          onPick={(i) => pickPlus(BLOCKS[i]!)}
          onHover={(i) => setPlus({ ...plus, index: i })}
          onClose={closePlus}
          place={(el) => {
            const dom = editor.view.nodeDOM(plus.pos);
            const top = dom instanceof HTMLElement ? dom.getBoundingClientRect().top : editor.view.dom.getBoundingClientRect().top;
            placeBelow(el, editor.view.dom.getBoundingClientRect().left - 54, top + 30);
          }}
        />
      )}
      {linkState && linkState.items.length > 0 && <LinkMenu store={links} state={linkState} />}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function offers(editor: Editor, translator: Translator, section: Section, title: string) {
  const src = sourceOf(editor, section, title);
  return translator.offers(src.body, src.html);
}

export function sourceOf(editor: Editor, section: Section, title: string) {
  return sectionSource(editor.state.doc, editor.schema, section, title);
}

function placeBelow(el: HTMLElement, left: number, top: number) {
  const room = window.innerHeight - top - 12;
  const height = Math.min(el.scrollHeight, 470);
  el.style.left = `${Math.max(8, left)}px`;
  if (room < Math.min(height, 240)) {
    el.style.top = `${Math.max(8, top - height - 40)}px`;
    el.style.maxHeight = `${Math.min(470, top - 48)}px`;
  } else {
    el.style.top = `${top}px`;
    el.style.maxHeight = `${Math.min(470, room)}px`;
  }
}

function BlockMenu(props: { items: BlockId[]; index: number; focus?: boolean; onPick: (i: number) => void; onHover: (i: number) => void; onClose?: () => void; place: (el: HTMLElement) => void }) {
  const { items, index, focus, onPick, onHover, onClose, place } = props;
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) place(ref.current);
  });
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  useEffect(() => {
    ref.current?.querySelector('[aria-selected="true"], [data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  useEffect(() => {
    if (!onClose) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', down, true);
    return () => document.removeEventListener('mousedown', down, true);
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('addBlock')}
      tabIndex={-1}
      className={`${s.popover} ${s.blockMenu}`}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!onClose) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          onHover((index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
        } else if (isImeEnter(e)) {
          e.preventDefault();
          onPick(index);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {items.map((id, i) => {
        const Icon = BlockIcons[id];
        return (
          <button
            key={id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-active={i === index || undefined}
            className={s.menuItem}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(i)}
          >
            <span className={s.blockTile}>
              <Icon />
            </span>
            {t(blockLabel[id])}
          </button>
        );
      })}
    </div>
  );
}

function LinkMenu({ store, state }: { store: SuggestStore<LinkItem>; state: NonNullable<ReturnType<SuggestStore<LinkItem>['get']>> }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const rect = state.rect;
  useLayoutEffect(() => {
    if (ref.current && rect) placeBelow(ref.current, rect.left, rect.bottom + 6);
  });
  const pages = state.items.filter((x) => x.kind === 'page');
  const make = state.items.find((x) => x.kind === 'new');
  const row = (item: LinkItem, i: number, children: ReactNode, style?: CSSProperties) => (
    <button
      key={item.kind === 'page' ? item.id : 'new'}
      type="button"
      role="option"
      aria-selected={i === state.index}
      className={[s.menuItem, item.kind === 'page' && s.linkItem].filter(Boolean).join(' ')}
      style={style}
      onMouseEnter={() => store.hover(i)}
      onClick={() => store.pick(i)}
    >
      {children}
    </button>
  );
  return (
    <div ref={ref} role="listbox" aria-label={t('linkPage')} className={`${s.popover} ${s.linkMenu}`} onMouseDown={(e) => e.preventDefault()}>
      {pages.map((p, i) =>
        p.kind === 'page'
          ? row(
              p,
              i,
              <>
                <span className={s.menuIcon}>
                  <PageIcon size={16} />
                </span>
                <span className={s.linkText}>
                  <span className={s.linkTitle}>{p.title || t('untitled')}</span>
                  <span className={s.linkPath}>{p.path}</span>
                </span>
              </>,
            )
          : null,
      )}
      {make && pages.length > 0 && <div className={s.menuSep} />}
      {make &&
        row(
          make,
          pages.length,
          <>
            <span className={s.menuIcon}>
              <Plus />
            </span>
            {t('newPageNamed', { title: make.title })}
          </>,
        )}
    </div>
  );
}

function linkItems(pages: Record<string, SpacePages>, spaceId: string, spaceName: string, pageId: string, q: string): LinkItem[] {
  const space = pages[spaceId];
  if (!space) return [];
  const query = q.trim().toLowerCase();
  const hits: LinkItem[] = [];
  const walk = (list: typeof space.roots, path: string[]) => {
    for (const node of list) {
      if (node.id !== pageId && (!query || node.title.toLowerCase().includes(query))) hits.push({ kind: 'page', id: node.id, title: node.title, path: path.join(' / ') });
      walk(node.children, [...path, node.title]);
    }
  };
  walk(space.roots, [spaceName]);
  const out = hits.slice(0, 6);
  if (query && space.canCreate) out.push({ kind: 'new', title: q.trim() });
  return out;
}

function PageLinkView({ node }: NodeViewProps) {
  const t = useT();
  const navigate = useNavigate();
  const id = String(node.attrs.id ?? '');
  const title = useDocsBoards((x) => locate(x.pages, id)?.node.title);
  return (
    <NodeViewWrapper
      as="a"
      href={pagePath(id)}
      className={s.pageLink}
      draggable={false}
      onClick={(e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(pagePath(id));
      }}
    >
      <span className={s.pageLinkIcon}>
        <PageIcon size={14} />
      </span>
      {title ?? (String(node.attrs.title || '') || t('untitled'))}
    </NodeViewWrapper>
  );
}

function ImageView({ node }: NodeViewProps) {
  const store = useStore();
  const src = String(node.attrs.src ?? '');
  const [url, setUrl] = useState<{ src: string; url: string }>();
  useEffect(() => {
    if (!src.startsWith('mxc://')) return;
    let on = true;
    store.mediaUrl(src).then(
      (u) => on && setUrl({ src, url: u }),
      () => {},
    );
    return () => {
      on = false;
    };
  }, [store, src]);
  const shown = src.startsWith('mxc://') ? (url?.src === src ? url.url : undefined) : src;
  return (
    <NodeViewWrapper className={s.image}>{shown ? <img src={shown} alt={String(node.attrs.alt ?? '')} draggable={false} /> : <span className={s.imageWait} />}</NodeViewWrapper>
  );
}

function FileView({ node }: NodeViewProps) {
  const { src, name, size } = node.attrs as { src: string; name: string; size: number | null };
  return (
    <NodeViewWrapper className={s.file} contentEditable={false}>
      <FileCard messages={[{ id: src, media: { ref: src, name, size: size ?? undefined } } as Message]} />
    </NodeViewWrapper>
  );
}
