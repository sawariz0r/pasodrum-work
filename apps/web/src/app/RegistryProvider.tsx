import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { features as registered } from '../features';
import { buildRegistry, type Feature, type Registry } from './registry';

const defaultRegistry = buildRegistry(registered);
const RegistryContext = createContext<Registry>(defaultRegistry);

/** Tests pass their own feature list; the app uses features/index.ts. */
export function RegistryProvider({ features, children }: { features: readonly Feature[]; children: ReactNode }) {
  const registry = useMemo(() => buildRegistry(features), [features]);
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): Registry {
  return useContext(RegistryContext);
}
