// Code that loads on first use, out of the first-load bundle (M8).
// Unlike React.lazy, a component whose code is already here renders without suspending, so a second
// component from the same chunk (the inline editor after the composer) never flashes its fallback.
import { Suspense, type ComponentType, type ReactNode } from 'react';

const loaders = new Set<() => Promise<unknown>>();

/** Loads everything registered so far (tests render synchronously). */
export function preloadAll() {
  return Promise.all([...loaders].map((load) => load()));
}

export function lazyComponent<P extends object>(load: () => Promise<ComponentType<P>>, fallback?: (props: P) => ReactNode) {
  let Loaded: ComponentType<P> | undefined;
  let loading: Promise<ComponentType<P>> | undefined;
  const preload = () => (loading ??= load().then((c) => (Loaded = c)));
  // A preload that fails (a network blip while idle) is forgotten, so opening the component later tries again.
  loaders.add(() => preload().catch((e: unknown) => {
    loading = undefined;
    throw e;
  }));

  function Inner(props: P) {
    // Suspends the way React.lazy does; use() would object when the retry finds the code already here.
    if (!Loaded) throw preload();
    return <Loaded {...props} />;
  }
  return function Lazy(props: P) {
    return (
      <Suspense fallback={fallback?.(props)}>
        <Inner {...props} />
      </Suspense>
    );
  };
}
