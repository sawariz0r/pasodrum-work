// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackend, type FakeBackendOptions } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';
import { nameFromEmail, strength } from './JoinPage';

initI18n();

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname}</span>;
}

function renderJoin(code: string, opts: FakeBackendOptions = { signedIn: false }) {
  const backend = createFakeBackend(opts);
  render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <AppRoutes backend={backend} />
      <Where />
    </MemoryRouter>,
  );
  return { backend, store: () => backend.stores.at(-1)!, where: () => screen.getByTestId('where').textContent };
}

const flush = () => act(async () => {});
const joinButton = () => screen.getByRole('button', { name: 'Join' }) as HTMLButtonElement;

beforeEach(async () => {
  localStorage.clear();
  await setLanguage('en');
});
afterEach(() => cleanup());

describe('join page', () => {
  it('claims the account, shows Another app, then opens the channel with everything read', async () => {
    const { backend, store, where } = renderJoin('k3y');
    await flush();
    expect(screen.getByRole('heading', { name: 'Join Nordlys' })).toBeTruthy();
    expect(screen.getByText('henrik@nordlys.no')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Jonas Berg, Maja Lind and Ingrid Holm are here' })).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Henrik');
    expect(screen.queryByText(/Download/)).toBeNull();

    expect(joinButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Henrik Dahl' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    expect(joinButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('text');
    fireEvent.click(joinButton());
    await flush();
    expect(backend.claims).toEqual([{ code: 'k3y', name: 'Henrik Dahl' }]);

    expect(screen.getByRole('heading', { name: 'You’re in' })).toBeTruthy();
    const other = screen.getByRole('button', { name: 'Another app' });
    fireEvent.click(other);
    expect(other.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('pasodrum.work')).toBeTruthy();
    expect(screen.getByText('henrik_nordlys.no')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy username' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Open in browser/ }));
    await flush();
    expect(where()).toBe('/w/!nordlys/c/!project-updates');
    const x = store().getSnapshot();
    expect(x.me.name).toBe('Henrik Dahl');
    expect(Object.values(x.channels).flat().every((c) => c.unread === 0 && c.mentions === 0)).toBe(true);
    expect(x.dms.every((d) => d.unread === 0)).toBe(true);
    expect(x.activity.every((a) => !a.unread)).toBe(true);
    const zone = (await store().profile(x.me.id)).timeZone;
    expect(zone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('shows a used link with Sign in', async () => {
    const { where } = renderJoin('used');
    await flush();
    expect(screen.getByRole('heading', { name: 'Link already used' })).toBeTruthy();
    expect(screen.getByText('henrik@nordlys.no')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(where()).toBe('/signin');
  });

  it('shows an expired link with nothing to press', async () => {
    renderJoin('expired');
    await flush();
    expect(screen.getByRole('heading', { name: 'Link expired' })).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows a link it can’t look up as not available', async () => {
    renderJoin('offline');
    await flush();
    expect(screen.getByRole('heading', { name: 'This page isn’t available' })).toBeTruthy();
  });

  it('turns a 410 on claim into the link’s state', async () => {
    renderJoin('gone');
    await flush();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long password' } });
    fireEvent.click(joinButton());
    await flush();
    expect(screen.getByRole('heading', { name: 'Link already used' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the form with an error when the claim fails otherwise', async () => {
    renderJoin('down');
    await flush();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long password' } });
    fireEvent.click(joinButton());
    await flush();
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t join');
    expect(screen.getByRole('heading', { name: 'Join Nordlys' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a longer password' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks for a longer password when the service refuses it', async () => {
    renderJoin('weak');
    await flush();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long password' } });
    fireEvent.click(joinButton());
    await flush();
    expect(screen.getByRole('alert').textContent).toBe('Choose a longer password');
  });

  it('offers to switch when someone else is signed in', async () => {
    const { store, where } = renderJoin('k3y', { signedIn: true });
    await flush();
    expect(screen.getByRole('heading', { name: 'Join Nordlys' })).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue as Sofia Olsen' })).toBeTruthy();

    const signOut = vi.spyOn(store(), 'signOut');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and join' }));
    await flush();
    expect(signOut).toHaveBeenCalled();
    expect(where()).toBe('/join/k3y');
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('continues as the signed-in person', async () => {
    const { where } = renderJoin('k3y', { signedIn: true });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Continue as Sofia Olsen' }));
    await flush();
    expect(where()).not.toMatch(/^\/join/);
  });

  it('reads in Japanese', async () => {
    await setLanguage('ja');
    renderJoin('k3y', { signedIn: true });
    await flush();
    expect(screen.getByRole('heading', { name: 'Nordlys に参加' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'サインアウトして参加' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sofia Olsen として続ける' })).toBeTruthy();
  });
});

describe('join helpers', () => {
  it('starts the name from the email', () => {
    expect(nameFromEmail('henrik.dahl@nordlys.no')).toBe('Henrik Dahl');
    expect(nameFromEmail('maja@pasodrum.work')).toBe('Maja');
  });

  it('scores passwords like the board', () => {
    expect([strength(''), strength('short'), strength('eight888'), strength('twelve-chars'), strength('twelvechars1'), strength('sixteencharacter')]).toEqual([0, 1, 2, 4, 3, 4]);
  });
});
