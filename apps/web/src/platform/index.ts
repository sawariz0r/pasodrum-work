import { createWebPlatform } from './web';

export interface Platform {
  notify(n: { title: string; body: string; route: string }): void;
  setBadge(unread: number): void;
  authRedirectUri(): string;
  onOpenRoute(cb: (route: string) => void): void;
  openExternal(url: string): void;
  persistStorage(): Promise<boolean>;
}

export const platform: Platform = createWebPlatform();
