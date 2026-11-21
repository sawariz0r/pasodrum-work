import type { Platform } from './index';
import { createWebPlatform } from './web';

/** Injected by the desktop shell before the app's scripts run (Electron preload / Tauri initialization script). */
export interface ShellBridge {
  readonly shell: 'tauri' | 'electron';
  notify(n: { title: string; body: string; route: string }): void;
  setBadge(unread: number): void;
  openExternal(url: string): void;
  /** In-app path ("/c/x?y#z") from a notification click or deep link. A route that arrived before the first subscriber is delivered to it. */
  onOpenRoute(cb: (route: string) => void): void;
}

declare global {
  interface Window {
    pasodrumShell?: ShellBridge;
  }
}

export function createDesktopPlatform(shell: ShellBridge): Platform {
  return {
    ...createWebPlatform(),
    notify: (n) => shell.notify(n),
    setBadge: (unread) => shell.setBadge(unread),
    openExternal: (url) => shell.openExternal(url),
    onOpenRoute: (cb) => shell.onOpenRoute(cb),
  };
}
