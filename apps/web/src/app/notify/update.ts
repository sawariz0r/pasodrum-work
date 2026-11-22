import { useSyncExternalStore } from 'react';
import { platform } from '../../platform';

// Desktop: an update is downloaded. × hides the card until the next launch (kept in memory only).
let ready = false;
let dismissed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

platform.onUpdateReady(() => {
  ready = true;
  emit();
});

export function dismissUpdate() {
  dismissed = true;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useUpdateCard(): boolean {
  return useSyncExternalStore(subscribe, () => ready && !dismissed);
}
