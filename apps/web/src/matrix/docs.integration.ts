// DB-01 test a (D-30: data loss). Two people edit one page over Matrix; a third opens it cold from the snapshot.
// pnpm dev:server && pnpm dev:seed && node dev/migrate-docs.ts --apply && pnpm test:matrix
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { DocsBoards, DocsBoardsSnapshot, PageSession } from './index';
import { BASE, mx, open, setupIntegration } from './integration.helpers';

setupIntegration();
globalThis.location = { origin: BASE } as Location;

const E = encodeURIComponent;
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type Account = Awaited<ReturnType<typeof open>>;
let ingrid: Account;
let jonas: Account;
let pasodrum: string;
let pageId: string;
let a: PageSession;
let b: PageSession;

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
      reject(new Error('timed out'));
    }, ms);
    check();
  });
}

const loaded = (s: PageSession) =>
  new Promise<void>((resolve, reject) => {
    const check = () => {
      const { status } = s.getState();
      if (status === 'loading') return;
      stop();
      if (status === 'ready') resolve();
      else reject(new Error('failed'));
    };
    const stop = s.subscribe(check);
    check();
  });

const vector = (d: Y.Doc) => Array.from(Y.encodeStateVector(d)).join(',');
const converged = async (x: Y.Doc, y: Y.Doc) => {
  await expect.poll(() => vector(x) === vector(y) && x.getText('t').toString() === y.getText('t').toString(), { timeout: 30_000, interval: 250 }).toBe(true);
};

beforeAll(async () => {
  [ingrid, jonas] = await Promise.all([open('ingrid'), open('jonas')]);
  pasodrum = ingrid.store.getSnapshot().spaces.find((s) => s.name === 'Pasodrum')!.id;
});

afterAll(async () => {
  if (pageId) await ingrid.store.docsBoards.deletePage(pageId).catch(() => {});
});

describe('Yjs over Matrix (test a)', () => {
  it('both people get the page; concurrent edits converge and a burst loses nothing', async () => {
    const title = `DB-01 ${stamp()}`;
    pageId = await ingrid.store.docsBoards.createPage({ spaceId: pasodrum, title });
    await untilDocs(jonas.store.docsBoards, (s) => s.pages[pasodrum]?.roots.some((p) => p.id === pageId && p.title === title));
    [a, b] = await Promise.all([ingrid.store.docsBoards.openPage(pageId), jonas.store.docsBoards.openPage(pageId)]);
    await Promise.all([loaded(a), loaded(b)]);

    a.doc.getXmlFragment('default').insert(0, [new Y.XmlText('from ingrid')]);
    b.doc.getXmlFragment('default').insert(0, [new Y.XmlText('from jonas')]);
    for (let i = 0; i < 60; i++) {
      a.doc.getText('t').insert(a.doc.getText('t').length, `a${i};`);
      b.doc.getText('t').insert(0, `b${i};`);
    }
    await converged(a.doc, b.doc);
    const text = a.doc.getText('t').toString();
    for (let i = 0; i < 60; i++) expect(text).toContain(`a${i};`);
    for (let i = 0; i < 60; i++) expect(text).toContain(`b${i};`);
    expect(a.doc.getXmlFragment('default').length).toBe(2);
    expect(b.doc.getXmlFragment('default').toString()).toBe(a.doc.getXmlFragment('default').toString());
  });

  it('an update over 40 KiB goes up as media and arrives', async () => {
    const big = Array.from({ length: 60_000 }, (_, i) => String.fromCharCode(33 + ((i * 7919) % 90))).join('');
    a.doc.getText('big').insert(0, big);
    await expect.poll(() => b.doc.getText('big').toString().length, { timeout: 30_000, interval: 250 }).toBe(big.length);
    const filter = E(JSON.stringify({ types: ['work.pasodrum.docs.update'] }));
    const { body } = await mx(ingrid.session.accessToken, 'GET', `/_matrix/client/v3/rooms/${E(pageId)}/messages?dir=b&limit=20&filter=${filter}`);
    expect((body.chunk as { content: Record<string, unknown> }[]).some((e) => typeof e.content.url === 'string' && typeof e.content.size === 'number')).toBe(true);
  });

  it('another device of mine leaving the page doesn’t stop my open session: it rejoins and catches up', async () => {
    const left = `left-${stamp()};`;
    await mx(ingrid.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(pageId)}/leave`);
    b.doc.getText('t').insert(0, left);
    a.doc.getText('t').insert(0, 'back;');
    await converged(a.doc, b.doc);
    expect(a.doc.getText('t').toString()).toContain(left);
    expect(b.doc.getText('t').toString()).toContain('back;');
  });

  it('after both close, a cold open (snapshot + what came after) has the same document', async () => {
    const want = { vector: vector(a.doc), t: a.doc.getText('t').toString(), big: a.doc.getText('big').length };
    a.close();
    b.close();
    // Closing uploads a snapshot (each of them sent something since the last one).
    await expect
      .poll(async () => (await mx(ingrid.session.accessToken, 'GET', `/_matrix/client/v3/rooms/${E(pageId)}/state/work.pasodrum.docs.snapshot/`)).body.upto, { timeout: 30_000, interval: 500 })
      .toBeTypeOf('string');
    const tanaka = await open('tanaka');
    const c = await tanaka.store.docsBoards.openPage(pageId);
    await loaded(c);
    await expect.poll(() => vector(c.doc), { timeout: 15_000, interval: 250 }).toBe(want.vector);
    expect(c.doc.getText('t').toString()).toBe(want.t);
    expect(c.doc.getText('big').length).toBe(want.big);
    c.close();
  });
});
