import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { WorkspaceSnapshot, WorkspaceStore } from './types';

const StoreContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceProvider({ store, children }: { store: WorkspaceStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): WorkspaceStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore outside WorkspaceProvider');
  return store;
}

/** Selector must return a part of the snapshot (or a primitive), not a new object. */
export function useWorkspace<T>(select: (s: WorkspaceSnapshot) => T): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()));
}
