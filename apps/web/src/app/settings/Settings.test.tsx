// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackend } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { currentLanguage, initI18n, setLanguage } from '../i18n';
import { applyTheme, setThemePref } from '../prefs';

initI18n();

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname}</span>;
}

function renderApp(path: string) {
  const backend = createFakeBackend();
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
      <Where />
    </MemoryRouter>,
  );
  return { store: () => backend.stores.at(-1)!, where: () => screen.getByTestId('where').textContent };
}

const flush = () => act(async () => {});
const dialog = () => screen.getByRole('dialog', { name: 'Settings' });

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
  setThemePref('light');
  applyTheme();
});
afterEach(() => cleanup());

describe('settings', () => {
  it('opens from the profile menu over the channel, switches tabs and closes back', async () => {
    const { where } = renderApp('/w/!pasodrum/c/!eng');
    await flush();
    fireEvent.pointerDown(screen.getByRole('button', { name: /Your profile/ }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Settings' }));
    await flush();
    expect(where()).toBe('/settings');
    expect(within(dialog()).getByRole('heading', { name: 'Profile' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'eng', hidden: true })).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Devices' }));
    expect(where()).toBe('/settings/devices');
    expect(within(dialog()).getByRole('button', { name: 'Devices' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    await flush();
    expect(where()).toBe('/w/!pasodrum/c/!eng');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves the name on blur and the time zone on change', async () => {
    const { store } = renderApp('/settings');
    await flush();
    const update = vi.spyOn(store(), 'updateProfile');
    const name = within(dialog()).getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('Sofia Olsen');
    fireEvent.change(name, { target: { value: 'Sofia O.' } });
    fireEvent.blur(name);
    await flush();
    expect(update).toHaveBeenCalledWith({ name: 'Sofia O.' });
    expect(store().getSnapshot().me.name).toBe('Sofia O.');
    expect(within(dialog()).getByText('sofia@pasodrum.work')).toBeTruthy();

    const zone = within(dialog()).getByLabelText('Time zone') as HTMLSelectElement;
    expect(zone.value).toBe('Europe/Oslo');
    expect(within(dialog()).getByText(/^Oslo · \d\d:\d\d$/, { selector: 'span' })).toBeTruthy();
    fireEvent.change(zone, { target: { value: 'Asia/Tokyo' } });
    await flush();
    expect(update).toHaveBeenLastCalledWith({ timeZone: 'Asia/Tokyo' });
    expect(within(dialog()).getByText(/^Tokyo · \d\d:\d\d$/, { selector: 'span' })).toBeTruthy();
  });

  it('shows when the name couldn’t be saved', async () => {
    const { store } = renderApp('/settings');
    await flush();
    vi.spyOn(store(), 'updateProfile').mockRejectedValue(new Error('down'));
    const name = within(dialog()).getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Sofia O.' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.blur(name);
    await flush();
    expect(within(dialog()).getByRole('alert').textContent).toBe('Couldn’t save');
  });

  it('saves the default notification level', async () => {
    const { store } = renderApp('/settings/notifications');
    await flush();
    const set = vi.spyOn(store(), 'setNotifyLevel');
    expect((within(dialog()).getByRole('radio', { name: 'DMs, mentions and replies' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Nothing' }));
    await flush();
    expect(set).toHaveBeenCalledWith('default', 'none');
    expect(store().notifyLevel('default')).toBe('none');
    expect(screen.queryByText('Sound')).toBeNull();
  });

  it('switches theme and language here and syncs them to the account', async () => {
    const { store } = renderApp('/settings/appearance');
    await flush();
    const sync = vi.spyOn(store(), 'setSetting');
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(sync).toHaveBeenCalledWith('theme', 'dark');
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Match system' }));
    expect(sync).toHaveBeenLastCalledWith('theme', 'system');

    fireEvent.click(within(dialog()).getByRole('radio', { name: '日本語' }));
    await flush();
    expect(currentLanguage()).toBe('ja');
    expect(sync).toHaveBeenLastCalledWith('language', 'ja');
    expect(within(screen.getByRole('dialog', { name: '設定' })).getByRole('heading', { name: '表示と言語' })).toBeTruthy();
  });

  it('syncs a language switch from the profile menu too', async () => {
    const { store } = renderApp('/w/!pasodrum/c/!eng');
    await flush();
    const sync = vi.spyOn(store(), 'setSetting');
    await act(() => setLanguage('ja'));
    expect(sync).toHaveBeenCalledWith('language', 'ja');
  });

  it('stamps an account without a saved language with the current one', async () => {
    const { store } = renderApp('/w/!pasodrum/c/!eng');
    await flush();
    expect(await store().settings()).toEqual({ language: 'en' });
  });

  it('lists devices, this one first, and signs out one and the others', async () => {
    const { store } = renderApp('/settings/devices');
    await flush();
    const rows = within(dialog()).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText('This device')).toBeTruthy();
    expect(within(rows[0]!).getByText('Active now')).toBeTruthy();
    expect(within(rows[0]!).queryByRole('button')).toBeNull();
    expect(within(rows[2]!).getByText('Yesterday')).toBeTruthy();

    const one = vi.spyOn(store(), 'signOutDevice');
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Sign out' }));
    await flush();
    expect(one).toHaveBeenCalledWith('IOS1');
    expect(within(dialog()).getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Sign out of other devices' }));
    await flush();
    const prompt = screen.getByRole('dialog', { name: 'Sign out of other devices' });
    const password = within(prompt).getByLabelText('Password');
    fireEvent.change(password, { target: { value: 'wrong' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Sign out' }));
    await flush();
    expect(within(prompt).getByRole('alert').textContent).toBe('Wrong password');
    fireEvent.change(password, { target: { value: 'right' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Sign out' }));
    await flush();
    expect(screen.queryByRole('dialog', { name: 'Sign out of other devices' })).toBeNull();
    expect(within(dialog()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(dialog()).queryByRole('button', { name: 'Sign out of other devices' })).toBeNull();
  });

  it('cancels the password prompt without signing out', async () => {
    renderApp('/settings/devices');
    await flush();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Sign out of other devices' }));
    await flush();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Sign out of other devices' })).getByRole('button', { name: 'Cancel' }));
    await flush();
    expect(screen.queryByRole('dialog', { name: 'Sign out of other devices' })).toBeNull();
    expect(within(dialog()).getAllByRole('listitem')).toHaveLength(4);
    expect(within(dialog()).queryByRole('alert')).toBeNull();
  });

  it('shows an error when signing out other devices fails', async () => {
    const { store } = renderApp('/settings/devices');
    await flush();
    vi.spyOn(store(), 'signOutOtherDevices').mockRejectedValue(new Error('unreachable'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Sign out of other devices' }));
    await flush();
    expect(within(dialog()).getByRole('alert').textContent).toBe('Couldn’t sign out');
    expect(within(dialog()).getAllByRole('listitem')).toHaveLength(4);
  });

  it('opens a direct link over the home channel and closes to it', async () => {
    const { where } = renderApp('/settings/devices');
    await flush();
    expect(within(dialog()).getByRole('heading', { name: 'Devices' })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await flush();
    expect(where()).toMatch(/^\/w\//);
  });
});
