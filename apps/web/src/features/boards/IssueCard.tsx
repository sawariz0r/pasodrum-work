import { useEffect, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { useDocsBoards, useStore, type DocsBoardsSnapshot, type Issue, type Message, type Project } from '../../matrix';
import { PersonAvatar } from '../../app/timeline/PersonAvatar';
import { formatDate } from '../../app/format';
import { useT } from './strings';
import s from './IssueCard.module.css';

/** DB-05: a card under a message for its first link to one of our issues. The body keeps the plain link (D-05). */
export function IssueCard({ message }: { message: Message }) {
  const ids = firstIssue(message);
  return ids ? <Card key={ids.join('/')} projectId={ids[0]} issueId={ids[1]} /> : null;
}

type Found = { project: Project; issue: Issue };

function Card({ projectId, issueId }: { projectId: string; issueId: string }) {
  const t = useT();
  const store = useStore();
  const project = useDocsBoards((d) => findProject(d.projects, projectId));
  const known = project && !project.loading;
  const [resolved, setResolved] = useState<Found | null>();
  useEffect(() => {
    if (known) return;
    // Not listed or not joined yet: resolveIssue runs ensureProjects (shared, once) and looks again.
    let live = true;
    store.docsBoards.resolveIssue(projectId, issueId).then(
      (r) => live && setResolved(r),
      () => live && setResolved(null),
    );
    return () => {
      live = false;
    };
  }, [store, projectId, issueId, known]);

  const issue = known ? project.issues.find((i) => i.id === issueId) : resolved?.issue;
  const from = known ? project : resolved?.project;
  // Unknown or deleted issue, or a project I can't see: the plain link stays on its own.
  if (!issue || !from) return null;

  const column = from.columns.find((c) => c.id === issue.column);
  const columnName = column?.title ?? (isDefault(issue.column) ? t(defaultNames[issue.column]) : issue.column);
  return (
    <CardLink to={`/boards/${encodeURIComponent(projectId)}/${encodeURIComponent(issueId)}`}>
      <span className={s.icon}>
        <ColumnIcon column={issue.column} />
      </span>
      <span className={s.text}>
        <span className={s.head}>
          <span className={s.key}>{`${from.key}-${issue.n}`}</span>
          <span className={s.title}>{issue.title}</span>
        </span>
        <span className={s.meta}>
          <span>{columnName}</span>
          {issue.due && (
            <span className={s.due}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2.5" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              {formatDue(issue.due)}
            </span>
          )}
        </span>
      </span>
      {issue.assignee && <PersonAvatar person={issue.assignee} size={22} className={s.assignee} />}
    </CardLink>
  );
}

const defaultNames = { todo: 'columnTodo', doing: 'columnDoing', review: 'columnReview', done: 'columnDone' } as const;
const isDefault = (id: string): id is keyof typeof defaultNames => id in defaultNames;

/** The column glyphs from the board (BoardsPage): a custom column gets the dashed one. */
function ColumnIcon({ column }: { column: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 14 14" aria-hidden="true">
      {column === 'todo' ? (
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="#8A8893" strokeWidth="1.6" />
      ) : column === 'doing' ? (
        <>
          <circle cx="7" cy="7" r="5.6" fill="none" stroke="#C27803" strokeWidth="1.6" />
          <path d="M7 3.4A3.6 3.6 0 0 1 7 10.6Z" fill="#C27803" />
        </>
      ) : column === 'review' ? (
        <>
          <circle cx="7" cy="7" r="5.6" fill="none" stroke="#2563EB" strokeWidth="1.6" />
          <path d="M7 7V3.4A3.6 3.6 0 1 1 3.4 7Z" fill="#2563EB" />
        </>
      ) : column === 'done' ? (
        <>
          <circle cx="7" cy="7" r="6.4" fill="#0E7C66" />
          <path d="m4.3 7.2 1.9 1.9 3.6-3.8" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="5.6" fill="none" stroke="#7C3AED" strokeWidth="1.6" strokeDasharray="2.2 2" />
          <circle cx="7" cy="7" r="1.8" fill="#7C3AED" />
        </>
      )}
    </svg>
  );
}

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return useInRouterContext() ? (
    <Link className={s.card} to={to}>
      {children}
    </Link>
  ) : (
    <a className={s.card} href={to}>
      {children}
    </a>
  );
}

/** 'YYYY-MM-DD' → Nov 28 / 11月28日, in local time. */
function formatDue(due: string) {
  const [y, m, d] = due.split('-').map(Number);
  return formatDate(new Date(y!, m! - 1, d), { month: 'short', day: 'numeric' });
}

function findProject(projects: DocsBoardsSnapshot['projects'], id: string): Project | undefined {
  for (const list of Object.values(projects)) {
    const hit = list.find((p) => p.id === id);
    if (hit) return hit;
  }
}

/** `${origin}/boards/<projectRoomId>/<issueEventId>`. Encrypted conversations carry no `links` (D-33), so read the body there. */
function firstIssue(message: Message): [string, string] | undefined {
  const urls = message.links ?? message.body.match(/https?:\/\/[\x21-\x7E]+/g) ?? [];
  for (const raw of urls) {
    try {
      const url = new URL(raw.replace(/[.,;:!?)\]]+$/, ''));
      const m = url.origin === location.origin && /^\/boards\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
      if (m) return [decodeURIComponent(m[1]!), decodeURIComponent(m[2]!)];
    } catch {
      // not a URL
    }
  }
}
