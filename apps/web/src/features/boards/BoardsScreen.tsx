// Boards main area (BoardsPage and its states): a project's board or list, My issues, the issue panel and dialogs.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { NotAvailable } from '../../app/shell/NotAvailable';
import { DrawerToggle } from '../../app/shell/Drawer';
import { myIssues, useDocsBoards, useStore, useWorkspace, type Column, type DocsBoardsSnapshot, type Issue, type Person, type Project } from '../../matrix';
import { Button, Skeleton } from '../../ui';
import { Board } from './Board';
import { ColumnDialog, DeleteIssueDialog, NewIssueDialog, NewProjectDialog } from './Dialogs';
import { BoardsGlyph, BoardViewIcon, ListViewIcon, PersonIcon, PlusIcon } from './icons';
import { IssuePanel } from './IssuePanel';
import { ListView, MineView } from './Lists';
import { boardsPath, lastProject, minePath, openNewProject, rememberProject, useBoardsRoute, useIsTeam, useNewProjectSpace, useScope, useTitleColumns, useView } from './model';
import { faceStyle, faceText, useTranslator } from './parts';
import s from './Boards.module.css';
import { useT } from './strings';

const findProject = (x: DocsBoardsSnapshot, id?: string) => (id ? Object.values(x.projects).flat().find((p) => p.id === id) : undefined);

export function BoardsScreen() {
  const t = useT();
  const store = useStore();
  const navigate = useNavigate();
  const route = useBoardsRoute();
  const { selected, scope } = useScope();
  const team = useIsTeam();
  const meId = useWorkspace((x) => x.me.id);
  const all = useDocsBoards((x) => x.projects);
  const project = useDocsBoards((x) => findProject(x, route.mine ? undefined : route.projectId));
  const panelProject = useDocsBoards((x) => findProject(x, route.projectId));
  const issue = panelProject?.issues.find((i) => i.id === route.issueId);
  const [view, setView] = useView(project?.id);
  const [filter, setFilter] = useState<{ projectId: string; person: string } | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'issue' } | { kind: 'column'; column?: Column } | { kind: 'delete'; project: Project; issue: Issue } | null>(null);
  const newProjectIn = useNewProjectSpace();
  const translator = useTranslator(panelProject?.spaceId ?? project?.spaceId);
  const viewRef = useRef<HTMLDivElement>(null);

  const [listed, setListed] = useState(false);
  useEffect(() => {
    let live = true;
    void store.docsBoards
      .ensureProjects()
      .catch(() => {})
      .then(() => live && setListed(true));
    return () => {
      live = false;
    };
  }, [store]);

  useEffect(() => {
    if (project && selected && scope.some((x) => x.id === project.spaceId)) rememberProject(selected.id, project.id);
  }, [project, selected, scope]);
  useTitleColumns(project);

  const inScope = useMemo(() => scope.flatMap((x) => all[x.id] ?? []), [scope, all]);
  // A space I only have a channel in (D-06) never gets a list: once listing is done, it has no projects.
  const scopeLoaded = !!selected && (listed || scope.every((x) => all[x.id] !== undefined));
  const mineGroups = useMemo(() => {
    const mine = myIssues({ projects: all, pages: {}, typing: {} }, meId, scope.map((x) => x.id));
    const at = (p: Project, i: Issue) => p.columns.findIndex((c) => c.id === i.column);
    return inScope
      .map((p) => ({ project: p, issues: mine.filter((i) => i.projectId === p.id).sort((a, b) => at(p, a) - at(p, b)) }))
      .filter((g) => g.issues.length);
  }, [all, meId, scope, inScope]);

  // A route's project disappeared (deleted, or not mine): once everything is listed, say so.
  const knownLoaded = Object.keys(all).length > 0;

  if (!route.mine && !route.projectId) {
    if (!scopeLoaded) return <Loading />;
    const last = selected && lastProject(selected.id);
    const target = inScope.find((p) => p.id === last) ?? inScope[0];
    if (target) return <Navigate to={boardsPath(target.id)} replace />;
    return (
      <div className={s.screen}>
        <NoProjects team={team} onNew={() => selected && openNewProject(selected.id)} />
        {newProjectIn && <NewProjectDialog spaceId={newProjectIn} onClose={() => openNewProject(null)} />}
      </div>
    );
  }
  if (!route.mine && !project) {
    return knownLoaded && scopeLoaded ? <NotAvailable /> : <Loading />;
  }

  const close = () => {
    const opener = viewRef.current?.querySelector<HTMLElement>(`.${s.cardSelected}, .${s.rowSelected}`);
    navigate(route.mine ? minePath() : boardsPath(route.projectId), { replace: true });
    opener?.focus();
  };
  // The panel lies over the board: a click on the board itself (not a card, control or menu) closes it.
  const onViewClick = (e: MouseEvent) => {
    if (issue && e.target instanceof Element && !e.target.closest('button, a, input, textarea, select, [role="button"], [role="radio"], [role^="menu"]')) close();
  };
  const openIssue = (p: Project, i: Issue) => navigate(route.mine ? minePath(p.id, i.id) : boardsPath(p.id, i.id));
  const activeFilter = project && filter?.projectId === project.id ? filter.person : undefined;
  const shown = project ? (activeFilter ? project.issues.filter((i) => i.assignee?.id === activeFilter) : project.issues) : [];
  const projectsForNew = (project && !inScope.includes(project) ? [project, ...inScope] : inScope).filter((p) => !p.loading);

  return (
    <div className={s.screen}>
      <header className={s.header}>
        <DrawerToggle />
        <h1 className={s.heading}>
          {route.mine ? (
            <span className={s.headIcon}>
              <PersonIcon size={18} />
            </span>
          ) : (
            <span className={s.headSwatch} style={{ background: project!.colour }} />
          )}
          <span>{route.mine ? t('myIssues') : project!.name}</span>
        </h1>
        {project && (
          <div role="radiogroup" aria-label={t('view')} className={s.segments}>
            <button type="button" role="radio" aria-checked={view === 'board'} className={s.segment} onClick={() => setView('board')}>
              <BoardViewIcon />
              {t('board')}
            </button>
            <button type="button" role="radio" aria-checked={view === 'list'} className={s.segment} onClick={() => setView('list')}>
              <ListViewIcon />
              {t('list')}
            </button>
          </div>
        )}
        <span className={s.spacer} />
        {project && (
          <Filter project={project} value={activeFilter} onChange={(person) => setFilter(person ? { projectId: project.id, person } : null)} />
        )}
        {projectsForNew.length > 0 && (
          <button type="button" className={s.newIssue} onClick={() => setDialog({ kind: 'issue' })}>
            <PlusIcon strokeWidth={2.2} />
            {t('newIssue')}
          </button>
        )}
      </header>
      <div className={s.body}>
        <div ref={viewRef} className={s.view} onClick={onViewClick}>
          {route.mine ? (
            scopeLoaded ? (
              <MineView groups={mineGroups} selectedId={route.issueId} onOpen={openIssue} />
            ) : (
              <BoardSkeleton />
            )
          ) : project!.loading ? (
            <BoardSkeleton />
          ) : view === 'list' ? (
            <ListView project={project!} issues={shown} selectedId={route.issueId} onOpen={(i) => openIssue(project!, i)} />
          ) : (
            <Board
              project={project!}
              issues={shown}
              selectedId={route.issueId}
              translator={translator}
              onOpen={(i) => openIssue(project!, i)}
              onDelete={(i) => setDialog({ kind: 'delete', project: project!, issue: i })}
              onNewColumn={() => setDialog({ kind: 'column' })}
              onRenameColumn={(column) => setDialog({ kind: 'column', column })}
            />
          )}
        </div>
        {panelProject && issue && (
          <IssuePanel
            key={issue.id}
            project={panelProject}
            issue={issue}
            translator={translator}
            onClose={close}
            onDelete={() => setDialog({ kind: 'delete', project: panelProject, issue })}
          />
        )}
      </div>
      {dialog?.kind === 'issue' && <NewIssueDialog projects={projectsForNew} projectId={project?.id ?? projectsForNew[0]!.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'column' && project && <ColumnDialog project={project} column={dialog.column} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && (
        <DeleteIssueDialog
          project={dialog.project}
          issue={dialog.issue}
          onClose={() => setDialog(null)}
          onDeleted={() => dialog.issue.id === route.issueId && close()}
        />
      )}
      {newProjectIn && <NewProjectDialog spaceId={newProjectIn} onClose={() => openNewProject(null)} />}
    </div>
  );
}

function Filter({ project, value, onChange }: { project: Project; value?: string; onChange: (person?: string) => void }) {
  const t = useT();
  const people = useMemo(() => {
    const seen = new Map<string, Person>();
    for (const i of project.issues) if (i.assignee && !seen.has(i.assignee.id)) seen.set(i.assignee.id, i.assignee);
    return [...seen.values()].slice(0, 5);
  }, [project.issues]);
  if (!people.length) return null;
  return (
    <div role="group" aria-label={t('filter')} className={[s.filter, value && s.filtering].filter(Boolean).join(' ')}>
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          className={s.filterFace}
          style={faceStyle(p)}
          aria-label={p.name}
          title={p.name}
          aria-pressed={value === p.id}
          onClick={() => onChange(value === p.id ? undefined : p.id)}
        >
          {faceText(p)}
        </button>
      ))}
    </div>
  );
}

function NoProjects({ team, onNew }: { team: boolean; onNew: () => void }) {
  const t = useT();
  return (
    <div className={s.empty}>
      <header className={s.bareHeader}>
        <DrawerToggle />
      </header>
      <div className={s.emptyIcon}>
        <BoardsGlyph />
      </div>
      <h2 className={s.emptyTitle}>{t('noProjects')}</h2>
      {team && (
        <Button className={s.emptyButton} icon={<PlusIcon strokeWidth={2.2} />} onClick={onNew}>
          {t('newProject')}
        </Button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className={s.screen}>
      <header className={s.bareHeader}>
        <DrawerToggle />
      </header>
      <BoardSkeleton />
    </div>
  );
}

const skel = [
  { w: 52, cards: [[82], [94, 46], [68]] },
  { w: 78, cards: [[90, 38], [74]] },
  { w: 66, cards: [[62], [88]] },
  { w: 40, cards: [[76], [92, 52], [58]] },
];

export function BoardSkeleton() {
  return (
    <div className={s.scroller} aria-busy="true" style={{ overflow: 'hidden' }}>
      <div className={s.grid} style={{ '--cols': 4 } as CSSProperties}>
        {skel.map((col, ci) => (
          <section key={ci} aria-hidden="true" className={s.col}>
            <div className={s.colHeadRow}>
              <Skeleton width={14} height={14} radius={7} />
              <Skeleton width={col.w} height={10} />
            </div>
            {col.cards.map(([w, w2], ki) => (
              <div key={ki} className={s.skelCard}>
                <div className={s.skelTop}>
                  <Skeleton width={46} height={9} />
                  <Skeleton width={22} height={22} />
                </div>
                <Skeleton width={`${w}%`} height={11} />
                {w2 && <Skeleton width={`${w2}%`} height={11} />}
                <Skeleton width={62} height={9} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
