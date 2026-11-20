// Small per-browser memory: theme, last place, last sign-in. Storage can be blocked; every read/write tolerates that.
import { useSyncExternalStore } from 'react';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the value still applies to this session.
  }
}

export type Theme = 'light' | 'dark';

const themeKey = 'pasodrum.theme';
const themeListeners = new Set<() => void>();

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let theme: Theme = (() => {
  const stored = read(themeKey);
  return stored === 'light' || stored === 'dark' ? stored : systemTheme();
})();

export function applyTheme() {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(next: Theme) {
  theme = next;
  write(themeKey, next);
  applyTheme();
  themeListeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    () => theme,
  );
}

const placeKey = 'pasodrum.place';

type Place = { space?: string; channels: Record<string, string> };

function readPlace(): Place {
  try {
    const p = JSON.parse(read(placeKey) ?? '{}') as Partial<Place>;
    return { space: typeof p.space === 'string' ? p.space : undefined, channels: p.channels ?? {} };
  } catch {
    return { channels: {} };
  }
}

export function lastPlace(): Place {
  return readPlace();
}

export function rememberPlace(spaceId: string, channelId: string) {
  const p = readPlace();
  write(placeKey, JSON.stringify({ space: spaceId, channels: { ...p.channels, [spaceId]: channelId } }));
}

const identifierKey = 'pasodrum.identifier';

export function lastIdentifier(): string {
  return read(identifierKey) ?? '';
}

export function rememberIdentifier(identifier: string) {
  write(identifierKey, identifier);
}
