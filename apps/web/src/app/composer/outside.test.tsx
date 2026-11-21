// @vitest-environment happy-dom
// The composer line (ClientMarkFinal): it shows when someone here doesn't belong to the space I'm in, and never to clients.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Person } from '../../matrix';
import { createFakeBackend, type FakeBackendOptions } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';

initI18n();

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(cleanup);

const henrik: Person = { id: '@henrik_nordlys.no:pasodrum.localhost', name: 'Henrik Dahl', external: true, client: '!nordlys' };
const carol: Person = { id: '@carol_kumo.jp:pasodrum.localhost', name: 'Carol Ito', external: true, client: '!kumo' };
const lea: Person = { id: '@lea:pasodrum.localhost', name: 'Lea Aune', external: true };

async function open(path: string, opts: FakeBackendOptions = {}) {
  const backend = createFakeBackend(opts);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
    </MemoryRouter>,
  );
  await screen.findByRole('textbox', { name: /Message/ });
  return backend.stores.at(-1)!;
}

const line = () => document.querySelector<HTMLElement>('[class*="outsideLine"]');
const text = () => line()?.lastElementChild?.textContent;
const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe('composer line', () => {
  it('shows Externals in a workspace channel, and opens Members', async () => {
    await open('/w/!pasodrum/c/!design');
    await waitFor(() => expect(text()).toBe('Lea Aune and 1 other are Externals'));
    fireEvent.click(line()!);
    expect(within(screen.getByRole('dialog')).getByRole('tab', { name: /Members/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('names the company of a client in a DM, with no click', async () => {
    await open('/dms/!dm-henrik');
    await waitFor(() => expect(text()).toBe('Henrik Dahl is from Nordlys'));
    expect(line()!.tagName).not.toBe('BUTTON');
  });

  it("leaves out a client space's own clients inside that space", async () => {
    const store = await open('/w/!nordlys/c/!questions');
    await waitFor(() => expect(text()).toBe('Ola Fjell is an External'));
    const snap = store.getSnapshot();
    act(() => store.set({ channels: { ...snap.channels, '!nordlys': snap.channels['!nordlys']!.map((c) => (c.id === '!questions' ? { ...c, outside: [henrik] } : c)) } }));
    await settle();
    expect(line()).toBeNull();
  });

  it('shows a client of another client space in a channel', async () => {
    const store = await open('/w/!kumo/c/!kumo-updates');
    const snap = store.getSnapshot();
    act(() => store.set({ channels: { ...snap.channels, '!kumo': snap.channels['!kumo']!.map((c) => ({ ...c, outside: [henrik] })) } }));
    await waitFor(() => expect(text()).toBe('Henrik Dahl is from Nordlys'));
  });

  it("doesn't read markup in a name as a bold company", async () => {
    const store = await open('/w/!kumo/c/!kumo-updates');
    const snap = store.getSnapshot();
    const eve: Person = { ...henrik, name: 'Eve <b>Pasodrum</b>' };
    act(() => store.set({ channels: { ...snap.channels, '!kumo': snap.channels['!kumo']!.map((c) => ({ ...c, outside: [eve] })) } }));
    await waitFor(() => expect(text()).toBe('Eve <b>Pasodrum</b> is from Nordlys'));
    expect([...line()!.querySelectorAll('strong')].map((b) => b.textContent)).toEqual(['Nordlys']);
  });

  it('counts someone from a client space I am not in as an External', async () => {
    const store = await open('/dms/!dm-jonas');
    expect(line()).toBeNull();
    const snap = store.getSnapshot();
    const stranger: Person = { id: '@kari:pasodrum.localhost', name: 'Kari Nordmann', external: true, client: '!elsewhere' };
    act(() => store.set({ dms: snap.dms.map((d) => (d.id === '!dm-jonas' ? { ...d, people: [snap.me, henrik, carol, lea, stranger] } : d)) }));
    await waitFor(() => expect(text()).toBe('People from Nordlys and Kumo, and 2 Externals, are here'));
  });

  it('is never shown to clients, in channels or group DMs', async () => {
    const store = await open('/w/!nordlys/c/!project-updates', { perspective: 'client' });
    await settle();
    expect(line()).toBeNull();
    const snap = store.getSnapshot();
    const kari = { id: '@kari_nordlys.no:pasodrum.localhost', name: 'Kari Nordmann', external: true };
    act(() => store.set({ channels: { '!nordlys': snap.channels['!nordlys']!.map((c) => ({ ...c, outside: [kari, lea] })) } }));
    await settle();
    expect(line()).toBeNull();
  });
});
