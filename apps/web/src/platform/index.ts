import { createDesktopPlatform } from './desktop';
import { createWebPlatform } from './web';

export interface Platform {
  notify(n: { title: string; body: string; route: string; tag?: string }): void;
  /** 'default' = never asked: the NotifyAsk card may show. The desktop app says 'granted' (macOS asks on the first notification). */
  notifyPermission(): 'default' | 'granted' | 'denied';
  askNotify(): Promise<void>;
  setBadge(unread: number): void;
  authRedirectUri(): string;
  /** One subscriber; a later call replaces it. */
  onOpenRoute(cb: (route: string) => void): void;
  /** Inside the desktop app: title bar, no Download. */
  readonly desktop: boolean;
  /** Where "Download for Mac" goes; null in the app, off a Mac, and until a signed build is published. */
  downloadUrl(): string | null;
  /** Desktop: an update is downloaded and installs on restart. One subscriber; also fires for an update that was already ready. */
  onUpdateReady(cb: () => void): void;
  restartToUpdate(): void;
  openExternal(url: string): void;
  persistStorage(): Promise<boolean>;
  /** SIDE-09: the browser's password manager takes a secret from the page (Chrome, Edge); false in Safari, Firefox and the desktop app. */
  savesPasswords(): boolean;
  /** Offers the secret to the password manager; resolves before the person answers its prompt. */
  savePassword(id: string, secret: string): Promise<void>;
  /** Saves a text file through the browser's download (the desktop app asks where). */
  saveTextFile(name: string, text: string): void;
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
