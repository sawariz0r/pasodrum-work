// The Docs tree (DocsPage, DocsNordlys, DocsDragPage): one group per space in scope, pages nested, drag to move.
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CompanyTile } from '../../app/people/Face';
import { useShowExternal } from '../../app/people/names';
import shell from '../../app/shell/Shell.module.css';
import { useToast } from '../../app/toast';
import { useDocsBoards, useStore, type PageNode, type Space } from '../../matrix';
import { DropLine, IconButton, SideHeading, Skeleton, sideRow } from '../../ui';
import { ChevronDown, ChevronRight, PageIcon, Pencil, PlusBold, Search } from './icons';
import { flatten, locate, useScope } from './model';
import { pagePath, useCreatePage } from './actions';
import { useT } from './strings';
import s from './DocsColumn.module.css';

type Mode = 'before' | 'nest' | 'child' | 'after';
type Drop = { ref: string; mode: Mode };
type DragData = { type: 'docs-page'; id: string; spaceId: string };

const isPage = (d: Record<string | symbol, unknown>): d is DragData => d.type === 'docs-page';

export function DocsColumn() {
  const t = useT();
  const { pageId } = useParams();
  const { selected, scope } = useScope();
  const create = useCreatePage();
  const [query, setQuery] = useState('');
  const canCreate = useDocsBoards((x) => !!selected && !!x.pages[selected.id]?.canCreate);

  return (
    <aside aria-label={t('docs')} className={shell.sidebar}>
      <div className={shell.sideHead}>
        <h1 className={s.title}>{t('docs')}</h1>
        {selected && canCreate && <IconButton outline label={t('newPage')} icon={<Pencil />} onClick={() => create({ spaceId: selected.id })} />}
      </div>
      <div className={s.searchRow}>
        <label className={s.search}>
          <Search />
          <input className={s.searchInput} type="search" value={query} placeholder={t('search')} aria-label={t('search')} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <Tree scope={scope} activeId={pageId} query={query.trim().toLowerCase()} />
    </aside>
  );
}

function Tree({ scope, activeId, query }: { scope: Space[]; activeId?: string; query: string }) {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const listRef = useRef<HTMLElement>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const pages = useDocsBoards((x) => x.pages);
  const activePath = useMemo(() => (activeId ? locate(pages, activeId)?.path : undefined), [pages, activeId]);

  // The active page's ancestors open whenever it changes (a deep link, a move).
  const [openedFor, setOpenedFor] = useState<string | undefined>();
  if (activeId !== openedFor && activePath) {
    setOpenedFor(activeId);
    if (activePath.some((p) => closed.has(p.id))) setClosed((c) => new Set([...c].filter((id) => !activePath.some((p) => p.id === id))));
  }

  const toggle = (id: string) => setClosed((c) => (c.has(id) ? new Set([...c].filter((x) => x !== id)) : new Set([...c, id])));

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    return combine(
      autoScrollForElements({ element: list }),
      monitorForElements({
        canMonitor: ({ source }) => isPage(source.data),
        onDrag: ({ location }) => {
          const target = location.current.dropTargets[0]?.data as Drop | undefined;
          setDrop((prev) => (target ? (prev?.ref === target.ref && prev.mode === target.mode ? prev : { ref: target.ref, mode: target.mode }) : null));
        },
        onDrop: ({ location, source }) => {
          setDrop(null);
          const target = location.current.dropTargets[0]?.data as Drop | undefined;
          if (!target || !isPage(source.data)) return;
          const snap = store.docsBoards.getSnapshot().pages;
          const ref = locate(snap, target.ref);
          const moved = locate(snap, source.data.id);
          if (!ref || !moved) return;
          const parent = ref.path.at(-1)?.id;
          const to =
            target.mode === 'before'
              ? { parent, after: ref.node.id }
              : target.mode === 'after'
                ? { parent, before: ref.node.id }
                : target.mode === 'child'
                  ? { parent: ref.node.id, ...(ref.node.children.find((c) => c.id !== moved.node.id) && { after: ref.node.children.find((c) => c.id !== moved.node.id)!.id }) }
                  : { parent: ref.node.id };
          if (target.mode === 'nest' || target.mode === 'child') setClosed((c) => new Set([...c].filter((id) => id !== ref.node.id)));
          store.docsBoards.movePage(moved.node.id, to).catch(() => toast(t('moveFailed', { title: moved.node.title || t('untitled') })));
        },
      }),
    );
  }, [store, toast, t]);

  return (
    <nav ref={listRef} aria-label={t('docs')} className={s.list}>
      {scope.map((space) => (
        <Group key={space.id} space={space} activeId={activeId} query={query} closed={closed} toggle={toggle} drop={drop} />
      ))}
    </nav>
  );
}

function Group(props: { space: Space; activeId?: string; query: string; closed: ReadonlySet<string>; toggle: (id: string) => void; drop: Drop | null }) {
  const { space, activeId, query, closed, toggle, drop } = props;
  const t = useT();
  const create = useCreatePage();
  const showExternal = useShowExternal();
  const pages = useDocsBoards((x) => x.pages[space.id]);
  const [folded, setFolded] = useState(false);

  const rows: { node: PageNode; depth: number; ancestry: string[] }[] = [];
  if (pages && query) {
    for (const { node } of flatten(pages.roots)) if (node.title.toLowerCase().includes(query)) rows.push({ node, depth: 0, ancestry: [node.id] });
  } else if (pages) {
    const walk = (list: PageNode[], depth: number, ancestry: string[]) => {
      for (const node of list) {
        rows.push({ node, depth, ancestry: [...ancestry, node.id] });
        if (!closed.has(node.id)) walk(node.children, depth + 1, [...ancestry, node.id]);
      }
    };
    walk(pages.roots, 0, []);
  }

  return (
    <div role="group" aria-label={space.name}>
      <SideHeading
        open={!folded}
        onToggle={() => setFolded(!folded)}
        lead={space.kind === 'client' && showExternal && <CompanyTile space={space} size={14} />}
        label={space.name}
        action={
          pages?.canCreate && (
            <IconButton size={24} className={sideRow.sectionAction} label={t('newPage')} icon={<PlusBold size={14} />} onClick={() => create({ spaceId: space.id })} />
          )
        }
      />
      {!folded &&
        (pages ? (
          rows.map((r) => (
            <Row
              key={r.node.id}
              node={r.node}
              depth={r.depth}
              ancestry={r.ancestry}
              active={r.node.id === activeId}
              open={!query && !closed.has(r.node.id)}
              flat={!!query}
              canMove={pages.canCreate && !query}
              toggle={toggle}
              drop={drop?.ref === r.node.id ? drop.mode : null}
            />
          ))
        ) : (
          <div className={s.loadingRows} aria-hidden="true">
            <Skeleton width="72%" height={12} />
            <Skeleton width="54%" height={12} />
            <Skeleton width="64%" height={12} />
          </div>
        ))}
    </div>
  );
}

const pageSvg =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>';

function Row(props: {
  node: PageNode;
  depth: number;
  ancestry: string[];
  active: boolean;
  open: boolean;
  flat: boolean;
  canMove: boolean;
  toggle: (id: string) => void;
  drop: Mode | null;
}) {
  const { node, depth, ancestry, active, open, flat, canMove, toggle, drop } = props;
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(false);
  const title = node.title || t('untitled');
  const hasChildren = !flat && node.children.length > 0;
  const ancestryKey = ancestry.join('|');

  useEffect(() => {
    const el = ref.current;
    if (!el || !canMove) return;
    const inside = ancestryKey.split('|');
    return combine(
      draggable({
        element: el,
        getInitialData: (): DragData => ({ type: 'docs-page', id: node.id, spaceId: node.spaceId }),
        onGenerateDragPreview: ({ nativeSetDragImage }) =>
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: pointerOutsideOfPreview({ x: '8px', y: '4px' }),
            render({ container }) {
              const chip = document.createElement('div');
              chip.className = s.preview!;
              const icon = document.createElement('span');
              icon.className = s.previewIcon!;
              icon.innerHTML = pageSvg;
              chip.append(icon, document.createTextNode(title));
              container.append(chip);
            },
          }),
        onDragStart: () => setLifted(true),
        onDrop: () => setLifted(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isPage(source.data) && source.data.spaceId === node.spaceId && !inside.includes(source.data.id),
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const r = element.getBoundingClientRect();
          const f = (input.clientY - r.top) / r.height;
          const mode: Mode = f < 0.3 ? 'before' : f <= 0.7 ? 'nest' : open && node.children.length ? 'child' : 'after';
          return { ref: node.id, mode };
        },
      }),
    );
  }, [canMove, node.id, node.spaceId, node.children.length, open, title, ancestryKey]);

  const nest = drop === 'nest';
  const pad = 10 + depth * 18;
  return (
    <div ref={ref} className={s.item}>
      {drop && !nest && <DropLine edge="top" offset={drop === 'before' ? 2 : -29} inset={drop === 'child' ? pad + 18 : pad} />}
      <div
        className={[sideRow.row, active && !nest && sideRow.current, nest && s.nest, lifted && s.lifted, node.pending && s.pending].filter(Boolean).join(' ')}
        style={{ paddingLeft: pad }}
      >
        <Link to={pagePath(node.id)} className={sideRow.link} aria-current={active ? 'page' : undefined} draggable={false}>
          <span className={sideRow.icon}>
            <PageIcon size={16} />
          </span>
          <span className={sideRow.name}>{title}</span>
        </Link>
        {hasChildren && (
          <button type="button" className={sideRow.chevron} aria-label={title} aria-expanded={open} onClick={() => toggle(node.id)}>
            {open ? <ChevronDown /> : <ChevronRight />}
          </button>
        )}
      </div>
    </div>
  );
}
