// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeBackend, type FakeBackendOptions } from '../../dev/fakeBackend';
import type { Person } from '../../matrix';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';

initI18n();

function renderApp(path: string, opts: FakeBackendOptions) {
  const backend = createFakeBackend(opts);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
    </MemoryRouter>,
  );
  return { store: () => backend.stores.at(-1)! };
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

async function search(query: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
  await flush();
  // Everything but the last row, which echoes the query ("Search messages for …").
  return screen.getAllByRole('option').slice(0, -1).map((o) => o.textContent).join('|');
}

// Outside people the server might still hand us, with a client space the viewer isn't in.
const kumoClient: Person = { id: '@zed_kumo.jp:pasodrum.localhost', name: 'Zed Leak', external: true, client: '!kumo' };
const nordlysClient: Person = { id: '@vera_nordlys.no:pasodrum.localhost', name: 'Vera Leak', external: true, client: '!nordlys' };
const dm = (person: Person, spaceId: string) => ({ id: `!dm-${person.name}`, people: [person], unread: 0, mentions: 0, lastTs: 0, spaceIds: [spaceId] });

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(cleanup);

describe('⌘K tags: who sees what', () => {
  it('an External sees only their own spaces: Henrik tagged Nordlys, nothing of Kumo', async () => {
    const { store } = renderApp('/w/!nordlys/c/!questions', { perspective: 'external' });
    await flush();
    act(() => store().set({ dms: [...store().getSnapshot().dms, dm(kumoClient, '!pasodrum')] }));
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await flush();

    await search('Henrik');
    expect(screen.getByRole('option', { name: 'Henrik Dahl Nordlys' })).toBeTruthy();
    for (const q of ['Carol', 'Kumo', 'o', 'a']) {
      const text = await search(q);
      expect(text).not.toContain('Kumo');
      expect(text).not.toContain('Carol Ito');
    }
    await search('Zed');
    expect(screen.getByRole('option', { name: 'Zed Leak' })).toBeTruthy();
  });

  it('a client sees no tags at all', async () => {
    const { store } = renderApp('/w/!nordlys/c/!questions', { perspective: 'client' });
    await flush();
    act(() => store().set({ dms: [...store().getSnapshot().dms, dm(nordlysClient, '!nordlys')] }));
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await flush();

    for (const q of ['Carol', 'Kumo', 'o', 'a', 'Vera']) {
      const text = await search(q);
      expect(text).not.toContain('Kumo');
      expect(text).not.toContain('Carol Ito');
      expect(text).not.toContain('External');
      expect(text).not.toContain('Nordlys');
    }
  });
});
