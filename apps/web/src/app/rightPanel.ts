// The right panel's state (SIDE-14 spec §2.4): whether the Assistant is open, and which of thread and Assistant was opened
// last. The thread itself lives in the URL (?thread=). In memory only; every sign-out closes the Assistant.
import { useSyncExternalStore } from 'react';
import { onSignedOut } from './signOut';

export interface RightPanelState {
  assistant: boolean;
  top: 'thread' | 'assistant';
}

const closed: RightPanelState = { assistant: false, top: 'thread' };
let state = closed;
const listeners = new Set<() => void>();

function set(next: Partial<RightPanelState>) {
  if (Object.entries(next).every(([k, v]) => state[k as keyof RightPanelState] === v)) return;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const openAssistant = () => set({ assistant: true, top: 'assistant' });
export const closeAssistant = () => set({ assistant: false });
/** Closes the Assistant when it is on top; otherwise opens it, or brings it over the thread. */
export const toggleAssistant = () => (state.assistant && state.top === 'assistant' ? closeAssistant() : openAssistant());
/** A thread was opened (or opened again): it goes on top. */
export const raiseThread = () => set({ top: 'thread' });
/** No thread open any more: the Assistant, if open, is what shows. */
export const threadGone = () => set({ top: 'assistant' });

export function useRightPanelState(): RightPanelState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

onSignedOut(() => set(closed));
