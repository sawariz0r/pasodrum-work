// The Boards column (BoardsPage, BoardsNordlys): My issues, then the projects of each space in scope, grouped.
import { useState } from 'react';
import { Link } from 'react-router';
import shell from '../../app/shell/Shell.module.css';
import { CompanyTile } from '../../app/people/Face';
import { useShowExternal } from '../../app/people/names';
import { myIssues, useDocsBoards, useWorkspace, type Project, type Space } from '../../matrix';
import { Badge, IconButton, SideHeading, sideRow } from '../../ui';
import { PencilIcon, PersonIcon, PlusIcon } from './icons';
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
      <SideHeading
        open={open}
        onToggle={() => setOpen(!open)}
        lead={space.kind === 'client' && showExternal && <CompanyTile space={space} size={14} label={t('outside')} />}
        label={space.name}
        action={team && <IconButton size={24} className={sideRow.sectionAction} label={t('newProject')} icon={<PlusIcon size={14} strokeWidth={2.2} />} onClick={() => openNewProject(space.id)} />}
      />
      {open &&
        projects.map((p) => <ProjectRow key={p.id} project={p} current={p.id === activeId} />)}
    </>
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
