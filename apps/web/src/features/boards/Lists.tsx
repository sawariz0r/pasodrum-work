// List view (BoardsList) and My issues (BoardsMine). No drag here: the order is derived; the card menu moves.
import type { KeyboardEvent } from 'react';
import { isImeEnter } from '../../ui';
import type { Issue, Project } from '../../matrix';
import { ColumnIcon } from './icons';
import { issueKey, useColumnName } from './model';
import { Comments, DueLabel, useCommentCount, Who } from './parts';
import s from './Boards.module.css';

export function ListView({ project, issues, selectedId, onOpen }: { project: Project; issues: Issue[]; selectedId?: string; onOpen: (i: Issue) => void }) {
  const name = useColumnName();
  return (
    <div className={s.list}>
      {project.columns.map((c) => {
        const rows = issues.filter((i) => i.column === c.id);
        return (
          <div key={c.id} role="group" aria-label={name(c)}>
            <div className={s.listHead}>
              <ColumnIcon id={c.id} />
              <span className={s.listName}>{name(c)}</span>
              <span className={s.colCount}>{rows.length}</span>
            </div>
            {rows.map((i) => (
              <Row key={i.id} project={project} issue={i} selected={i.id === selectedId} onOpen={() => onOpen(i)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function MineView({ groups, selectedId, onOpen }: { groups: { project: Project; issues: Issue[] }[]; selectedId?: string; onOpen: (p: Project, i: Issue) => void }) {
  return (
    <div className={s.list}>
      {groups.map(({ project, issues }) => (
        <div key={project.id} role="group" aria-label={project.name}>
          <div className={`${s.listHead} ${s.mineHead}`}>
            <span className={s.swatch} style={{ background: project.colour, boxShadow: 'none' }} />
            <span className={s.listName}>{project.name}</span>
            <span className={s.colCount}>{issues.length}</span>
          </div>
          {issues.map((i) => (
            <Row key={i.id} project={project} issue={i} mine selected={i.id === selectedId} onOpen={() => onOpen(project, i)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Row({ project, issue, mine, selected, onOpen }: { project: Project; issue: Issue; mine?: boolean; selected: boolean; onOpen: () => void }) {
  const comments = useCommentCount(project.id, issue.id);
  const onKeyDown = (e: KeyboardEvent) => {
    if (isImeEnter(e) || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className={[s.row, mine && s.mineGrid, selected && s.rowSelected].filter(Boolean).join(' ')}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {mine && <ColumnIcon id={issue.column} />}
      <span className={s.rowKey}>{issueKey(project, issue)}</span>
      <span className={[s.rowTitle, issue.column === 'done' && s.doneInk].filter(Boolean).join(' ')}>{issue.title}</span>
      <span>
        <DueLabel issue={issue} list />
      </span>
      <span>
        <Comments count={comments} list />
      </span>
      <span className={s.rowEnd}>
        <Who person={issue.assignee} />
      </span>
    </div>
  );
}
