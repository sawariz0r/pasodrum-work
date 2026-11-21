// The Boards column (BoardsPage, BoardsAll): My issues, All issues, then the lit space's projects (D-42).
import { Link } from 'react-router';
import shell from '../../app/shell/Shell.module.css';
import { myIssues, useDocsBoards, useWorkspace, type Project } from '../../matrix';
import { Badge, IconButton, sideRow } from '../../ui';
import { AllIssuesIcon, PencilIcon, PersonIcon } from './icons';
import { allPath, boardsPath, minePath, openNewProject, useBoardsRoute, useIsTeam, useScope } from './model';
import s from './Boards.module.css';
import { useT } from './strings';
import { useProjectUnread } from './unread';

const none: Project[] = [];

export function BoardsColumn() {
  const t = useT();
  const route = useBoardsRoute();
  const { selected } = useScope();
  const team = useIsTeam();
  const meId = useWorkspace((x) => x.me.id);
  const spaceIds = useWorkspace((x) => x.spaces.map((sp) => sp.id).join('\n'));
  const mine = useDocsBoards((x) => myIssues(x, meId, spaceIds ? spaceIds.split('\n') : []).length);
  const projects = useDocsBoards((x) => (selected && x.projects[selected.id]) || none);
  const activeId = route.mine || route.all ? undefined : route.projectId;

  return (
    <aside aria-label={t('boards')} className={`${shell.sidebar} ${s.column}`}>
      <div className={shell.sideHead}>
        <h1 className={s.colTitle}>{t('boards')}</h1>
        {team && selected && <IconButton outline label={t('newProject')} icon={<PencilIcon />} onClick={() => openNewProject(selected.id)} />}
      </div>
      <nav className={s.nav}>
        <Link to={minePath()} className={sideRow.row} aria-current={route.mine ? 'page' : undefined}>
          <span className={sideRow.icon}>
            <PersonIcon />
          </span>
          <span className={sideRow.name}>{t('myIssues')}</span>
          {mine > 0 && <span className={sideRow.count}>{mine}</span>}
        </Link>
        {team && selected?.kind === 'workspace' && (
          <Link to={allPath()} className={sideRow.row} aria-current={route.all ? 'page' : undefined}>
            <span className={sideRow.icon}>
              <AllIssuesIcon />
            </span>
            <span className={sideRow.name}>{t('allIssues')}</span>
          </Link>
        )}
        <div className={s.navGap} />
        {projects.map((p) => (
          <ProjectRow key={p.id} project={p} current={p.id === activeId} />
        ))}
      </nav>
    </aside>
  );
}

/** Unread like a channel row: bold, with the mention badge (issue mentions and assignments for me). */
function ProjectRow({ project, current }: { project: Project; current: boolean }) {
  const unread = useProjectUnread(project.id);
  return (
    <Link to={boardsPath(project.id)} className={[sideRow.row, !current && unread > 0 && sideRow.strong].filter(Boolean).join(' ')} aria-current={current ? 'page' : undefined}>
      <span className={sideRow.icon}>
        <span className={s.swatch} style={{ background: project.colour }} />
      </span>
      <span className={sideRow.name}>{project.name}</span>
      {!current && <Badge count={unread} />}
    </Link>
  );
}
