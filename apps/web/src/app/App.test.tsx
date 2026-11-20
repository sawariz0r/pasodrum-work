// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackend, type FakeBackendOptions } from '../dev/fakeBackend';
import { AppRoutes } from './App';
import { initI18n, setLanguage } from './i18n';
import { applyTheme } from './prefs';

initI18n();

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

function renderApp(path = '/', opts: FakeBackendOptions = {}) {
  const backend = createFakeBackend(opts);
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
      <Where />
    </MemoryRouter>,
  );
  const store = () => backend.stores.at(-1)!;
  return { ...utils, backend, store, where: () => screen.getByTestId('where').textContent };
}

const flush = () => act(async () => {});

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
  applyTheme();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('sign-in', () => {
  it('goes email → password → shell, with wrong password and Change', async () => {
    const { where } = renderApp('/w/!pasodrum/c/!eng', { signedIn: false });
    expect(where()).toBe('/signin');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('Forgot password?')).toBeNull();
    expect(screen.queryByText('Continue with company SSO')).toBeNull();

    const email = screen.getByLabelText('Work email');
    fireEvent.change(email, { target: { value: 'sofia@' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a full email address');

    fireEvent.change(email, { target: { value: 'sofia@pasodrum.work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await flush();
    expect(screen.getByText('sofia@pasodrum.work')).toBeTruthy();

    const password = screen.getByLabelText('Password');
    fireEvent.change(password, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await flush();
    expect(screen.getByRole('alert').textContent).toBe('Wrong password');
    fireEvent.change(password, { target: { value: 'wrongx' } });
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect((screen.getByLabelText('Work email') as HTMLInputElement).value).toBe('sofia@pasodrum.work');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await flush();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await flush();
    expect(where()).toBe('/w/!pasodrum/c/!eng');
    expect(screen.getByRole('heading', { level: 1, name: 'eng' })).toBeTruthy();
  });

  it('accepts a username and reports an unreachable other server', async () => {
    renderApp('/signin', { signedIn: false });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'jonas' } });
    const toggle = screen.getByRole('button', { name: 'Other server' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(screen.getByLabelText('Server address'), { target: { value: 'down.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await flush();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Can’t reach down.example');

    fireEvent.change(screen.getByLabelText('Server address'), { target: { value: 'pasodrum.work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await flush();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('does not submit on the Enter that commits an IME composition', () => {
    renderApp('/signin', { signedIn: false });
    const email = screen.getByLabelText('Work email');
    expect(fireEvent.keyDown(email, { key: 'Enter', isComposing: true })).toBe(false);
    expect(fireEvent.keyDown(email, { key: 'Enter', keyCode: 229 })).toBe(false);
    expect(fireEvent.keyDown(email, { key: 'Enter' })).toBe(true);
  });
});

describe('shell', () => {
  it('redirects / to the first channel, then to the last one opened', async () => {
    const { where } = renderApp('/');
    expect(where()).toBe('/w/!pasodrum/c/!design');
    fireEvent.click(screen.getByRole('link', { name: 'Nordlys, client space' }));
    expect(where()).toBe('/w/!nordlys/c/!project-updates');
    fireEvent.click(screen.getByRole('link', { name: /questions/ }));
    fireEvent.click(screen.getByRole('link', { name: 'Pasodrum workspace' }));
    expect(where()).toBe('/w/!pasodrum/c/!design');
    fireEvent.click(screen.getByRole('link', { name: 'Nordlys, client space' }));
    expect(where()).toBe('/w/!nordlys/c/!questions');
    cleanup();
    expect(renderApp('/').where()).toBe('/w/!nordlys/c/!questions');
  });

  it('shows rail tiles, channels with lock, unread and mentions, the channel name and only Messages', () => {
    renderApp('/w/!pasodrum/c/!design');
    const rail = screen.getByRole('navigation', { name: 'Workspaces and sections' });
    const pasodrum = within(rail).getByRole('link', { name: 'Pasodrum workspace' });
    expect(pasodrum.getAttribute('aria-current')).toBe('page');
    const nordlys = within(rail).getByRole('link', { name: 'Nordlys, client space' });
    expect(nordlys.getAttribute('aria-current')).toBeNull();

    const side = screen.getByRole('complementary', { name: 'Pasodrum navigation' });
    const links = within(side).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['design', 'eng', 'general', 'lead2']);
    expect(links[0]!.getAttribute('aria-current')).toBe('page');
    expect(links[1]!.className).toMatch(/strong/);
    expect(links[2]!.className).not.toMatch(/strong/);

    expect(screen.getByRole('heading', { level: 1, name: 'design' })).toBeTruthy();
    const tabs = within(screen.getByRole('tablist', { name: 'Channel views' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Messages']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel')).toBeTruthy();
  });

  it('shows the not-available page for unknown places, with a way back', () => {
    const { where } = renderApp('/w/!pasodrum/c/!gone');
    expect(screen.getByRole('heading', { name: 'This page isn’t available' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open #design' }));
    expect(where()).toBe('/w/!pasodrum/c/!design');
    cleanup();
    renderApp('/settings/nope');
    expect(screen.getByRole('heading', { name: 'This page isn’t available' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Workspaces and sections' })).toBeTruthy();
  });

  it('shows the app start skeleton while starting', async () => {
    const { store } = renderApp('/', { connection: 'starting' });
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    act(() => store().set({ connection: 'online' }));
    expect(screen.getByRole('heading', { level: 1, name: 'design' })).toBeTruthy();
  });

  it('shows offline, reconnecting with Try now, then back online briefly', () => {
    vi.useFakeTimers();
    const { store } = renderApp('/w/!pasodrum/c/!design');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => store().set({ connection: 'offline' }));
    expect(screen.getByRole('status').textContent).toBe('Offline');
    act(() => store().set({ connection: 'reconnecting' }));
    const reconnect = vi.spyOn(store(), 'reconnectNow');
    fireEvent.click(screen.getByRole('button', { name: 'Try now' }));
    expect(reconnect).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('Back online');
    act(() => vi.advanceTimersByTime(2100));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('switches theme and language instantly and remembers them', async () => {
    renderApp('/w/!pasodrum/c/!design');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('pasodrum.theme')).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Your profile: Sofia Olsen, active' }), { key: 'Enter' });
    await flush();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '日本語' }));
    await flush();
    expect(document.documentElement.lang).toBe('ja');
    expect(localStorage.getItem('pasodrum.language')).toBe('ja');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await flush();
    expect(screen.getByRole('tab').textContent).toBe('メッセージ');
  });

  it('signs out from the profile menu', async () => {
    const { where } = renderApp('/w/!pasodrum/c/!design');
    fireEvent.keyDown(screen.getByRole('button', { name: /Your profile/ }), { key: 'Enter' });
    await flush();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await flush();
    expect(where()).toBe('/signin');
    expect(screen.getByLabelText('Work email')).toBeTruthy();
  });

  it('asks for the password again when the session expires', async () => {
    localStorage.setItem('pasodrum.identifier', 'sofia@pasodrum.work');
    const { store, where } = renderApp('/w/!pasodrum/c/!design');
    act(() => store().set({ sessionExpired: true }));
    await flush();
    expect(where()).toBe('/signin');
    expect(screen.getByRole('heading', { name: 'You were signed out' })).toBeTruthy();
    expect(screen.getByText('sofia@pasodrum.work')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await flush();
    expect(screen.getByRole('heading', { level: 1, name: 'design' })).toBeTruthy();
  });

  it('opens the sidebar drawer from the header and closes it on Escape or navigation', () => {
    renderApp('/w/!pasodrum/c/!design');
    const toggle = screen.getByRole('button', { name: 'Sidebar' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('link', { name: /general/ }));
    expect(screen.getByRole('button', { name: 'Sidebar' }).getAttribute('aria-expanded')).toBe('false');
  });
});
