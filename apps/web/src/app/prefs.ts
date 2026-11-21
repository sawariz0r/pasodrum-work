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
/** What the person picked: a theme, or follow the system (M4 Settings → Appearance). */
export type ThemePref = Theme | 'system';

const themeKey = 'pasodrum.theme';
const themeListeners = new Set<() => void>();
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;

function systemTheme(): Theme {
  return darkQuery?.matches ? 'dark' : 'light';
}

let themePref: ThemePref = (() => {
  const stored = read(themeKey);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
})();
let theme: Theme = themePref === 'system' ? systemTheme() : themePref;

export function applyTheme() {
  document.documentElement.dataset.theme = theme;
}

export function setThemePref(next: ThemePref) {
  themePref = next;
  theme = next === 'system' ? systemTheme() : next;
  write(themeKey, next === 'system' ? null : next);
  applyTheme();
  themeListeners.forEach((l) => l());
}

export function setTheme(next: Theme) {
  setThemePref(next);
}

darkQuery?.addEventListener?.('change', () => {
  if (themePref === 'system') setThemePref('system');
});

function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  return () => {
    themeListeners.delete(cb);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, () => theme);
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribeTheme, () => themePref);
}

/** Called after every theme change (for syncing the choice to the account). */
export function onThemePrefChange(cb: (pref: ThemePref) => void) {
  let last = themePref;
  return subscribeTheme(() => {
    if (themePref === last) return;
    last = themePref;
    cb(themePref);
  });
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

const recentKey = 'pasodrum.recent';
const recentMax = 12;

/** ⌘K's recent conversations (channel and DM ids), most recent first. */
export function recentConversations(): string[] {
  try {
    const list = JSON.parse(read(recentKey) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberRecent(id: string) {
  write(recentKey, JSON.stringify([id, ...recentConversations().filter((x) => x !== id)].slice(0, recentMax)));
}

const identifierKey = 'pasodrum.identifier';

export function lastIdentifier(): string {
  return read(identifierKey) ?? '';
}

export function rememberIdentifier(identifier: string) {
  write(identifierKey, identifier);
}
