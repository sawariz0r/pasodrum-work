// Shared between the timeline (actions) and the composer: which message is being replied to or edited.
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';

export interface ComposerContextValue {
  replyToId: string | null;
  editingId: string | null;
  startReply(messageId: string): void;
  cancelReply(): void;
  startEdit(messageId: string): void;
  stopEdit(): void;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const value = useMemo<ComposerContextValue>(
    () => ({
      replyToId,
      editingId,
      startReply: (id) => setReplyToId(id),
      cancelReply: () => setReplyToId(null),
      startEdit: (id) => setEditingId(id),
      stopEdit: () => setEditingId(null),
    }),
    [replyToId, editingId],
  );
  return createElement(ComposerContext.Provider, { value }, children);
}

export function useComposer(): ComposerContextValue {
  const value = useContext(ComposerContext);
  if (!value) throw new Error('useComposer outside ComposerProvider');
  return value;
}
