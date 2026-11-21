// In-memory DocsBoards with the canvas content (DocsPage, BoardsPage), for tests and /dev screens. No server.
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type { Column, DocsBoards, DocsBoardsSnapshot, Issue, IssueChange, PageNode, PageSession, Presence, PresencePeer, Project, SpacePages } from '../../matrix';
import type { Person } from '../../matrix';
import type { FakeStoreOptions } from './fakeStore';

const people = {
  so: { id: '@sofia:pasodrum.localhost', name: 'Sofia Olsen' },
  ih: { id: '@ingrid:pasodrum.localhost', name: 'Ingrid Holm' },
  jb: { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' },
  ty: { id: '@tanaka:pasodrum.localhost', name: '田中 由紀' },
  hd: { id: '@henrik_nordlys.no:pasodrum.localhost', name: 'Henrik Dahl', external: true },
} satisfies Record<string, Person>;

type Who = keyof typeof people;
type SeedPage = { id: string; space: string; title: string; parent?: string; links?: string[]; blocks?: [string, string][] };

const seedPages: SeedPage[] = [
  { id: '!page-handbook', space: '!pasodrum', title: 'Handbook' },
  { id: '!page-product', space: '!pasodrum', title: 'Product' },
  {
    id: '!page-onboarding',
    space: '!pasodrum',
    title: 'Onboarding flow',
    parent: '!page-product',
    links: ['!page-release'],
    blocks: [
      ['p', 'How a new client gets from the invite email to their first message.'],
      ['h2', 'Goals'],
      ['p', 'One link, no account set-up, and the right channel open on arrival.'],
      ['h2', 'Steps'],
      ['p', 'Open the invite, pick a password, land in the client space.'],
    ],
  },
  { id: '!page-release', space: '!pasodrum', title: 'リリース計画', parent: '!page-product', blocks: [['h2', '目標'], ['p', '12月にクライアント向けに公開します。'], ['h2', 'スケジュール'], ['p', '毎週金曜日にレビュー。']] },
  { id: '!page-pricing', space: '!pasodrum', title: 'Pricing notes', parent: '!page-product' },
  { id: '!page-meetings', space: '!pasodrum', title: 'Meeting notes' },
  { id: '!page-join-notes', space: '!pasodrum', title: 'Join flow notes', parent: '!page-meetings', links: ['!page-onboarding'] },
  { id: '!page-brief', space: '!nordlys', title: 'Project brief', blocks: [['h2', 'Scope'], ['p', 'A customer portal for meter readings and invoices.'], ['h2', 'Milestones'], ['p', 'Wireframes, then the usage chart, then sign-in.']] },
  { id: '!page-weekly', space: '!nordlys', title: 'Weekly updates' },
];

type SeedIssue = [n: number, title: string, column: string, who?: Who, due?: string];
type SeedProject = { id: string; space: string; name: string; key: string; colour: string; columns?: Column[]; issues: SeedIssue[] };

const seedProjects: SeedProject[] = [
  {
    id: '!proj-web',
    space: '!pasodrum',
    name: 'Website relaunch',
    key: 'WEB',
    colour: '#0F766E',
    issues: [
      [24, '料金ページの日本語コピー', 'todo', 'ty', '2026-11-29'],
      [26, '請求メールの文言を直す', 'todo', 'ty'],
      [25, 'Footer links for the client spaces', 'todo', 'jb'],
      [27, 'Cookie notice without a banner', 'todo'],
      [18, 'Join page on phones', 'doing', 'ty', '2026-11-28'],
      [21, 'Hero image for the dark theme', 'doing', 'ih', '2026-11-26'],
      [22, 'Sign-in errors in plain words', 'doing', 'so', '2026-11-20'],
      [15, 'Invite email in Japanese', 'review', 'jb', '2026-11-24'],
      [19, 'Faster first load', 'review', 'so'],
      [11, 'New logo in the rail', 'done', 'ih'],
      [12, 'Dark theme colours', 'done', 'ih'],
      [14, 'Language switch in the profile menu', 'done', 'jb'],
    ],
  },
  { id: '!proj-brand', space: '!pasodrum', name: 'Brand refresh', key: 'BRA', colour: '#64748B', issues: [] },
  {
    id: '!proj-portal',
    space: '!nordlys',
    name: 'Customer portal',
    key: 'POR',
    colour: '#2F4A6D',
    columns: [{ id: 'todo' }, { id: 'doing' }, { id: 'wait', title: 'Waiting on client' }, { id: 'done' }],
    issues: [
      [9, 'Monthly usage report layout', 'todo', 'ih', '2026-12-12'],
      [10, 'Export usage to CSV', 'todo'],
      [6, 'Sign-in with work email', 'doing', 'so', '2026-11-28'],
      [7, 'Usage chart colours', 'doing', 'ih', '2026-12-01'],
      [8, 'Send sample meter data', 'wait', 'hd', '2026-11-25'],
      [5, 'Approve the invoice wording', 'wait', 'hd', '2026-11-20'],
      [1, 'Kickoff meeting', 'done', 'jb'],
      [2, 'Wireframes approved', 'done', 'hd'],
      [3, 'Brand colours', 'done', 'ih'],
    ],
  },
];

const descriptions: Record<string, { body: string; html?: string }> = {
  '$web-18': {
    body: 'On phones the keyboard hides the Continue button on the join page. Keep it above the keyboard, as on the sign-in page.',
    html: '<p>On phones the keyboard hides the <strong>Continue</strong> button on the join page. Keep it above the keyboard, as on the sign-in page.</p>',
  },
};

const defaultColumns: Column[] = [{ id: 'todo' }, { id: 'doing' }, { id: 'review' }, { id: 'done' }];
const key = (i: number) => `a${i.toString(36)}`;
const issueId = (projectKey: string, n: number) => `$${projectKey.toLowerCase()}-${n}`;

export interface FakeDocsBoardsOptions {
  /** As the server would show someone outside the team: Nordlys only. */
  perspective?: FakeStoreOptions['perspective'];
  me?: Person;
  /** No pages and no projects (DocsNone, BoardsNoProjects). */
  empty?: boolean;
  /** How long openPage and ensureProjects take (DocsLoading, BoardsLoading); 0 = at once. Default 300. */
  loadMs?: number;
  /** Commands that fail: create → BoardsCreateFailed, move → BoardsMoveFailed. Also settable later on `fail`. */
  fail?: { create?: boolean; move?: boolean };
  /** Scripted people in presence() and typing on open pages (BoardsLive, DocsPage present). */
  live?: boolean;
}

export type FakeDocsBoards = DocsBoards & { fail: { create: boolean; move: boolean } };

type PageRec = { id: string; spaceId: string; title: string; parent?: string; order: string; links: string[]; pending?: boolean };
type ProjectRec = Omit<Project, 'issues' | 'loading' | 'canAddColumn'> & { issues: Issue[] };

export function createFakeDocsBoards(opts: FakeDocsBoardsOptions = {}): FakeDocsBoards {
  const outsider = !!opts.perspective;
  const me = opts.me ?? (outsider ? people.hd : people.so);
  const spaceIds = outsider ? ['!nordlys'] : ['!pasodrum', '!kumo', '!nordlys'];
  const visible = (spaceId: string) => spaceIds.includes(spaceId);
  const loadMs = opts.loadMs ?? 300;
  const fail = { create: !!opts.fail?.create, move: !!opts.fail?.move };
  const listeners = new Set<() => void>();
  const later = (ms: number) => new Promise<void>((r) => (ms ? setTimeout(r, ms) : r()));
  let seq = 0;

  const pages = new Map<string, PageRec>();
  if (!opts.empty) {
    const count = new Map<string, number>();
    for (const p of seedPages.filter((x) => visible(x.space))) {
      const at = `${p.space}|${p.parent ?? ''}`;
      const i = count.get(at) ?? 0;
      count.set(at, i + 1);
      pages.set(p.id, { id: p.id, spaceId: p.space, title: p.title, ...(p.parent ? { parent: p.parent } : {}), order: key(i), links: p.links ?? [] });
    }
  }
  const projects = new Map<string, ProjectRec>();
  if (!opts.empty) {
    for (const p of seedProjects.filter((x) => visible(x.space))) {
      const inColumn = new Map<string, number>();
      const issues = p.issues.map(([n, title, column, who, due]): Issue => {
        const i = inColumn.get(column) ?? 0;
        inColumn.set(column, i + 1);
        return { id: issueId(p.key, n), projectId: p.id, n, title, column, ...(who ? { assignee: people[who] } : {}), ...(due ? { due } : {}), order: key(i) };
      });
      projects.set(p.id, { id: p.id, spaceId: p.space, name: p.name, key: p.key, colour: p.colour, columns: p.columns ?? defaultColumns, issues });
    }
  }
  const descs = new Map(Object.entries(descriptions));
  let loaded: 'no' | 'loading' | 'yes' = 'no';
  const open = new Set<string>();

  const sorted = <T extends { order: string; id: string }>(list: T[]) => [...list].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1));
  const build = (): DocsBoardsSnapshot => {
    const out: Record<string, SpacePages> = {};
    for (const spaceId of spaceIds) {
      const node = (p: PageRec): PageNode => ({
        id: p.id,
        spaceId,
        title: p.title,
        ...(p.parent ? { parent: p.parent } : {}),
        order: p.order,
        children: sorted([...pages.values()].filter((c) => c.parent === p.id)).map(node),
        linksTo: p.links,
        ...(p.pending ? { pending: true } : {}),
      });
      out[spaceId] = { spaceId, roots: sorted([...pages.values()].filter((p) => p.spaceId === spaceId && !p.parent)).map(node), canCreate: true };
    }
    const byspace: Record<string, Project[]> = {};
    if (loaded !== 'no') {
      for (const spaceId of spaceIds) byspace[spaceId] = [];
      for (const p of projects.values()) {
        byspace[p.spaceId]!.push({ ...p, issues: sorted(p.issues), loading: loaded === 'loading', canAddColumn: !outsider });
      }
      for (const list of Object.values(byspace)) list.sort((a, b) => a.name.localeCompare(b.name));
    }
    const typing: Record<string, Person[]> = opts.live && open.has('!page-onboarding') ? { '!page-onboarding': [people.ty] } : {};
    return { pages: out, projects: byspace, typing };
  };
  let snapshot = build();
  const notify = () => {
    snapshot = build();
    listeners.forEach((l) => l());
  };

  const page = (id: string) => {
    const p = pages.get(id);
    if (!p) throw new Error('not-found');
    return p;
  };
  const project = (id: string) => {
    const p = projects.get(id);
    if (!p) throw new Error('not-found');
    return p;
  };
  const issue = (projectId: string, id: string) => {
    const i = project(projectId).issues.find((x) => x.id === id);
    if (!i) throw new Error('not-found');
    return i;
  };
  const place = async (list: { id: string; order: string }[], to: { before?: string; after?: string } = {}) => (await import('../../matrix/order')).orderAmong(list, to);
  const patchIssue = (projectId: string, id: string, patch: Partial<Issue>) => {
    const p = project(projectId);
    p.issues = p.issues.map((i) => (i.id === id ? { ...i, ...patch } : i));
  };

  const scripted: Record<string, PresencePeer[]> = {
    '!proj-web': [
      { user: people.jb, conn: 'fake-jb', data: { issue: '$web-19', what: 'drag', over: { column: 'done', before: '$web-12' } } },
      { user: people.ih, conn: 'fake-ih', data: { issue: '$web-25', what: 'edit' } },
      { user: people.ty, conn: 'fake-ty', data: { issue: '$web-21', what: 'open' } },
    ],
    '!page-onboarding': [
      { user: people.ty, conn: 'fake-ty', data: {} },
      { user: people.jb, conn: 'fake-jb', data: {} },
    ],
  };

  return {
    fail,
    getSnapshot: () => snapshot,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },

    async createPage({ spaceId, parent, title }) {
      if (!visible(spaceId)) throw new Error('not-allowed');
      const id = `!page-new-${++seq}`;
      const siblings = [...pages.values()].filter((p) => p.spaceId === spaceId && p.parent === parent);
      pages.set(id, { id, spaceId, title: title?.trim() ?? '', ...(parent ? { parent } : {}), order: await place(siblings), links: [] });
      notify();
      return id;
    },
    async renamePage(pageId, title) {
      page(pageId).title = title.trim();
      notify();
    },
    async movePage(pageId, to) {
      const p = page(pageId);
      for (let at = to.parent; at; at = pages.get(at)?.parent) if (at === pageId) throw new Error('cycle');
      const order = await place([...pages.values()].filter((x) => x.spaceId === p.spaceId && x.parent === to.parent && x.id !== pageId), to);
      const before = { ...p };
      pages.set(pageId, { ...p, order, pending: true, ...(to.parent ? { parent: to.parent } : { parent: undefined }) });
      notify();
      await later(loadMs);
      if (fail.move) {
        pages.set(pageId, before);
        notify();
        throw new Error('failed');
      }
      pages.set(pageId, { ...pages.get(pageId)!, pending: undefined });
      notify();
    },
    async deletePage(pageId) {
      page(pageId);
      const drop = (id: string) => {
        pages.delete(id);
        [...pages.values()].filter((c) => c.parent === id).forEach((c) => drop(c.id));
      };
      drop(pageId);
      notify();
    },
    async setPageLinks(pageId, links) {
      page(pageId).links = [...new Set(links)];
      notify();
    },
    async openPage(pageId): Promise<PageSession> {
      const p = page(pageId);
      const [Yjs, { Awareness: AwarenessClass }] = await Promise.all([import('yjs'), import('y-protocols/awareness')]);
      const doc: Y.Doc = new Yjs.Doc();
      const awareness: Awareness = new AwarenessClass(doc);
      const blocks = seedPages.find((s) => s.id === p.id)?.blocks ?? [];
      const fragment = doc.getXmlFragment('default');
      fragment.insert(
        0,
        blocks.map(([kind, text]) => {
          const el = new Yjs.XmlElement(kind === 'h2' ? 'heading' : 'paragraph');
          if (kind === 'h2') el.setAttribute('level', 2 as never);
          el.insert(0, [new Yjs.XmlText(text)]);
          return el;
        }),
      );
      let state: ReturnType<PageSession['getState']> = { status: loadMs ? 'loading' : 'ready', offline: false };
      const subs = new Set<() => void>();
      if (loadMs)
        setTimeout(() => {
          state = { ...state, status: 'ready' };
          subs.forEach((s) => s());
        }, loadMs);
      open.add(pageId);
      notify();
      return {
        pageId,
        doc,
        awareness,
        getState: () => state,
        subscribe(cb) {
          subs.add(cb);
          return () => void subs.delete(cb);
        },
        close() {
          open.delete(pageId);
          awareness.destroy();
          notify();
        },
      };
    },
    setTyping() {},
    pageLink: (pageId) => `https://pasodrum.work/docs/${encodeURIComponent(pageId)}`,

    async ensureProjects() {
      if (loaded !== 'no') return;
      loaded = loadMs ? 'loading' : 'yes';
      notify();
      await later(loadMs);
      loaded = 'yes';
      notify();
    },
    async createProject({ spaceId, name, colour }) {
      if (outsider || !visible(spaceId)) throw new Error('not-allowed');
      const id = `!proj-new-${++seq}`;
      const base = name.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'PRJ';
      projects.set(id, { id, spaceId, name: name.trim(), key: base, colour, columns: defaultColumns, issues: [] });
      if (loaded === 'no') loaded = 'yes';
      notify();
      return id;
    },
    async createColumn(projectId, title) {
      if (outsider) throw new Error('not-allowed');
      const p = project(projectId);
      p.columns = [...p.columns, { id: `c${++seq}`, title: title.trim() }];
      notify();
    },
    async createIssue(projectId, o) {
      const p = project(projectId);
      await later(loadMs);
      if (fail.create) throw new Error('failed');
      const n = Math.max(0, ...p.issues.map((i) => i.n)) + 1;
      const id = issueId(p.key, n);
      const assignee = o.assignee ? Object.values(people).find((x) => x.id === o.assignee) : undefined;
      p.issues = [...p.issues, { id, projectId, n, title: o.title.trim(), column: o.column, ...(assignee ? { assignee } : {}), ...(o.due ? { due: o.due } : {}), order: await place(p.issues.filter((i) => i.column === o.column)) }];
      notify();
      return id;
    },
    async updateIssue(projectId, id, patch) {
      const i = issue(projectId, id);
      const next: Issue = { ...i };
      if (patch.title !== undefined) next.title = patch.title.trim();
      if (patch.assignee === null) delete next.assignee;
      else if (patch.assignee) next.assignee = Object.values(people).find((x) => x.id === patch.assignee) ?? { id: patch.assignee, name: patch.assignee };
      if (patch.due === null) delete next.due;
      else if (patch.due) next.due = patch.due;
      patchIssue(projectId, id, next);
      notify();
    },
    async moveIssue(projectId, id, to) {
      const before = issue(projectId, id);
      const order = await place(project(projectId).issues.filter((i) => i.column === to.column && i.id !== id), to);
      patchIssue(projectId, id, { column: to.column, order, pending: true });
      notify();
      await later(loadMs);
      if (fail.move) {
        patchIssue(projectId, id, before);
        notify();
        throw new Error('failed');
      }
      patchIssue(projectId, id, { pending: undefined });
      notify();
    },
    async deleteIssue(projectId, id) {
      const p = project(projectId);
      p.issues = p.issues.filter((i) => i.id !== id);
      descs.delete(id);
      notify();
    },
    description: (_projectId, id) => descs.get(id),
    async setDescription(_projectId, id, d) {
      descs.set(id, { body: d.body, ...(d.html ? { html: d.html } : {}) });
      notify();
    },
    async issueChanges(projectId, id): Promise<IssueChange[]> {
      const i = issue(projectId, id);
      return [{ id: `${id}:column`, ts: Date.now() - 26 * 3600_000, by: i.assignee ?? people.jb, field: 'column', to: i.column }];
    },
    issueLink: (projectId, id) => `https://pasodrum.work/boards/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`,
    async resolveIssue(projectId, id) {
      const p = projects.get(projectId);
      const i = p?.issues.find((x) => x.id === id);
      return p && i ? { project: { ...p, issues: sorted(p.issues), loading: false, canAddColumn: !outsider }, issue: i } : null;
    },
    uploadMedia: async (_roomId, file) => URL.createObjectURL(file),
    presence(roomId): Presence {
      const peers = opts.live ? (scripted[roomId] ?? []).filter((x) => x.user.id !== me.id) : [];
      return { set() {}, peers: () => peers, subscribe: () => () => {}, close() {} };
    },
    async stop() {},
  };
}
