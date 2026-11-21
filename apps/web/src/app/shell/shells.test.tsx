// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeBackend, type FakeBackendOptions } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';

initI18n();

function renderApp(path: string, opts: FakeBackendOptions = {}) {
  const backend = createFakeBackend(opts);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
    </MemoryRouter>,
  );
  return { store: () => backend.stores.at(-1)! };
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const rail = () => screen.getByRole('navigation', { name: 'Workspaces and sections' });

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(cleanup);

describe('rail tiles (M5)', () => {
  it('uses the space colour, and an archived space dims and moves to the end', async () => {
    const { store } = renderApp('/w/!pasodrum/c/!general');
    await flush();
    const tile = () => within(rail()).getByRole('link', { name: 'Nordlys, client space' });
    expect(tile().style.getPropertyValue('--tile-bg')).toBe('#2F4A6D');
    await act(() => store().updateSpace('!nordlys', { colour: '#9A3B3B' }));
    expect(tile().style.getPropertyValue('--tile-bg')).toBe('#9A3B3B');
    await act(() => store().createClientSpace({ name: 'Aker', colour: '#1F6F5C', channels: ['general'], team: [], clientEmails: [] }));
    await act(() => store().setArchived('!nordlys', true));
    const names = within(rail()).getAllByRole('link', { name: /client space$/ }).map((a) => a.getAttribute('aria-label'));
    expect(names).toEqual(['Aker, client space', 'Kumo, client space', 'Nordlys, client space']);
  });
});

describe('client shell (RulesM5)', () => {
  it('shows only their space: one tile, Browse channels, no +, no client spaces', async () => {
    renderApp('/w/!nordlys/c/!project-updates', { perspective: 'client' });
    await flush();
    expect(within(rail()).getAllByRole('link', { name: /space$/ }).map((a) => a.getAttribute('aria-label'))).toEqual(['Nordlys, client space']);
    expect(screen.queryByRole('button', { name: 'New client space' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a channel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add people' })).toBeNull();
    expect(screen.queryByText('Client spaces')).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Nordlys' }), { key: 'Enter' });
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Browse channels']);
  });
});

describe('External shell (RulesM5, D-36)', () => {
  it('shows the workspace name as a heading and only the channels they were added to', async () => {
    renderApp('/w/!pasodrum/c/!design', { perspective: 'external' });
    await flush();
    const side = screen.getByRole('complementary', { name: 'Pasodrum navigation' });
    expect(within(side).getByRole('heading', { level: 2, name: 'Pasodrum' })).toBeTruthy();
    expect(within(side).queryByRole('button', { name: 'Pasodrum' })).toBeNull();
    expect(within(side).getAllByRole('link', { name: /^(design|launch-site)$/ }).map((l) => l.textContent)).toEqual(['design']);
    expect(within(side).queryByRole('link', { name: 'general' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a channel' })).toBeNull();
    expect(screen.queryByRole('img', { name: /outside/ })).toBeNull();
  });
});

describe('profile menu dialogs', () => {
  it.each(['Settings', 'Another app'])('return focus to the profile button when %s closes', async (item) => {
    renderApp('/w/!pasodrum/c/!general');
    await flush();
    const me = screen.getByRole('button', { name: /Your profile/ });
    fireEvent.pointerDown(me, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: item }));
    await flush();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Your profile/ }));
  });
});
