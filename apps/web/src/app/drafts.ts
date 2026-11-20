// Unsent drafts, per device and per signed-in person (D-16). Storage can be blocked; reads/writes tolerate that.
import { useSyncExternalStore } from 'react';

export interface StoredDraft {
  channelId: string;
  threadRootId?: string;
  body: string;
  html?: string;
  mentions: string[];
  updatedTs: number;
}

const listeners = new Set<() => void>();
let owner = '';
let cache: Record<string, StoredDraft> = {};

const keyOf = (channelId: string, threadRootId?: string) => (threadRootId ? `${channelId}|${threadRootId}` : channelId);
const storageKey = () => `pasodrum.drafts.${owner}`;

function load() {
  try {
    cache = JSON.parse(localStorage.getItem(storageKey()) ?? '{}') as Record<string, StoredDraft>;
  } catch {
    cache = {};
  }
}

function save() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(cache));
  } catch {
    // Blocked storage: drafts last for this session only.
  }
  listeners.forEach((l) => l());
}

/** Call once per signed-in person, before reading drafts. */
export function useDraftsFor(userId: string) {
  if (owner !== userId) {
    owner = userId;
    load();
  }
}

export function getDraft(channelId: string, threadRootId?: string): StoredDraft | undefined {
  return cache[keyOf(channelId, threadRootId)];
}

/** Saves a draft; an empty body clears it. */
export function setDraft(draft: Omit<StoredDraft, 'updatedTs'>) {
  const k = keyOf(draft.channelId, draft.threadRootId);
  if (!draft.body.trim()) {
    if (!(k in cache)) return;
    const { [k]: _gone, ...rest } = cache;
    void _gone;
    cache = rest;
  } else {
    cache = { ...cache, [k]: { ...draft, updatedTs: Date.now() } };
  }
  save();
}

export function clearDraft(channelId: string, threadRootId?: string) {
  setDraft({ channelId, threadRootId, body: '', mentions: [] });
}

/** All drafts, newest first. */
export function useDrafts(): StoredDraft[] {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache,
  );
  return Object.values(snapshot).sort((a, b) => b.updatedTs - a.updatedTs);
}
