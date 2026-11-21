// What each message shows, for this tab only: the text as sent, translating, the translation, or the original again.
import { useSyncExternalStore } from 'react';
import type { Message, WorkspaceStore } from '../../matrix';
import { contentKey, onForget, translateText, type Source, type Target, type Translated } from '../../app/translate';

export interface Entry {
  status: 'none' | 'translating' | 'translated' | 'original' | 'failed';
  result?: Translated;
  /** Message + content + language the result belongs to; a mismatch (edit, language switch) translates again. */
  key?: string;
}

const none: Entry = { status: 'none' };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

onForget(() => {
  entries.clear();
  notify();
});

function set(id: string, e: Entry) {
  entries.set(id, e);
  notify();
}

export const sourceOf = (m: Message): Source => ({ id: m.id, senderId: m.sender.id, body: m.body, ...(m.html ? { html: m.html } : {}) });

export function useEntry(id: string): Entry {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries.get(id) ?? none,
  );
}

export function translate(store: WorkspaceStore, m: Message, to: Target) {
  const source = sourceOf(m);
  const key = contentKey(source, to);
  set(m.id, { status: 'translating' });
  translateText(store, source, to).then(
    (result) => {
      if (entries.get(m.id)?.status === 'translating') set(m.id, { status: 'translated', result, key });
    },
    () => {
      if (entries.get(m.id)?.status === 'translating') set(m.id, { status: 'failed' });
    },
  );
}

export function toggle(store: WorkspaceStore, m: Message, to: Target) {
  const e = entries.get(m.id) ?? none;
  if (e.status === 'translating') return;
  if (e.status === 'translated') return set(m.id, { ...e, status: 'original' });
  if (e.status === 'original' && e.key === contentKey(sourceOf(m), to)) return set(m.id, { ...e, status: 'translated' });
  translate(store, m, to);
}
