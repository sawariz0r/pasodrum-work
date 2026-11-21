import { useSyncExternalStore } from 'react';
import type { DocsBoardsSnapshot } from './docsBoardsTypes';
import { useStore } from './react';

/** Like useWorkspace, over the Docs and Boards snapshot. The selector must return part of it (or a primitive), not a new object. */
export function useDocsBoards<T>(select: (s: DocsBoardsSnapshot) => T): T {
  const { docsBoards } = useStore();
  return useSyncExternalStore(docsBoards.subscribe, () => select(docsBoards.getSnapshot()));
}
