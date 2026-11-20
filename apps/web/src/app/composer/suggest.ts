// Bridges a TipTap suggestion (@ mentions, :emoji:) to a React list: the plugin drives this store, the list renders from it.
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { isImeEnter } from '../../ui';

export interface SuggestState<T> {
  items: T[];
  index: number;
  query: string;
  rect: DOMRect | null;
}

export interface SuggestStore<T> {
  get(): SuggestState<T> | null;
  subscribe(listener: () => void): () => void;
  /** Open with at least one item: Enter and arrows belong to the list. */
  isOpen(): boolean;
  /** Between start and exit, even with no items: Escape belongs to the suggestion. */
  isActive(): boolean;
  pick(index: number): void;
  hover(index: number): void;
  render: () => {
    onStart: (p: SuggestionProps<T>) => void;
    onUpdate: (p: SuggestionProps<T>) => void;
    onExit: () => void;
    onKeyDown: (p: SuggestionKeyDownProps) => boolean;
  };
}

export function createSuggestStore<T>(toProps: (item: T) => unknown = (x) => x): SuggestStore<T> {
  let state: SuggestState<T> | null = null;
  let command: ((props: unknown) => void) | null = null;
  const listeners = new Set<() => void>();
  const set = (next: SuggestState<T> | null) => {
    state = next;
    listeners.forEach((l) => l());
  };
  const show = (p: SuggestionProps<T>) => {
    command = p.command as (props: unknown) => void;
    const index = state && state.query === p.query ? Math.min(state.index, Math.max(0, p.items.length - 1)) : 0;
    set({ items: p.items, index, query: p.query, rect: p.clientRect?.() ?? null });
  };
  const pick = (i: number) => {
    const item = state?.items[i];
    if (item !== undefined && command) command(toProps(item));
  };
  return {
    get: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    isOpen: () => !!state && state.items.length > 0,
    isActive: () => !!state,
    pick,
    hover(i) {
      if (state && i !== state.index) set({ ...state, index: i });
    },
    render: () => ({
      onStart: show,
      onUpdate: show,
      onExit: () => {
        command = null;
        set(null);
      },
      onKeyDown: ({ event }) => {
        if (!state || state.items.length === 0) return false;
        const n = state.items.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          set({ ...state, index: (state.index + (event.key === 'ArrowDown' ? 1 : n - 1)) % n });
          return true;
        }
        if (event.key === 'Tab' || (!event.shiftKey && isImeEnter(event))) {
          pick(state.index);
          return true;
        }
        return false;
      },
    }),
  };
}
