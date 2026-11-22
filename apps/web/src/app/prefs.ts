// Small per-browser memory: theme, last place, last sign-in. Storage can be blocked; every read/write tolerates that.
import { useSyncExternalStore } from 'react';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    // Blocked storage: the value still applies to this session.
    return false;
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

// Blocked storage: the last place lives in memory for this session.
let blockedPlace: Place | undefined;

export function lastPlace(): Place {
  return blockedPlace ?? readPlace();
}

const placeListeners = new Set<() => void>();

function setPlace(p: Place, changed: boolean) {
  blockedPlace = write(placeKey, JSON.stringify(p)) ? undefined : p;
  if (changed) placeListeners.forEach((l) => l());
}

export function rememberPlace(spaceId: string, channelId: string) {
  const p = lastPlace();
  setPlace({ space: spaceId, channels: { ...p.channels, [spaceId]: channelId } }, p.space !== spaceId);
}

/** The lit space tile changes without opening a channel (a tile in Docs or Boards, or opening another space's page). */
export function rememberSpace(spaceId: string) {
  const p = lastPlace();
  if (p.space !== spaceId) setPlace({ space: spaceId, channels: p.channels }, true);
}

function subscribePlace(cb: () => void) {
  placeListeners.add(cb);
  return () => {
    placeListeners.delete(cb);
  };
}

/** The last space opened; re-renders when it changes. */
export function useLastSpace(): string | undefined {
  return useSyncExternalStore(subscribePlace, () => lastPlace().space);
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

const notifyAskKey = 'pasodrum.notifyAsk';
const notifyAskListeners = new Set<() => void>();
// Absent until the first send; 'ask' shows the NotifyAsk card; 'done' after Turn on or ×.
let notifyAsk = read(notifyAskKey);

function setNotifyAsk(value: 'ask' | 'done') {
  notifyAsk = value;
  write(notifyAskKey, value);
  notifyAskListeners.forEach((l) => l());
}

/** The first message I send arms the NotifyAsk card. */
export function armNotifyAsk() {
  if (notifyAsk === null) setNotifyAsk('ask');
}

export function closeNotifyAsk() {
  setNotifyAsk('done');
}

function subscribeNotifyAsk(cb: () => void) {
  notifyAskListeners.add(cb);
  return () => {
    notifyAskListeners.delete(cb);
  };
}

export function useNotifyAsk(): boolean {
  return useSyncExternalStore(subscribeNotifyAsk, () => notifyAsk === 'ask');
}
