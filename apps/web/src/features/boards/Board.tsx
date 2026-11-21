// Board view (BoardsPage, BoardsDrag, BoardsQuickAdd, BoardsEmpty, BoardsCardTranslate).
// Drag: pragmatic-drag-and-drop on fine pointers; the board is one drop target and the landing place is worked out
// from the pointer (column by x, index by card midpoints), as on the canvas. A move is one moveIssue (fractional order).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/utils/preserve-offset-on-source';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { useToast } from '../../app/toast';
import { useStore, type Column, type Issue, type Project } from '../../matrix';
import { DropLine, isImeEnter } from '../../ui';
import { CardMenu } from './CardMenu';
import { ColumnIcon, MoreIcon, PlusIcon } from './icons';
import { LiveBoard, LiveLines, useLiveCard } from './Live';
import { issueKey, useColumnName } from './model';
import { Comments, DueLabel, useCommentCount, useTranslated, Who, type Translator } from './parts';
import s from './Boards.module.css';
import { useT } from './strings';

type Drag = { id: string; column?: string; index?: number };

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function landing(grid: HTMLElement, x: number, y: number, dragId: string): { column: string; index: number } | null {
  const cols = [...grid.querySelectorAll<HTMLElement>('[data-col]')];
  if (!cols.length) return null;
  const dist = (c: HTMLElement) => {
    const r = c.getBoundingClientRect();
    return x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
  };
  const col = cols.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  const mids = [...col.querySelectorAll<HTMLElement>('[data-card]')]
    .filter((n) => n.dataset.card !== dragId)
    .map((n) => {
      const r = n.getBoundingClientRect();
      return r.top + r.height / 2;
    });
  return { column: col.dataset.col!, index: mids.filter((m) => y > m).length };
}

type BoardProps = {
  project: Project;
  issues: Issue[];
  selectedId?: string;
  translator: Translator | null;
  onOpen: (issue: Issue) => void;
  onDelete: (issue: Issue) => void;
  onNewColumn: () => void;
};

export function Board({ project, issues, selectedId, translator, onOpen, onDelete, onNewColumn }: BoardProps) {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [canDrag] = useState(() => !coarse());
  const latest = useRef({ project, issues });
  useLayoutEffect(() => {
    latest.current = { project, issues };
  });

  useEffect(() => {
    const el = grid.current;
    const sc = scroller.current;
    if (!canDrag || !el || !sc) return;
    const mine = ({ source }: { source: { data: Record<string | symbol, unknown> } }) => source.data.projectId === project.id;
    return combine(
      dropTargetForElements({
        element: el,
        canDrop: mine,
        onDrag: ({ source, location }) => {
          const id = source.data.id as string;
          const at = landing(el, location.current.input.clientX, location.current.input.clientY, id);
          setDrag((d) => (d && d.column === at?.column && d.index === at?.index ? d : { id, ...at }));
        },
        onDragLeave: ({ source }) => setDrag({ id: source.data.id as string }),
      }),
      monitorForElements({
        canMonitor: mine,
        onDragStart: ({ source }) => setDrag({ id: source.data.id as string }),
        onDrop: ({ source, location }) => {
          setDrag(null);
          if (!location.current.dropTargets.length) return;
          const id = source.data.id as string;
          const at = landing(el, location.current.input.clientX, location.current.input.clientY, id);
          const { project: p, issues: shown } = latest.current;
          const issue = p.issues.find((i) => i.id === id);
          if (!at || !issue) return;
          const list = shown.filter((i) => i.column === at.column && i.id !== id);
          const before = list[at.index - 1]?.id;
          const after = list[at.index]?.id;
          const now = shown.filter((i) => i.column === issue.column);
          const pos = now.findIndex((i) => i.id === id);
          if (at.column === issue.column && now[pos - 1]?.id === before && now[pos + 1]?.id === after) return;
          store.docsBoards
            .moveIssue(p.id, id, { column: at.column, ...(before ? { before } : {}), ...(after ? { after } : {}) })
            .catch(() => toast(t('couldntMove', { key: issueKey(p, issue) })));
        },
      }),
      autoScrollForElements({ element: sc }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` changes identity every render; the handlers read it when they run
  }, [canDrag, project.id, store, toast]);

  const columns = project.columns;
  const style = { '--cols': columns.length } as CSSProperties;

  return (
    <LiveBoard project={project} issues={issues} drag={drag}>
      <div className={s.scroller} ref={scroller}>
        <div className={s.grid} style={style} ref={grid}>
          {columns.map((c) => {
            const cards = issues.filter((i) => i.column === c.id);
            const over = !!drag && drag.column === c.id;
            const rest = drag ? cards.filter((i) => i.id !== drag.id) : cards;
            const lineAfter = over && drag.index! > 0 ? rest[drag.index! - 1]?.id : undefined;
            return (
              <ColumnSection
                key={c.id}
                column={c}
                count={cards.length}
                over={over}
                lineTop={over && drag.index === 0}
                adding={adding === c.id}
                onStartAdd={() => setAdding(c.id)}
                onStopAdd={() => setAdding((a) => (a === c.id ? null : a))}
                project={project}
              >
                {cards.map((i) => (
                  <Card
                    key={i.id}
                    project={project}
                    issue={i}
                    done={c.id === 'done'}
                    selected={i.id === selectedId}
                    lifted={drag?.id === i.id}
                    lineAfter={lineAfter === i.id}
                    canDrag={canDrag}
                    translator={translator}
                    onOpen={() => onOpen(i)}
                    onDelete={() => onDelete(i)}
                  />
                ))}
              </ColumnSection>
            );
          })}
          {project.canAddColumn && (
            <button type="button" className={s.addColumn} aria-label={t('newColumn')} onClick={onNewColumn}>
              <PlusIcon size={17} />
            </button>
          )}
        </div>
      </div>
    </LiveBoard>
  );
}

function ColumnSection({
  column,
  count,
  over,
  lineTop,
  adding,
  onStartAdd,
  onStopAdd,
  project,
  children,
}: {
  column: Column;
  count: number;
  over: boolean;
  lineTop: boolean;
  adding: boolean;
  onStartAdd: () => void;
  onStopAdd: () => void;
  project: Project;
  children: ReactNode;
}) {
  const t = useT();
  const name = useColumnName()(column);
  return (
    <section aria-label={name} data-col={column.id} className={[s.col, over && s.colOver].filter(Boolean).join(' ')}>
      <div className={s.colHeadRow}>
        {lineTop && <DropLine ring inset={4} />}
        <LiveLines column={column.id} />
        <ColumnIcon id={column.id} />
        <span className={s.colName}>{name}</span>
        <span className={s.colCount}>{count}</span>
      </div>
      {children}
      {adding ? (
        <QuickAdd project={project} column={column.id} onDone={onStopAdd} />
      ) : (
        <button type="button" className={s.quick} aria-label={t('addTo', { column: name })} onClick={onStartAdd}>
          <PlusIcon />
        </button>
      )}
    </section>
  );
}

function QuickAdd({ project, column, onDone }: { project: Project; column: string; onDone: () => void }) {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onDone();
      return;
    }
    if (!isImeEnter(e)) return;
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    setTitle('');
    store.docsBoards.createIssue(project.id, { title: text, column }).catch(() => {
      setTitle((now) => now || text);
      toast(t('couldntCreate'));
    });
  };
  return (
    <div className={s.adding}>
      <input
        className={s.bareInput}
        aria-label={t('titleField')}
        placeholder={t('titleField')}
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => !title.trim() && onDone()}
      />
    </div>
  );
}

type CardProps = {
  project: Project;
  issue: Issue;
  done: boolean;
  selected: boolean;
  lifted: boolean;
  lineAfter: boolean;
  canDrag: boolean;
  translator: Translator | null;
  onOpen: () => void;
  onDelete: () => void;
};

function Card({ project, issue, done, selected, lifted, lineAfter, canDrag, translator, onOpen, onDelete }: CardProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const comments = useCommentCount(project.id, issue.id);
  const tr = useTranslated(translator, `${issue.id}:title`, issue.title);
  const key = issueKey(project, issue);
  const live = useLiveCard(issue.id);

  useEffect(() => {
    const el = ref.current;
    if (!canDrag || !el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ projectId: project.id, id: issue.id }),
      onGenerateDragPreview: ({ nativeSetDragImage, location }) => {
        const offset = preserveOffsetOnSource({ element: el, input: location.current.input });
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: (args) => {
            const o = offset(args);
            return { x: o.x + 16, y: o.y + 16 };
          },
          render: ({ container }) => {
            const wrap = document.createElement('div');
            wrap.className = s.preview ?? '';
            const copy = el.cloneNode(true) as HTMLElement;
            copy.style.width = `${el.offsetWidth}px`;
            copy.classList.remove(s.cardForce ?? '');
            wrap.appendChild(copy);
            container.appendChild(wrap);
          },
        });
      },
    });
  }, [canDrag, project.id, issue.id]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (isImeEnter(e) || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenu(true);
  };
  const stop = (e: MouseEvent) => e.stopPropagation();
  const translated = tr.phase === 'translated';

  return (
    <div data-card={issue.id} className={[s.slot, lifted && s.slotLifted].filter(Boolean).join(' ')}>
      {lineAfter && <DropLine ring inset={4} />}
      <LiveLines column={issue.column} after={issue.id} />
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        className={[s.card, menu && s.cardForce, selected && s.cardSelected, live.className].filter(Boolean).join(' ')}
        style={live.style}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        onContextMenu={onContextMenu}
      >
        {live.flag}
        <div className={s.cardTop}>
          <span className={s.key}>{key}</span>
          <span className={s.spacer} />
          <CardMenu
            project={project}
            issue={issue}
            open={menu}
            onOpenChange={setMenu}
            onOpenIssue={onOpen}
            onDelete={onDelete}
            trigger={
              <button type="button" className={`${s.tool} ${s.reveal}`} aria-label={t('more')} onClick={stop} onPointerDown={stop}>
                <MoreIcon />
              </button>
            }
          />
          {translator && (translated || (tr.offered && tr.phase !== 'translating')) && (
            <button
              type="button"
              className={[s.tool, translated ? s.toolOn : s.reveal].join(' ')}
              aria-label={translated ? translator.labels.showOriginal : translator.labels.translate}
              title={translated ? translator.labels.showOriginal : undefined}
              onClick={(e) => {
                stop(e);
                tr.toggle();
              }}
            >
              {translator.icon}
            </button>
          )}
          <Who person={issue.assignee} />
        </div>
        <div className={[s.cardTitle, done && s.doneInk, tr.phase === 'translating' && s.translating].filter(Boolean).join(' ')}>
          {translated ? (tr.text ?? issue.title) : issue.title}
        </div>
        {(issue.due || comments > 0) && (
          <div className={s.meta}>
            <DueLabel issue={issue} />
            <Comments count={comments} />
          </div>
        )}
      </div>
    </div>
  );
}
