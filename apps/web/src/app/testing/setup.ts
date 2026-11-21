// Component tests render synchronously: load code split out with lazyComponent (app/lazy.tsx) before they run.
import { beforeAll } from 'vitest';

if (typeof document !== 'undefined') {
  beforeAll(async () => {
    const { preloadAll } = await import('../lazy');
    await preloadAll();
  });
}
