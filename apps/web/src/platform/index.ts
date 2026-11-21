import { createDesktopPlatform } from './desktop';
import { createWebPlatform } from './web';

export interface Platform {
  notify(n: { title: string; body: string; route: string }): void;
  setBadge(unread: number): void;
  authRedirectUri(): string;
  onOpenRoute(cb: (route: string) => void): void;
  openExternal(url: string): void;
  persistStorage(): Promise<boolean>;
  /** Name for a new sign-in's device, e.g. "Safari on Mac" (shown in Devices and when confirming a device). */
  deviceName(): string;
  /**
   * Holds an exclusive lock across this browser's tabs; resolves with its release once acquired (at once where unsupported).
   * `onWaiting` runs once when another tab holds it, before queueing.
   */
  lock(name: string, onWaiting?: () => void): Promise<() => void>;
  /** Messages between this browser's tabs; null where unsupported. */
  channel(name: string): TabChannel | null;
  reload(): void;
  /** D-33: this tab gave its device to another tab; until cleared (Use here) its reloads don't open the crypto store. */
  yielded(): boolean;
  setYielded(yielded: boolean): void;
}

export interface TabChannel {
  post(message: string): void;
  listen(cb: (message: string) => void): () => void;
  close(): void;
}

const shell = typeof window === 'undefined' ? undefined : window.pasodrumShell;
export const platform: Platform = shell ? createDesktopPlatform(shell) : createWebPlatform();
