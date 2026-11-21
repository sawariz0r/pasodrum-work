// Docs and Boards (D-37): the store's handle. The implementation loads after the first sync, so none of it is in the
// first load; until then the snapshot is empty (no space has a `pages` entry yet) and commands wait for it.
import type { MatrixClient, Room } from 'matrix-js-sdk';
import type { DocsBoardsCore } from './docsBoardsCore';
import type { DocsBoards, DocsBoardsSnapshot, Presence } from './docsBoardsTypes';
import { PAGES } from './levels';
import { openPresence } from './presence';
import type { Person } from './types';

export interface DocsBoardsContext {
  client: MatrixClient;
  userId: string;
  server: string;
  /** Someone as the given room knows them. */
  person(userId: string, roomId?: string): Person;
  /** First sync done. */
  ready: Promise<void>;
}

/** Every page room the space has listed, deleted ones too (page rooms aren't space children, so removal reaches them here). */
export const pageRoomsOf = (space: Room): string[] => space.currentState.getStateEvents(PAGES).map((e) => e.getStateKey()!).filter(Boolean);

const empty: DocsBoardsSnapshot = { pages: {}, projects: {}, typing: {} };
const nobody: Presence = { set() {}, peers: () => [], subscribe: () => () => {}, send() {}, onEvent: () => () => {}, close() {} };
const enc = encodeURIComponent;

export function createDocsBoards(ctx: DocsBoardsContext): DocsBoards {
  const listeners = new Set<() => void>();
  let impl: DocsBoardsCore | null = null;
  let stopped = false;
  const loading = ctx.ready
    .then(() => import('./docsBoardsCore'))
    .then(({ createDocsBoardsCore }) => {
      if (stopped) throw new Error('stopped');
      impl = createDocsBoardsCore(ctx);
      impl.subscribe(() => listeners.forEach((l) => l()));
      listeners.forEach((l) => l());
      return impl;
    });
  loading.catch(() => {});
  const core = () => loading;

  // One relay connection per room, however many hold it (the page header, the page's live bridge, a board and its panel).
  // It closes a moment after the last holder lets go, so a remount (or React's strict-mode double effect) keeps it.
  const shared = new Map<string, { presence: Presence; refs: number; closing?: ReturnType<typeof setTimeout> }>();
  const presence = (roomId: string): Presence => {
    let held = shared.get(roomId);
    if (!held) {
      const token = ctx.client.getAccessToken();
      if (!token) return nobody;
      held = { presence: openPresence({ token, base: location.origin, roomId, person: (id) => ctx.person(id, roomId) }), refs: 0 };
      shared.set(roomId, held);
    }
    clearTimeout(held.closing);
    held.refs++;
    const h = held;
    let closed = false;
    return {
      set: (data) => h.presence.set(data),
      peers: () => h.presence.peers(),
      subscribe: (cb) => h.presence.subscribe(cb),
      send: (event) => h.presence.send(event),
      onEvent: (cb) => h.presence.onEvent(cb),
      close() {
        if (closed) return;
        closed = true;
        if (--h.refs > 0) return;
        h.closing = setTimeout(() => {
          h.presence.close();
          if (shared.get(roomId) === h) shared.delete(roomId);
        }, 2000);
      },
    };
  };

  // One live bridge per open page, however many openPage calls share its session.
  const bridges = new Map<string, { refs: number; stop: () => void }>();
  const openPage = async (pageId: string) => {
    const session = await (await core()).openPage(pageId);
    const { bridgeLive } = await import('./docsProvider');
    let bridge = bridges.get(pageId);
    if (!bridge) {
      const relay = presence(pageId);
      const stop = bridgeLive(session, relay, ctx.userId);
      bridge = {
        refs: 0,
        stop: () => {
          stop();
          relay.close();
        },
      };
      bridges.set(pageId, bridge);
    }
    bridge.refs++;
    const b = bridge;
    let closed = false;
    return {
      ...session,
      close() {
        if (closed) return;
        closed = true;
        session.close();
        if (--b.refs > 0) return;
        b.stop();
        if (bridges.get(pageId) === b) bridges.delete(pageId);
      },
    };
  };

  return {
    getSnapshot: () => impl?.getSnapshot() ?? empty,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    createPage: async (o) => (await core()).createPage(o),
    renamePage: async (pageId, title) => (await core()).renamePage(pageId, title),
    movePage: async (pageId, to) => (await core()).movePage(pageId, to),
    deletePage: async (pageId) => (await core()).deletePage(pageId),
    setPageLinks: async (pageId, links) => (await core()).setPageLinks(pageId, links),
    openPage,
    setTyping: (roomId, typing) => impl?.setTyping(roomId, typing),
    pageLink: (pageId) => `${location.origin}/docs/${enc(pageId)}`,
    uploadMedia: async (roomId, file) => (await core()).uploadMedia(roomId, file),
    ensureProjects: async () => (await core()).ensureProjects(),
    createProject: async (o) => (await core()).createProject(o),
    createColumn: async (projectId, title) => (await core()).createColumn(projectId, title),
    renameColumn: async (projectId, columnId, title) => (await core()).renameColumn(projectId, columnId, title),
    titleColumns: async (projectId, titles) => (await core()).titleColumns(projectId, titles),
    createIssue: async (projectId, o) => (await core()).createIssue(projectId, o),
    updateIssue: async (projectId, issueId, patch) => (await core()).updateIssue(projectId, issueId, patch),
    moveIssue: async (projectId, issueId, to) => (await core()).moveIssue(projectId, issueId, to),
    deleteIssue: async (projectId, issueId) => (await core()).deleteIssue(projectId, issueId),
    description: (projectId, issueId) => impl?.description(projectId, issueId),
    setDescription: async (projectId, issueId, d) => (await core()).setDescription(projectId, issueId, d),
    issueChanges: async (projectId, issueId) => (await core()).issueChanges(projectId, issueId),
    issueLink: (projectId, issueId) => `${location.origin}/boards/${enc(projectId)}/${enc(issueId)}`,
    resolveIssue: async (projectId, issueId) => (await core()).resolveIssue(projectId, issueId),
    presence,
    async stop() {
      stopped = true;
      for (const b of bridges.values()) b.stop();
      bridges.clear();
      for (const h of shared.values()) {
        clearTimeout(h.closing);
        h.presence.close();
      }
      shared.clear();
      listeners.clear();
      await impl?.stop();
    },
  };
}
