// The Boards column (BoardsPage, BoardsNordlys): My issues, then the projects of each space in scope, grouped.
import { useState } from 'react';
import { Link } from 'react-router';
import shell from '../../app/shell/Shell.module.css';
import { CompanyTile } from '../../app/people/Face';
import { useShowExternal } from '../../app/people/names';
import { myIssues, useDocsBoards, useWorkspace, type Project, type Space } from '../../matrix';
import { Badge, IconButton } from '../../ui';
import { ChevronDownIcon, PencilIcon, PersonIcon, PlusIcon } from './icons';
import { boardsPath, minePath, openNewProject, useBoardsRoute, useIsTeam, useScope } from './model';
import s from './Boards.module.css';
import { useT } from './strings';
import { useProjectUnread } from './unread';

const none: Project[] = [];

export function BoardsColumn() {
  const t = useT();
  const route = useBoardsRoute();
  const { selected, scope } = useScope();
  const team = useIsTeam();
  const meId = useWorkspace((x) => x.me.id);
  const scopeIds = scope.map((x) => x.id).join('\n');
  const mine = useDocsBoards((x) => myIssues(x, meId, scopeIds ? scopeIds.split('\n') : []).length);

  return (
    <aside aria-label={t('boards')} className={`${shell.sidebar} ${s.column}`}>
      <div className={s.colHead}>
        <h1 className={s.colTitle}>{t('boards')}</h1>
        {team && selected && <IconButton outline label={t('newProject')} icon={<PencilIcon />} onClick={() => openNewProject(selected.id)} />}
      </div>
      <nav className={s.nav}>
        <Link to={minePath()} className={`${s.navRow} ${s.mineRow}`} aria-current={route.mine ? 'page' : undefined}>
          <span>
            <PersonIcon />
          </span>
          <span className={s.navName}>{t('myIssues')}</span>
          {mine > 0 && <span className={s.mineCount}>{mine}</span>}
        </Link>
        {scope.map((space) => (
          <SpaceGroup key={space.id} space={space} team={team} activeId={route.mine ? undefined : route.projectId} />
        ))}
      </nav>
    </aside>
  );
}

function SpaceGroup({ space, team, activeId }: { space: Space; team: boolean; activeId?: string }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const showExternal = useShowExternal();
  const projects = useDocsBoards((x) => x.projects[space.id] ?? none);
  return (
    <>
      <div className={s.group}>
        <button type="button" className={s.groupToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>
            <ChevronDownIcon />
          </span>
          {space.kind === 'client' && showExternal && <CompanyTile space={space} size={14} label={t('outside')} />}
          <span className={s.groupName}>{space.name}</span>
        </button>
        {team && (
          <button type="button" className={s.groupAdd} aria-label={t('newProject')} onClick={() => openNewProject(space.id)}>
            <PlusIcon size={14} />
          </button>
        )}
      </div>
      {open &&
        projects.map((p) => <ProjectRow key={p.id} project={p} current={p.id === activeId} />)}
    </>
  );
}

/** Unread like a channel row: bold, with the mention badge (issue mentions and assignments for me). */
function ProjectRow({ project, current }: { project: Project; current: boolean }) {
  const unread = useProjectUnread(project.id);
  return (
    <Link to={boardsPath(project.id)} className={[s.navRow, !current && unread > 0 && s.navStrong].filter(Boolean).join(' ')} aria-current={current ? 'page' : undefined}>
      <span className={s.swatch} style={{ background: project.colour }} />
      <span className={s.navName}>{project.name}</span>
      {!current && <Badge count={unread} className={s.navBadge} />}
    </Link>
  );
}
