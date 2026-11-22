import type { Platform } from './index';
import { createWebPlatform } from './web';

/** Injected by the desktop shell before the app's scripts run (Electron preload). */
export interface ShellBridge {
  readonly shell: 'electron';
  notify(n: { title: string; body: string; route: string; tag?: string }): void;
  setBadge(unread: number): void;
  openExternal(url: string): void;
  /** In-app path ("/c/x?y#z") from a notification click or deep link. A route that arrived before the first subscriber is delivered to it. */
  onOpenRoute(cb: (route: string) => void): void;
  onUpdateReady(cb: () => void): void;
  /** Mac app 1.0.3+ returns a promise that settles if the restart failed; older shells return nothing. */
  restartToUpdate(): void | Promise<void>;
}

declare global {
  interface Window {
    pasodrumShell?: ShellBridge;
  }
}

export function createDesktopPlatform(shell: ShellBridge): Platform {
  return {
    ...createWebPlatform(),
    desktop: true,
    notify: (n) => shell.notify(n),
    notifyPermission: () => 'granted',
    setBadge: (unread) => shell.setBadge(unread),
    openExternal: (url) => shell.openExternal(url),
    onOpenRoute: (cb) => shell.onOpenRoute(cb),
    onUpdateReady: (cb) => shell.onUpdateReady(cb),
    restartToUpdate: async () => {
      await shell.restartToUpdate();
    },
    downloadUrl: () => null,
    // Electron has no password manager; a download opens the macOS Save panel.
    savesPasswords: () => false,
    deviceName: () => (document.documentElement.lang === 'ja' ? 'Mac の Pasodrum work' : 'Pasodrum work on Mac'),
  };
}
