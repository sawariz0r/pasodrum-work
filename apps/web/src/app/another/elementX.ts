import { useSyncExternalStore } from 'react';

/**
 * Opens Element X with our server already chosen (or its install page when it isn't installed).
 * `account_provider` takes the server name; supported since Element X 25.05.2 (iOS) / 25.06.0 (Android).
 */
export function elementXLink(server: string) {
  return `https://mobile.element.io/element/?account_provider=${encodeURIComponent(server)}`;
}

/** The server name people type into another app: the homeserver URL's host. */
export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export const elementXDownload = 'https://element.io/download';

/**
 * A touch-first device under 640 px (D-15, D-28 amended): app routes show the phone hand-off.
 * A narrow desktop window or a zoomed-in page keeps the app.
 */
const phoneQuery = '(max-width: 639.98px) and (pointer: coarse)';

function subscribe(onChange: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(phoneQuery);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => typeof matchMedia === 'function' && matchMedia(phoneQuery).matches);
}
