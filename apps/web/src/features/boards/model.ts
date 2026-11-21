// Shared by the Boards column and screen: routes, scope, names, dates, small per-browser memory.
import { useEffect, useSyncExternalStore } from 'react';
import { useParams } from 'react-router';
import { fallbackSpace } from '../../app/places';
import { DEFAULT_COLUMNS, scopeOf, useStore, useWorkspace, type Column, type Issue, type Project, type Space } from '../../matrix';
import { useT } from './strings';

const enc = encodeURIComponent;

export const boardsPath = (projectId?: string, issueId?: string) =>
  '/boards' + (projectId ? `/${enc(projectId)}` : '') + (projectId && issueId ? `/${enc(issueId)}` : '');
export const minePath = (projectId?: string, issueId?: string) => '/boards/mine' + (projectId && issueId ? `/${enc(projectId)}/${enc(issueId)}` : '');

export type BoardsRoute = { mine: boolean; projectId?: string; issueId?: string };

/** `boards/*`: /boards, /boards/mine[/:projectId/:issueId], /boards/:projectId[/:issueId]. */
export function useBoardsRoute(): BoardsRoute {
  const rest = useParams()['*'] ?? '';
  const parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'mine') return { mine: true, projectId: parts[1], issueId: parts[2] };
  return { mine: false, projectId: parts[0], issueId: parts[1] };
}

const noSpaces: Space[] = [];

/** The selected space tile (the last space opened) and what Boards lists for it. */
export function useScope(): { selected?: Space; scope: Space[] } {
  const spaces = useWorkspace((x) => x.spaces);
  const selected = fallbackSpace(spaces);
  return { selected, scope: selected ? scopeOf(spaces, selected) : noSpaces };
}

const TEAM = new Set(['owner', 'admin', 'staff']);

/** Owner, Admin or Staff in the workspace: may create projects (and columns, where the server agrees). */
export function useIsTeam(): boolean {
  return useWorkspace((x) => x.spaces.some((s) => s.kind === 'workspace' && TEAM.has(x.myRoles[s.id] ?? '')));
}

export const issueKey = (project: Pick<Project, 'key'>, issue: Pick<Issue, 'n'>) => `${project.key}-${issue.n}`;

/** Columns are never translated: the stored title, else (an untitled default column) the name in my language. */
export function useColumnName() {
  const t = useT();
  return (c: Column) => c.title ?? (c.id === 'todo' ? t('columnTodo') : c.id === 'doing' ? t('columnDoing') : c.id === 'review' ? t('columnReview') : c.id === 'done' ? t('columnDone') : c.id);
}

/** A new project's columns, titled in my language. */
export function useDefaultColumns(): () => Column[] {
  const name = useColumnName();
  return () => DEFAULT_COLUMNS.map((id) => ({ id, title: name({ id }) }));
}

const titled = new Set<string>();

/** Projects made before titles were stored: the first editor to open the board titles its default columns in their language, once per session. */
export function useTitleColumns(project: Project | undefined) {
  const store = useStore();
  const name = useColumnName();
  const untitled = project && !project.loading && project.canAddColumn ? project.columns.filter((c) => !c.title && DEFAULT_COLUMNS.includes(c.id)) : [];
  const id = untitled.length ? project!.id : undefined;
  useEffect(() => {
    if (!id || titled.has(id)) return;
    titled.add(id);
    void store.docsBoards.titleColumns(id, Object.fromEntries(untitled.map((c) => [c.id, name(c)]))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per project; the titles are read when it runs
  }, [store, id]);
}

// Dates are 'YYYY-MM-DD' in local time.
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}
export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const today = () => dayOf(new Date());
export const isLate = (issue: Issue) => !!issue.due && issue.column !== 'done' && issue.due < today();

// Per browser: the view of each project and the last project opened per selected space.
function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: it applies for this session only.
  }
}

const viewKey = 'pasodrum.boards.view';
const lastKey = 'pasodrum.boards.last';
let views = read<Record<string, 'board' | 'list'>>(viewKey, {});
const viewListeners = new Set<() => void>();

export function useView(projectId: string | undefined): ['board' | 'list', (v: 'board' | 'list') => void] {
  const view = useSyncExternalStore(
    (cb) => {
      viewListeners.add(cb);
      return () => void viewListeners.delete(cb);
    },
    () => (projectId ? (views[projectId] ?? 'board') : 'board'),
  );
  return [
    view,
    (v) => {
      if (!projectId) return;
      views = { ...views, [projectId]: v };
      write(viewKey, views);
      viewListeners.forEach((l) => l());
    },
  ];
}

export const lastProject = (spaceId: string): string | undefined => read<Record<string, string>>(lastKey, {})[spaceId];
export const rememberProject = (spaceId: string, projectId: string) => write(lastKey, { ...read<Record<string, string>>(lastKey, {}), [spaceId]: projectId });

// The New project dialog opens from the column (pencil, a group's +) and from the empty page.
let newProjectIn: string | null = null;
const dialogListeners = new Set<() => void>();
export function openNewProject(spaceId: string | null) {
  newProjectIn = spaceId;
  dialogListeners.forEach((l) => l());
}
export function useNewProjectSpace(): string | null {
  return useSyncExternalStore(
    (cb) => {
      dialogListeners.add(cb);
      return () => void dialogListeners.delete(cb);
    },
    () => newProjectIn,
  );
}
