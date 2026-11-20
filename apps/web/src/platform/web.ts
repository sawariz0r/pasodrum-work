import type { Platform } from './index';

const badgePrefix = /^\(\d+\) /;

export function createWebPlatform(): Platform {
  const routeListeners = new Set<(route: string) => void>();

  return {
    notify({ title, body, route }) {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (document.visibilityState !== 'hidden') return;
      const notification = new Notification(title, { body });
      notification.onclick = () => {
        window.focus();
        notification.close();
        routeListeners.forEach((cb) => cb(route));
      };
    },

    setBadge(unread) {
      const title = document.title.replace(badgePrefix, '');
      document.title = unread > 0 ? `(${unread}) ${title}` : title;
      if (unread > 0) void navigator.setAppBadge?.(unread).catch(() => {});
      else void navigator.clearAppBadge?.().catch(() => {});
    },

    authRedirectUri() {
      return `${location.origin}/auth/callback`;
    },

    onOpenRoute(cb) {
      routeListeners.add(cb);
    },

    openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },

    async persistStorage() {
      return (await navigator.storage?.persist?.()) ?? false;
    },
  };
}
