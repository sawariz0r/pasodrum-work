import type { Platform } from './index';

const badgePrefix = /^\(\d+\) /;
const yieldedKey = 'pasodrum.yielded';

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

    lock(name, onWaiting) {
      const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
      if (!locks) return Promise.resolve(() => {});
      return new Promise((acquired) => {
        const hold = () => new Promise<void>((release) => acquired(release));
        void locks.request(name, { ifAvailable: true }, (lock) => {
          if (lock) return hold();
          onWaiting?.();
          void locks.request(name, hold);
          return undefined;
        });
      });
    },

    channel(name) {
      if (typeof BroadcastChannel === 'undefined') return null;
      const bc = new BroadcastChannel(name);
      return {
        post: (message) => bc.postMessage(message),
        listen(cb) {
          const onMessage = (e: MessageEvent) => typeof e.data === 'string' && cb(e.data);
          bc.addEventListener('message', onMessage);
          return () => bc.removeEventListener('message', onMessage);
        },
        close: () => bc.close(),
      };
    },

    reload() {
      location.reload();
    },

    yielded() {
      try {
        return sessionStorage.getItem(yieldedKey) === '1';
      } catch {
        return false;
      }
    },

    setYielded(yielded) {
      try {
        if (yielded) sessionStorage.setItem(yieldedKey, '1');
        else sessionStorage.removeItem(yieldedKey);
      } catch {
        // Storage blocked: a yielded tab then waits in the queue instead (still safe).
      }
    },

    deviceName() {
      const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
      const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
      const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
      return browser && os ? `${browser} on ${os}` : 'Pasodrum work';
    },
  };
}
