// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackend, type FakeBackendOptions } from '../../dev/fakeBackend';
import { AppRoutes } from '../App';
import { initI18n, setLanguage } from '../i18n';
import { elementXLink } from './elementX';

initI18n();

const flush = () => act(async () => {});
const realMatchMedia = window.matchMedia;
const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());

/** Evaluates the parts of a media query we use: narrow width and a coarse (touch) pointer. */
function viewport({ narrow, touch }: { narrow: boolean; touch: boolean }) {
  const matches = (q: string) => (!q.includes('max-width: 639.98px') || narrow) && (!q.includes('pointer: coarse') || touch);
  window.matchMedia = ((q: string) => ({ matches: matches(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}
const asPhone = () => viewport({ narrow: true, touch: true });

function renderAt(path: string, opts: FakeBackendOptions = {}) {
  const backend = createFakeBackend(opts);
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes backend={backend} />
    </MemoryRouter>,
  );
  return backend;
}

const live = () => document.querySelector('[aria-live="polite"]')!.textContent;

beforeEach(async () => {
  localStorage.clear();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  await setLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.matchMedia = realMatchMedia;
});

describe('Another app', () => {
  it('opens from the profile menu with server and username; Copy shows a check for 1.2 s and is announced', async () => {
    renderAt('/w/!pasodrum/c/!eng');
    await flush();
    fireEvent.pointerDown(screen.getByRole('button', { name: /Your profile/ }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Another app' }));
    await flush();
    const dialog = screen.getByRole('dialog', { name: 'Another app' });
    expect(within(dialog).getByText('pasodrum.work')).toBeTruthy();
    expect(within(dialog).getByText('sofia')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Get Element X' }).getAttribute('href')).toBe('https://element.io/download');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy server' }));
    await flush();
    expect(writeText).toHaveBeenLastCalledWith('pasodrum.work');
    expect(live()).toBe('Copied');
    act(() => vi.advanceTimersByTime(1199));
    expect(live()).toBe('Copied');
    act(() => vi.advanceTimersByTime(1));
    expect(live()).toBe('');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy username' }));
    await flush();
    expect(writeText).toHaveBeenLastCalledWith('sofia');
    // A second copy within 1.2 s puts a new node in the region, so it is announced again.
    const first = document.querySelector('[aria-live="polite"] > span');
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy server' }));
    await flush();
    const second = document.querySelector('[aria-live="polite"] > span');
    expect(second?.textContent).toBe('Copied');
    expect(second).not.toBe(first);
  });

  it('builds the Element X link with the server name', () => {
    expect(elementXLink('pasodrum.work')).toBe('https://mobile.element.io/element/?account_provider=pasodrum.work');
  });
});

describe('phones', () => {
  it('a narrow desktop window (split view, zoomed in) keeps the app', async () => {
    viewport({ narrow: true, touch: false });
    renderAt('/w/!pasodrum/c/!eng');
    await flush();
    expect(screen.queryByRole('heading', { name: 'Open on your computer' })).toBeNull();
    expect(screen.getByRole('button', { name: /Your profile/ })).toBeTruthy();
  });

  it('a narrow desktop window, signed out, can still sign in', async () => {
    viewport({ narrow: true, touch: false });
    renderAt('/w/!pasodrum/c/!eng', { signedIn: false });
    await flush();
    expect(screen.getByLabelText('Work email')).toBeTruthy();
  });

  it('a wide touch screen (tablet) keeps the app', async () => {
    viewport({ narrow: false, touch: true });
    renderAt('/w/!pasodrum/c/!eng');
    await flush();
    expect(screen.queryByRole('heading', { name: 'Open on your computer' })).toBeNull();
  });

  it('shows the hand-off instead of the app: the channel, Copy link and Open in Element X', async () => {
    asPhone();
    renderAt('/w/!pasodrum/c/!eng');
    await flush();
    expect(screen.getByRole('heading', { name: 'Open on your computer' })).toBeTruthy();
    expect(screen.getByText('eng')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Your profile/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open in Element X' }).getAttribute('href')).toBe(elementXLink('pasodrum.work'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/w/!pasodrum/c/!eng`);
    expect(live()).toBe('Copied');
  });

  it('signed out, the link still points where it was going', async () => {
    asPhone();
    renderAt('/w/!pasodrum/c/!eng', { signedIn: false });
    await flush();
    expect(screen.getByRole('heading', { name: 'Open on your computer' })).toBeTruthy();
    expect(screen.queryByLabelText('Work email')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/w/!pasodrum/c/!eng`);
  });

  it('the join page works; after joining Element X comes first and server and username are open', async () => {
    asPhone();
    renderAt('/join/k3y', { signedIn: false });
    await flush();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await flush();
    expect(screen.getByRole('heading', { name: 'You’re in' })).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links[0]!.textContent).toBe('Open in Element X');
    expect(links[0]!.getAttribute('href')).toBe(elementXLink('pasodrum.work'));
    expect(screen.queryByRole('button', { name: /Open in browser/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Another app' })).toBeNull();
    expect(screen.getByText('henrik_nordlys.no')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy username' }));
    await flush();
    expect(writeText).toHaveBeenLastCalledWith('henrik_nordlys.no');
  });

  it('switches to Japanese', async () => {
    asPhone();
    await setLanguage('ja');
    renderAt('/activity');
    await flush();
    expect(screen.getByRole('heading', { name: 'パソコンで開く' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Element X で開く' })).toBeTruthy();
  });
});
