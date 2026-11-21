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
  /** Holds an exclusive lock across this browser's tabs; resolves with its release once acquired (at once where unsupported). */
  lock(name: string): Promise<() => void>;
}

export const platform: Platform = createWebPlatform();
