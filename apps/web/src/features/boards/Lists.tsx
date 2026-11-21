// List view (BoardsList), My issues (BoardsMine) and All issues (BoardsAll). No drag here: the order is derived; the card menu moves.
import type { KeyboardEvent } from 'react';
import { CompanyTile } from '../../app/people/Face';
import { useShowExternal } from '../../app/people/names';
import { isImeEnter } from '../../ui';
import { DEFAULT_COLUMNS, type Issue, type Project, type Space } from '../../matrix';
import { ColumnIcon } from './icons';
import { issueKey, useColumnName, type IssueGroup } from './model';
import { Comments, DueLabel, useCommentCount, Who } from './parts';
import s from './Boards.module.css';
import { useT } from './strings';
import { UnreadDot, useIssueMentions } from './unread';

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

/** `space` is set on every group when the groups span more than one space. */
export function MineView({ groups, selectedId, onOpen }: { groups: (IssueGroup & { space?: Space })[]; selectedId?: string; onOpen: (p: Project, i: Issue) => void }) {
  const t = useT();
  const showExternal = useShowExternal();
  return (
    <div className={s.list}>
      {groups.map(({ project, issues, space }) => (
        <div key={project.id} role="group" aria-label={project.name}>
          <div className={`${s.listHead} ${s.mineHead}`}>
            <span className={s.swatch} style={{ background: project.colour, boxShadow: 'none' }} />
            <span className={s.listName}>{project.name}</span>
            <span className={s.colCount}>{issues.length}</span>
            {space && (
              <span className={s.listSpace}>
                {space.kind === 'client' && showExternal && <CompanyTile space={space} size={14} label={t('outside')} />}
                {space.name}
              </span>
            )}
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
  const comments = Math.max(useCommentCount(project.id, issue.id), useIssueMentions(issue.id));
  const name = useColumnName();
  const custom = mine && !DEFAULT_COLUMNS.includes(issue.column) ? name(project.columns.find((c) => c.id === issue.column) ?? { id: issue.column }) : undefined;
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
      <span className={`${s.rowKey} ${s.rowKeyDot}`}>
        {issueKey(project, issue)}
        <UnreadDot issueId={issue.id} />
      </span>
      <span className={s.rowTitleCell}>
        <span className={[s.rowTitle, issue.column === 'done' && s.doneInk].filter(Boolean).join(' ')}>{issue.title}</span>
        {custom && <span className={s.rowColumn}>{custom}</span>}
      </span>
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
