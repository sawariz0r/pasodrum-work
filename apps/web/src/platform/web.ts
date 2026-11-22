import type { Platform } from './index';

const badgePrefix = /^\(\d+\) /;
const yieldedKey = 'pasodrum.yielded';
const MAC_DOWNLOAD = true;

// Chromium only, so not in TypeScript's DOM types.
declare const PasswordCredential: new (data: { id: string; password: string; name?: string }) => Credential;

export function createWebPlatform(): Platform {
  let routeListener: ((route: string) => void) | undefined;

  return {
    notify({ title, body, route, tag }) {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const notification = new Notification(title, { body, tag });
      notification.onclick = () => {
        window.focus();
        notification.close();
        routeListener?.(route);
      };
    },

    notifyPermission: () => (typeof Notification === 'undefined' ? 'denied' : Notification.permission),

    async askNotify() {
      if (typeof Notification !== 'undefined') await Notification.requestPermission();
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
      routeListener = cb;
    },

    desktop: false,

    downloadUrl() {
      const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
      return MAC_DOWNLOAD && /Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) && navigator.maxTouchPoints < 2 ? '/download/mac' : null;
    },

    onUpdateReady() {},

    async restartToUpdate() {},

    openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },

    async persistStorage() {
      return (await navigator.storage?.persist?.()) ?? false;
    },

    savesPasswords: () => typeof window !== 'undefined' && 'PasswordCredential' in window,

    async savePassword(id, secret) {
      await navigator.credentials.store(new PasswordCredential({ id, password: secret, name: 'Pasodrum work' }));
    },

    saveTextFile(name, text) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.download = name;
      a.click();
      // Safari drops a download whose URL is revoked at once.
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
