// Docs and Boards contract (D-37, DB-01). Yjs is only ever imported as a type here; it loads with the first open page.
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type { Message, Person, Space } from './types';

export interface PageNode {
  id: string;
  spaceId: string;
  title: string;
  parent?: string;
  order: string;
  children: PageNode[];
  /** Page ids this page links to (`[[…]]`), as last saved with setPageLinks. */
  linksTo: string[];
  /** A local change (create, rename, move) the server hasn't confirmed yet. */
  pending?: boolean;
}

export interface SpacePages {
  spaceId: string;
  roots: PageNode[];
  /** False until the space allows page entries for me (an unmigrated space, or not a member). */
  canCreate: boolean;
}

export interface PageSession {
  pageId: string;
  /** XmlFragment 'default' is the TipTap Collaboration document. */
  doc: Y.Doc;
  /** Other people's carets come in over the live relay (DB-04). */
  awareness: Awareness;
  getState(): { status: 'loading' | 'ready' | 'failed'; offline: boolean };
  subscribe(cb: () => void): () => void;
  /** Flushes, maybe snapshots, and leaves the page after a grace period. Call once per openPage. */
  close(): void;
}

export interface Column {
  id: string;
  /** Fixed text in the creator's language, never translated. Absent only on default columns (todo, doing, review, done)
   *  of projects made before titles were stored: those fall back to locale names until an editor titles them. */
  title?: string;
}

export interface Issue {
  /** The root message's event id. */
  id: string;
  projectId: string;
  n: number;
  title: string;
  column: string;
  assignee?: Person;
  /** 'YYYY-MM-DD'. */
  due?: string;
  order: string;
  /** A local change (create, move, edit) the server hasn't confirmed yet. */
  pending?: boolean;
}

export interface Project {
  id: string;
  spaceId: string;
  name: string;
  /** Issue prefix, e.g. 'WEB' → WEB-18. */
  key: string;
  colour: string;
  columns: Column[];
  /** Sorted by (order, id); filter by column for a board. */
  issues: Issue[];
  /** Not joined yet, or its state hasn't arrived. */
  loading: boolean;
  canAddColumn: boolean;
}

export interface IssueChange {
  id: string;
  ts: number;
  by: Person;
  field: 'column' | 'assignee' | 'due' | 'title';
  /** Column id, assignee user id, due date or title; absent when cleared. */
  to?: string;
}

/** Thread replies to the issue's root, through the store's thread API. */
export type Comment = Message;

export interface PresencePeer {
  user: Person;
  /** One per open tab or device. */
  conn: string;
  data: unknown;
}

export interface Presence {
  /** My state in this room: the latest wins, and whoever opens the room later gets it. */
  set(data: unknown): void;
  peers(): PresencePeer[];
  subscribe(cb: () => void): () => void;
  /** Something passing, to whoever is here now; lost if nobody is, or I'm cut off. */
  send(event: unknown): void;
  onEvent(cb: (event: unknown, from: Person) => void): () => void;
  close(): void;
}

export interface DocsBoardsSnapshot {
  /** Every space I'm in. */
  pages: Record<string, SpacePages>;
  /** By space id; filled after ensureProjects (and for projects I'm already in). */
  projects: Record<string, Project[]>;
  /** Open page rooms only (m.typing), without me. */
  typing: Record<string, Person[]>;
}

/**
 * Commands reject with Error('not-allowed') when the server's levels say no, Error('cycle') for a page dropped into its
 * own subtree, Error('not-found') for an unknown page/project/issue, and the server error otherwise.
 * Moves: `before` is the id of the item that ends up directly above, `after` the one directly below; with neither, it goes last.
 */
export interface DocsBoards {
  getSnapshot(): DocsBoardsSnapshot;
  subscribe(cb: () => void): () => void;
  // Docs
  createPage(o: { spaceId: string; parent?: string; title?: string }): Promise<string>;
  renamePage(pageId: string, title: string): Promise<void>;
  movePage(pageId: string, to: { parent?: string; before?: string; after?: string }): Promise<void>;
  /** The subtree goes too. */
  deletePage(pageId: string): Promise<void>;
  setPageLinks(pageId: string, links: string[]): Promise<void>;
  /** Joins if needed; rejects when the server refuses the join. */
  openPage(pageId: string): Promise<PageSession>;
  setTyping(roomId: string, typing: boolean): void;
  pageLink(pageId: string): string;
  /** For a page's images and files; resolves to a media reference for store.mediaUrl(). */
  uploadMedia(roomId: string, file: File): Promise<string>;
  // Boards
  /** Lists and joins the projects of every space I'm in; safe to call on every visit. */
  ensureProjects(): Promise<void>;
  /** `columns`: the default columns, titled in the creator's language. */
  createProject(o: { spaceId: string; name: string; colour: string; columns: Column[] }): Promise<string>;
  createColumn(projectId: string, title: string): Promise<void>;
  renameColumn(projectId: string, columnId: string, title: string): Promise<void>;
  /** Gives the columns that still have no title one from `titles` (by id), in one write; nothing when none is missing. */
  titleColumns(projectId: string, titles: Record<string, string>): Promise<void>;
  createIssue(projectId: string, o: { title: string; column: string; assignee?: string; due?: string }): Promise<string>;
  updateIssue(projectId: string, issueId: string, patch: Partial<{ title: string; assignee: string | null; due: string | null }>): Promise<void>;
  moveIssue(projectId: string, issueId: string, to: { column: string; before?: string; after?: string }): Promise<void>;
  deleteIssue(projectId: string, issueId: string): Promise<void>;
  /** Read it inside a useDocsBoards selector: the snapshot notifies when a description changes. */
  description(projectId: string, issueId: string): { body: string; html?: string } | undefined;
  setDescription(projectId: string, issueId: string, d: { body: string; html?: string }): Promise<void>;
  /** Oldest first. */
  issueChanges(projectId: string, issueId: string): Promise<IssueChange[]>;
  issueLink(projectId: string, issueId: string): string;
  resolveIssue(projectId: string, issueId: string): Promise<{ project: Project; issue: Issue } | null>;
  presence(roomId: string): Presence;
  /** Gives unsent page edits a few seconds to land, then stops. */
  stop(): Promise<void>;
}

export const DONE_COLUMN = 'done';
export const DEFAULT_COLUMNS: readonly string[] = ['todo', 'doing', 'review', DONE_COLUMN];

/** By order key, then id (the tie-break for concurrent moves). */
export const byOrder = (a: { order: string; id: string }, b: { order: string; id: string }) =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Issues assigned to me in these spaces that aren't done. */
export function myIssues(s: DocsBoardsSnapshot, meId: string, spaceIds: string[]): Issue[] {
  return spaceIds.flatMap((id) => s.projects[id] ?? []).flatMap((p) => p.issues.filter((i) => i.assignee?.id === meId && i.column !== DONE_COLUMN));
}

/** What the sidebar shows for the selected space: a client space only itself; the workspace itself plus every client space. */
export function scopeOf(spaces: Space[], selected: Space): Space[] {
  return selected.kind === 'client' ? [selected] : [selected, ...spaces.filter((s) => s.kind === 'client' && s.id !== selected.id)];
}
