// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeBackend, type FakeBackendOptions } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';

initI18n();

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname}</span>;
}

function renderApp(path: string, opts: FakeBackendOptions = {}) {
  const backend = createFakeBackend(opts);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
      <Where />
    </MemoryRouter>,
  );
  return { store: () => backend.stores.at(-1)!, where: () => screen.getByTestId('where').textContent };
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const rail = () => screen.getByRole('navigation', { name: 'Workspaces and sections' });
const header = () => screen.getByRole('main', { hidden: true }).querySelector('header')!;
const openMenu = (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' });
const dialog = () => screen.getByRole('dialog');

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(cleanup);

describe('new client space', () => {
  it('stops a taken name, then creates the space and lands in its first channel', async () => {
    const { store, where } = renderApp('/w/!pasodrum/c/!design');
    fireEvent.click(within(rail()).getByRole('button', { name: 'New client space' }));
    const name = within(dialog()).getByRole('textbox', { name: 'Client name' });
    fireEvent.change(name, { target: { value: ' NORDLYS ' } });
    expect(within(dialog()).getByRole('alert').textContent).toBe('NORDLYS already exists');
    expect((within(dialog()).getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(name, { target: { value: 'Halden & Co.' } });
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Walnut' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'design-review' }));
    const email = within(dialog()).getByRole('textbox', { name: 'Client email' });
    fireEvent.change(email, { target: { value: 'eva@halden.no' } });
    fireEvent.keyDown(email, { key: 'Enter' });
    expect(within(dialog()).getByRole('button', { name: 'Remove eva@halden.no' })).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));
    await flush();

    const made = store().getSnapshot().spaces.find((sp) => sp.name === 'Halden & Co.')!;
    expect(made.colour).toBe('#7A4B2A');
    expect(store().getSnapshot().channels[made.id]!.map((c) => c.name)).toEqual(['project-updates', 'questions', 'design-review']);
    expect(where()).toBe(`/w/${made.id}/c/${made.id}-c0`);
    expect(within(rail()).getByRole('link', { name: 'Halden & Co., client space' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows one line and Retry when creating fails, and nothing half-made', async () => {
    const { store, where } = renderApp('/w/!pasodrum/c/!design');
    openMenu(screen.getByRole('button', { name: 'Pasodrum' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New client space' }));
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Client name' }), { target: { value: 'Fail Co' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));
    await flush();
    expect(within(dialog()).getByRole('alert').textContent).toBe('Couldn’t create Fail Co');
    expect(store().getSnapshot().spaces.some((sp) => sp.name === 'Fail Co')).toBe(false);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Retry' }));
    await flush();
    expect(where()).toMatch(/^\/w\/!fail-co-/);
  });

  it('is only offered to Owners and Admins', () => {
    renderApp('/w/!pasodrum/c/!design', { roles: { '!pasodrum': 'staff', '!nordlys': 'staff' } });
    expect(screen.queryByRole('button', { name: 'New client space' })).toBeNull();
  });
});

describe('client space settings', () => {
  it('saves the colour as it changes and lists the team above the client', async () => {
    const { store } = renderApp('/w/!nordlys/c/!project-updates');
    openMenu(screen.getByRole('button', { name: 'Nordlys' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Client space settings' }));
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Pine' }));
    await flush();
    expect(store().getSnapshot().spaces.find((sp) => sp.id === '!nordlys')!.colour).toBe('#1F6F5C');

    fireEvent.click(within(dialog()).getByRole('tab', { name: /People/ }));
    await flush();
    const lists = within(dialog()).getAllByRole('list');
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual(['Pasodrum', 'Nordlys']);
    expect(within(lists[1]!).getByText('Henrik Dahl')).toBeTruthy();
  });

  it('removes a person from the space after asking once, showing the channels they leave', async () => {
    renderApp('/w/!nordlys/c/!project-updates');
    await flush();
    expect(within(header()).getByRole('button', { name: 'Includes people outside Pasodrum: Henrik Dahl, Ola Fjell' })).toBeTruthy();
    openMenu(screen.getByRole('button', { name: 'Nordlys' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Client space settings' }));
    fireEvent.click(within(dialog()).getByRole('tab', { name: /People/ }));
    await flush();
    openMenu(within(dialog()).getByRole('button', { name: 'More for Henrik Dahl' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Nordlys' }));
    await flush();
    const ask = screen.getByRole('alertdialog', { name: 'Remove Henrik Dahl from Nordlys?' });
    expect(within(ask).getByText('project-updates')).toBeTruthy();
    expect(within(ask).getByText('questions')).toBeTruthy();
    fireEvent.click(within(ask).getByRole('button', { name: 'Remove' }));
    await flush();
    expect(within(dialog()).queryByText('Henrik Dahl')).toBeNull();
    expect(within(header()).getByRole('button', { name: 'Includes people outside Pasodrum: Ola Fjell', hidden: true })).toBeTruthy();
  });

  it('archives the space: the composer becomes one quiet bar with Unarchive', async () => {
    const { store } = renderApp('/w/!nordlys/c/!project-updates');
    openMenu(screen.getByRole('button', { name: 'Nordlys' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Client space settings' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Archive client space' }));
    const ask = screen.getByRole('alertdialog', { name: 'Archive Nordlys?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Archive' }));
    await flush();
    expect(await screen.findByText('Nordlys is archived')).toBeTruthy();
    expect(store().getSnapshot().spaces.at(-1)).toMatchObject({ id: '!nordlys', archived: true });
    expect(screen.queryByRole('textbox', { name: /Message/ })).toBeNull();
    expect(within(header()).queryByRole('button', { name: 'Add people' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    await flush();
    expect(store().getSnapshot().spaces.find((sp) => sp.id === '!nordlys')!.archived).toBe(false);
  });
});

describe('outside mark', () => {
  it('marks a workspace channel with an External in the sidebar, header and beside Send; the header opens Members', async () => {
    renderApp('/w/!pasodrum/c/!design');
    await flush();
    const label = 'Includes people outside Pasodrum: Lea Aune, Ola Fjell';
    const row = screen.getByRole('link', { name: /^design/ });
    expect(within(row).getByRole('img', { name: label })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: label })).toHaveLength(2);
    fireEvent.click(within(header()).getByRole('button', { name: label }));
    expect(within(dialog()).getByRole('tab', { name: /Members/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps client space rows plain', () => {
    renderApp('/w/!nordlys/c/!project-updates');
    expect(within(screen.getByRole('link', { name: /^questions/ })).queryByRole('img')).toBeNull();
  });

  it('is never shown to clients', async () => {
    renderApp('/w/!nordlys/c/!project-updates', { perspective: 'client' });
    await flush();
    expect(screen.queryByRole('button', { name: /outside/ })).toBeNull();
    expect(screen.queryByRole('img', { name: /outside/ })).toBeNull();
  });
});

describe('review fixes', () => {
  const openSettings = async (tab?: RegExp) => {
    openMenu(screen.getByRole('button', { name: 'Nordlys' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Client space settings' }));
    if (tab) fireEvent.click(within(dialog()).getByRole('tab', { name: tab }));
    await flush();
  };
  const openCreate = () => fireEvent.click(within(rail()).getByRole('button', { name: 'New client space' }));

  it('team chips have no ×; client email chips keep theirs', () => {
    renderApp('/w/!pasodrum/c/!design');
    openCreate();
    expect(within(dialog()).queryByRole('button', { name: /^Remove Sofia/ })).toBeNull();
  });

  it('shows the team the amber corner on the client in Members', async () => {
    renderApp('/w/!nordlys/c/!questions');
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /members$/ }));
    await flush();
    expect(dialog().querySelector('[class*="orner"]')).not.toBeNull();
  });

  it('never shows clients the amber corner, even on themselves in Members', async () => {
    renderApp('/w/!nordlys/c/!questions', { perspective: 'client' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /members$/ }));
    await flush();
    expect(within(dialog()).getByText('Henrik Dahl')).toBeTruthy();
    expect(dialog().querySelector('[class*="orner"]')).toBeNull();
  });

  it('never shows clients the outside mark in a group DM with another client', async () => {
    const { store } = renderApp('/dms/!dm-group', { perspective: 'client' });
    await flush();
    const snap = store().getSnapshot();
    const kari = { id: '@kari_nordlys.no:pasodrum.localhost', name: 'Kari Nordmann', external: true };
    const jonas = snap.dms[0]!.people[0]!;
    act(() => store().set({ dms: [{ id: '!dm-group', people: [snap.me, jonas, kari], unread: 0, mentions: 0, lastTs: Date.now(), spaceIds: ['!nordlys'] }, ...snap.dms] }));
    expect(screen.getByRole('main').textContent).toContain('Kari Nordmann');
    expect(screen.queryByRole('img', { name: /outside/ })).toBeNull();
  });

  it('Escape in the inline channel field and team search closes only that field', async () => {
    renderApp('/w/!pasodrum/c/!design');
    openCreate();
    await flush(); // the dialog's own open focus lands first
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add someone from Pasodrum' }));
    const search = within(dialog()).getByRole('combobox', { name: 'Add someone from Pasodrum' });
    fireEvent.change(search, { target: { value: 'jo' } });
    await flush();
    expect(search.getAttribute('aria-activedescendant')).toBe('cs-team-0');
    expect(document.getElementById('cs-team-0')?.textContent).toContain('Jonas Berg');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Add a channel' }));
    fireEvent.keyDown(within(dialog()).getByRole('textbox', { name: 'Channel name' }), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Add a channel' })).toBeTruthy();
  });

  it('cannot be closed while creating', async () => {
    renderApp('/w/!pasodrum/c/!design', { loadMs: 30 });
    openCreate();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Client name' }), { target: { value: 'Aker' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Create' }));
    expect((within(dialog()).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(() => new Promise((r) => setTimeout(r, 60)));
    const tile = within(rail()).getByRole('link', { name: 'Aker, client space' });
    expect(tile.className).toMatch(/tileFresh/);
  });

  it('turns pasted addresses into chips and keeps a bad one visible with Create off', async () => {
    renderApp('/w/!pasodrum/c/!design');
    openCreate();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Client name' }), { target: { value: 'Aker' } });
    const email = within(dialog()).getByRole('textbox', { name: 'Client email' });
    fireEvent.paste(email, { clipboardData: { getData: () => 'eva@aker.no, Eva@aker.no\nola@aker.no oops' } });
    expect(within(dialog()).getAllByRole('button', { name: /^Remove .*@aker\.no$/ })).toHaveLength(2);
    expect((email as HTMLInputElement).value).toBe('oops');
    fireEvent.blur(email);
    expect(within(dialog()).getByRole('alert').textContent).toBe('oops isn’t an email address');
    expect((within(dialog()).getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Remove only where my role allows it', async () => {
    renderApp('/w/!nordlys/c/!project-updates', { roles: { '!pasodrum': 'admin', '!nordlys': 'admin' } });
    await flush();
    await openSettings(/People/);
    openMenu(within(dialog()).getByRole('button', { name: 'More for Ingrid Holm' }));
    await screen.findByRole('menuitem', { name: 'Message' });
    expect(screen.queryByRole('menuitem', { name: 'Remove from Nordlys' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    openMenu(within(dialog()).getByRole('button', { name: 'More for Henrik Dahl' }));
    expect(await screen.findByRole('menuitem', { name: 'Remove from Nordlys' })).toBeTruthy();
  });

  it('lists every channel of the space in the remove confirm', async () => {
    renderApp('/w/!nordlys/c/!project-updates');
    await flush();
    await openSettings(/People/);
    openMenu(within(dialog()).getByRole('button', { name: 'More for Henrik Dahl' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from Nordlys' }));
    await flush();
    const ask = screen.getByRole('alertdialog');
    expect(within(ask).getByText('design-review')).toBeTruthy();
    expect(within(ask).getByText('project-updates')).toBeTruthy();
  });

  it('closes settings when Message takes you to the DM', async () => {
    const { where } = renderApp('/w/!nordlys/c/!project-updates');
    await flush();
    await openSettings(/People/);
    openMenu(within(dialog()).getByRole('button', { name: 'More for Henrik Dahl' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Message' }));
    await flush();
    expect(where()).toBe('/dms/!dm-henrik');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves a rename once, and says so when the save fails', async () => {
    const { store } = renderApp('/w/!nordlys/c/!project-updates');
    await flush();
    const real = store().updateSpace;
    const calls: unknown[] = [];
    store().updateSpace = (id, patch) => {
      calls.push(patch);
      return patch.name === 'Broken' ? Promise.reject(new Error('other')) : real(id, patch);
    };
    await openSettings();
    const name = within(dialog()).getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'Nordlys Energi' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.blur(name);
    await flush();
    expect(calls).toEqual([{ name: 'Nordlys Energi' }]);
    fireEvent.change(name, { target: { value: 'Broken' } });
    fireEvent.blur(name);
    await flush();
    expect(within(dialog()).getByRole('alert').textContent).toBe('Couldn’t rename to Broken');
  });

  it('moves the colour with the arrow keys', async () => {
    const { store } = renderApp('/w/!nordlys/c/!project-updates');
    await flush();
    await openSettings();
    const slate = within(dialog()).getByRole('radio', { name: 'Slate blue' });
    expect(slate.tabIndex).toBe(0);
    expect(within(dialog()).getByRole('radio', { name: 'Walnut' }).tabIndex).toBe(-1);
    fireEvent.keyDown(slate, { key: 'ArrowRight' });
    await flush();
    expect(store().getSnapshot().spaces.find((sp) => sp.id === '!nordlys')!.colour).toBe('#7A4B2A');
  });

  it('hides Archive and Add people in an archived space', async () => {
    const { store } = renderApp('/w/!nordlys/c/!project-updates');
    await flush();
    await act(() => store().setArchived('!nordlys', true));
    await openSettings();
    expect(within(dialog()).queryByRole('button', { name: 'Archive client space' })).toBeNull();
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /members$/ }));
    await flush();
    expect(within(dialog()).queryByRole('button', { name: 'Add people' })).toBeNull();
  });
});

