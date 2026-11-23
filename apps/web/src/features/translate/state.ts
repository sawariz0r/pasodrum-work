// What each message shows, for this tab only: the text as sent, translating, the translation, or the original again.
import { useMemo, useSyncExternalStore } from 'react';
import type { Message, WorkspaceStore } from '../../matrix';
import { onSignedOut } from '../../app/signOut';
import { contentKey, translateText, type Source, type Target, type Translated } from '../../app/translate';

export interface Entry {
  status: 'none' | 'translating' | 'translated' | 'original' | 'failed';
  result?: Translated;
  /** Message + content + language the entry belongs to; after an edit or a language switch it no longer applies. */
  key?: string;
}

const none: Entry = { status: 'none' };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

onSignedOut(() => {
  entries.clear();
  notify();
});

function set(id: string, e: Entry) {
  entries.set(id, e);
  notify();
}

export const sourceOf = (m: Message): Source => ({ id: m.id, senderId: m.sender.id, body: m.body, ...(m.html ? { html: m.html } : {}) });

/** This message's entry, or none when it belongs to text the message no longer has (an edit) or another language. */
export function useEntry(m: Message, to: Target): Entry {
  const e = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries.get(m.id) ?? none,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only the text, sender and id matter
  const key = useMemo(() => contentKey(sourceOf(m), to), [m.id, m.sender.id, m.body, m.html, to]);
  return e.key === key ? e : none;
}

export function translate(store: WorkspaceStore, m: Message, to: Target) {
  const source = sourceOf(m);
  const key = contentKey(source, to);
  const current = () => entries.get(m.id)?.status === 'translating' && entries.get(m.id)?.key === key;
  set(m.id, { status: 'translating', key });
  translateText(store, source, to).then(
    (result) => {
      if (current()) set(m.id, { status: 'translated', result, key });
    },
    () => {
      if (current()) set(m.id, { status: 'failed', key });
    },
  );
}

export function toggle(store: WorkspaceStore, m: Message, to: Target) {
  const e = entries.get(m.id);
  if (!e || e.key !== contentKey(sourceOf(m), to)) return translate(store, m, to);
  if (e.status === 'translating') return;
  if (e.status === 'translated') return set(m.id, { ...e, status: 'original' });
  if (e.status === 'original') return set(m.id, { ...e, status: 'translated' });
  translate(store, m, to);
}
