// DB-01 test b (D-30: isolation). A client never reaches another client space's pages or projects; in their own client
// space they create pages and issues and comment, but add no columns and no projects.
// pnpm dev:server && pnpm dev:seed && node dev/migrate-docs.ts --apply && pnpm test:matrix
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DocsBoards, DocsBoardsSnapshot } from './index';
import { BASE, mx, open, setupIntegration, until } from './integration.helpers';

setupIntegration();
globalThis.location = { origin: BASE } as Location;

const E = encodeURIComponent;
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error & { httpStatus?: number });

type Account = Awaited<ReturnType<typeof open>>;
let ingrid: Account;
let henrik: Account;
let nordlys: string;
let otherSpace: string;
let otherPage: string;
let otherProject: string;
let project: string;
const made: string[] = [];

function untilDocs<T>(db: DocsBoards, pick: (s: DocsBoardsSnapshot) => T | undefined | false, ms = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const v = pick(db.getSnapshot());
      if (v === undefined || v === false) return;
      stop();
      clearTimeout(timer);
      resolve(v);
    };
    const stop = db.subscribe(check);
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`timed out: ${JSON.stringify(db.getSnapshot()).slice(0, 1500)}`));
    }, ms);
    check();
  });
}

const allIds = (s: DocsBoardsSnapshot) => {
  const ids: string[] = [];
  const walk = (nodes: { id: string; children: { id: string; children: never[] }[] }[]) => nodes.forEach((n) => (ids.push(n.id), walk(n.children as never)));
  Object.values(s.pages).forEach((p) => walk(p.roots as never));
  Object.values(s.projects).forEach((list) => list.forEach((p) => ids.push(p.id)));
  return ids;
};

beforeAll(async () => {
  [ingrid, henrik] = await Promise.all([open('ingrid'), open('henrik_nordlys.no')]);
  nordlys = ingrid.store.getSnapshot().spaces.find((s) => s.name === 'Nordlys')!.id;
  ({ spaceId: otherSpace } = await ingrid.store.createClientSpace({ name: `DB-01 other ${stamp()}`, colour: '#2F4A6D', channels: ['general'], team: [], clientEmails: [] }));
  made.push(otherSpace);
  otherPage = await ingrid.store.docsBoards.createPage({ spaceId: otherSpace, title: 'Secret plan' });
  otherProject = await ingrid.store.docsBoards.createProject({ spaceId: otherSpace, name: 'Secret project', colour: '#BE123C' });
  project = await ingrid.store.docsBoards.createProject({ spaceId: nordlys, name: `DB-01 ${stamp()}`, colour: '#2F4A6D' });
  made.push(otherPage, otherProject, project);
});

afterAll(async () => {
  const t = ingrid.session.accessToken;
  await mx(t, 'PUT', `/_matrix/client/v3/rooms/${E(nordlys)}/state/m.space.child/${E(project)}`, {});
  for (const roomId of made) {
    await mx(t, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/leave`);
    await mx(t, 'POST', `/_matrix/client/v3/rooms/${E(roomId)}/forget`);
  }
});

describe('client isolation (test b)', () => {
  it('another client space’s page and project: no open, no join, no state, never in the snapshot', async () => {
    const t = henrik.session.accessToken;
    expect((await rejection(henrik.store.docsBoards.openPage(otherPage)))?.httpStatus).toBe(403);
    for (const roomId of [otherPage, otherProject]) {
      expect((await mx(t, 'POST', `/_matrix/client/v3/join/${E(roomId)}`)).status).toBe(403);
      expect((await mx(t, 'GET', `/_matrix/client/v3/rooms/${E(roomId)}/state`)).status).toBe(403);
    }
    // Continuwuity answers a single state event outside the room with 404, not 403.
    expect([403, 404]).toContain((await mx(t, 'GET', `/_matrix/client/v3/rooms/${E(otherSpace)}/state/work.pasodrum.docs.page/${E(otherPage)}`)).status);
    await henrik.store.docsBoards.ensureProjects();
    const s = henrik.store.docsBoards.getSnapshot();
    expect(Object.keys(s.pages)).toEqual([nordlys]);
    expect(Object.keys(s.projects)).toEqual([nordlys]);
    expect(allIds(s)).not.toContain(otherPage);
    expect(allIds(s)).not.toContain(otherProject);
  });

  it('in Nordlys the client creates a page and an issue and comments; adds no column and no project', async () => {
    const db = henrik.store.docsBoards;
    expect(db.getSnapshot().pages[nordlys]?.canCreate).toBe(true);
    const title = `Henrik ${stamp()}`;
    const page = await db.createPage({ spaceId: nordlys, title });
    made.push(page);
    await untilDocs(ingrid.store.docsBoards, (s) => s.pages[nordlys]?.roots.some((p) => p.id === page && p.title === title && !p.pending));
    await db.deletePage(page);

    await db.ensureProjects();
    const p = await untilDocs(db, (s) => s.projects[nordlys]?.find((x) => x.id === project && !x.loading));
    expect(p.canAddColumn).toBe(false);
    expect(p.columns.map((c) => c.id)).toEqual(['todo', 'doing', 'review', 'done']);
    const issueId = await db.createIssue(project, { title: 'Send meter data', column: 'todo' });
    const issue = await untilDocs(ingrid.store.docsBoards, (s) => s.projects[nordlys]?.find((x) => x.id === project)?.issues.find((i) => i.id === issueId && !i.pending));
    expect(issue).toMatchObject({ n: 1, title: 'Send meter data', column: 'todo' });

    // Comments are threads on the issue's root, through the store's existing thread API.
    henrik.store.send(project, { body: 'Sent this morning', mentions: [], threadRootId: issueId });
    ingrid.store.openThread(project, issueId);
    const thread = await until(ingrid.store, (s) => {
      const messages = s.threadTimelines[issueId]?.messages;
      return messages?.some((m) => m.body === 'Sent this morning') && messages;
    });
    expect(thread[0]).toMatchObject({ id: issueId, body: `${p.key}-1 Send meter data` });
    expect(ingrid.store.getSnapshot().threads.some((th) => th.rootId === issueId)).toBe(false);
    expect(ingrid.store.getSnapshot().activity.some((a) => a.channelId === project)).toBe(false);

    expect((await rejection(db.createColumn(project, 'Waiting')))?.message).toBe('not-allowed');
    const t = henrik.session.accessToken;
    expect((await mx(t, 'PUT', `/_matrix/client/v3/rooms/${E(project)}/state/work.pasodrum.boards.columns/`, { columns: [{ id: 'x', title: 'x' }] })).status).toBe(403);
    expect((await rejection(db.createProject({ spaceId: nordlys, name: 'Mine', colour: '#BE123C' })))?.message).toBe('not-allowed');
    expect((await mx(t, 'PUT', `/_matrix/client/v3/rooms/${E(nordlys)}/state/m.space.child/${E(otherPage)}`, { via: ['pasodrum.localhost'] })).status).toBe(403);
  });
});
