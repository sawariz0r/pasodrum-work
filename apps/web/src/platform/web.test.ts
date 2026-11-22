// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createWebPlatform } from './web';

class FakeNotification {
  static permission: NotificationPermission = 'granted';
  static instances: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public options: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function setNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, value });
}

beforeEach(() => {
  FakeNotification.permission = 'granted';
  FakeNotification.instances = [];
  vi.stubGlobal('Notification', FakeNotification);
  setVisibility('hidden');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('notify', () => {
  test('shows a notification when granted; click focuses and opens the route', () => {
    const platform = createWebPlatform();
    const onRoute = vi.fn();
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    platform.onOpenRoute(onRoute);

    platform.notify({ title: 'Ana', body: 'hi', route: '/c/general' });

    const [shown] = FakeNotification.instances;
    expect(shown?.title).toBe('Ana');
    expect(shown?.options.body).toBe('hi');
    shown?.onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(shown?.close).toHaveBeenCalled();
    expect(onRoute).toHaveBeenCalledWith('/c/general');
  });

  test.each(['default', 'denied'] as const)('stays silent when permission is %s', (permission) => {
    FakeNotification.permission = permission;
    createWebPlatform().notify({ title: 'Ana', body: 'hi', route: '/' });
    expect(FakeNotification.instances).toHaveLength(0);
  });

  test('does nothing without the Notification API', () => {
    vi.stubGlobal('Notification', undefined);
    expect(() => createWebPlatform().notify({ title: 'Ana', body: 'hi', route: '/' })).not.toThrow();
  });
});

describe('setBadge', () => {
  test('prefixes the title with the count and sets the app badge', () => {
    const setAppBadge = vi.fn(() => Promise.resolve());
    const clearAppBadge = vi.fn(() => Promise.resolve());
    setNavigator('setAppBadge', setAppBadge);
    setNavigator('clearAppBadge', clearAppBadge);
    document.title = 'Pasodrum';
    const platform = createWebPlatform();

    platform.setBadge(3);
    expect(document.title).toBe('(3) Pasodrum');
    expect(setAppBadge).toHaveBeenCalledWith(3);

    platform.setBadge(12);
    expect(document.title).toBe('(12) Pasodrum');

    platform.setBadge(0);
    expect(document.title).toBe('Pasodrum');
    expect(clearAppBadge).toHaveBeenCalled();
  });

  test('works without the Badging API', () => {
    setNavigator('setAppBadge', undefined);
    setNavigator('clearAppBadge', undefined);
    document.title = 'Pasodrum';
    createWebPlatform().setBadge(2);
    expect(document.title).toBe('(2) Pasodrum');
  });
});

test('authRedirectUri points at /auth/callback on this origin', () => {
  expect(createWebPlatform().authRedirectUri()).toBe(`${location.origin}/auth/callback`);
});

test('onOpenRoute ignores browser back/forward (the router owns those)', () => {
  const onRoute = vi.fn();
  createWebPlatform().onOpenRoute(onRoute);
  history.pushState(null, '', '/c/design?x=1#m');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(onRoute).not.toHaveBeenCalled();
});

test('openExternal opens a new tab without opener', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  createWebPlatform().openExternal('https://example.com');
  expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
});

describe('persistStorage', () => {
  test('asks the browser to persist storage', async () => {
    setNavigator('storage', { persist: () => Promise.resolve(true) });
    await expect(createWebPlatform().persistStorage()).resolves.toBe(true);
  });

  test('resolves false without the Storage API', async () => {
    setNavigator('storage', undefined);
    await expect(createWebPlatform().persistStorage()).resolves.toBe(false);
  });
});

// SIDE-09 (D-30, security): the recovery key reaches only the chosen save target, never the network or storage.
describe('saving the recovery key', () => {
  const KEY = 'EsTc 4Rk9 Wq2N 7hXb';
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    localStorage.clear();
    sessionStorage.clear();
  });
  const untouched = () => {
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(KEY);
    expect(location.href).not.toContain('4Rk9');
  };

  test('Save to Passwords hands the key to the password manager only', async () => {
    class FakeCredential {
      constructor(public data: { id: string; password: string; name?: string }) {}
    }
    vi.stubGlobal('PasswordCredential', FakeCredential);
    const store = vi.fn(async () => undefined);
    setNavigator('credentials', { store });
    const platform = createWebPlatform();
    expect(platform.savesPasswords()).toBe(true);
    await platform.savePassword('Recovery key', KEY);
    expect(store).toHaveBeenCalledOnce();
    expect((store.mock.calls[0] as unknown as [FakeCredential])[0].data).toEqual({ id: 'Recovery key', password: KEY, name: 'Pasodrum work' });
    untouched();
  });

  test('Download makes a local file and frees it', async () => {
    const blobs: Blob[] = [];
    const created = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => (blobs.push(b as Blob), 'blob:local/1'));
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('Pasodrum recovery key.txt');
      expect(this.href).toBe('blob:local/1');
    });
    vi.useFakeTimers();
    createWebPlatform().saveTextFile('Pasodrum recovery key.txt', `${KEY}\n`);
    expect(click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(await blobs[0]!.text()).toBe(`${KEY}\n`);
    expect(revoked).toHaveBeenCalledWith('blob:local/1');
    untouched();
    created.mockRestore();
    revoked.mockRestore();
    click.mockRestore();
  });
});
