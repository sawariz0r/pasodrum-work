// D-33: one tab per browser runs this device's crypto (a Web Lock on its store). "Use here" asks the holder to yield:
// it finishes any encryption setup it is in the middle of, then reloads into a page that never opens the store.
// Unloading releases the lock and IndexedDB transactions are atomic, so yielding is exactly as safe as closing the tab.
import type { Platform } from '../platform';

const TAKE_OVER = 'take-over';

export interface Tabs {
  /** Resolves with the lock's release once this tab may open the store; `onElsewhere` runs while another tab has it. */
  acquire(onElsewhere: () => void): Promise<() => void>;
  /** From OpenElsewhere: ask the holder to yield, then wait for the lock (another waiting tab may still get it first). */
  useHere(): void;
  close(): void;
}

type Deps = Pick<Platform, 'lock' | 'channel' | 'reload' | 'yielded' | 'setYielded'>;

/** `settle` resolves once no encryption setup (reset, new recovery key) is running. */
export function createTabs(p: Deps, lockName: string, channelName: string, settle: () => Promise<void>): Tabs {
  const channel = p.channel(channelName);
  let holding = false;
  let leaving = false;
  let asked: (() => void) | null = null;

  channel?.listen((message) => {
    if (message !== TAKE_OVER || !holding || leaving) return;
    leaving = true;
    void settle().then(() => {
      p.setYielded(true);
      p.reload();
    });
  });

  return {
    async acquire(onElsewhere) {
      // Without a way to ask the holder, waiting looks like starting (as before D-33).
      if (!channel) return p.lock(lockName);
      if (p.yielded()) {
        onElsewhere();
        await new Promise<void>((resolve) => (asked = resolve));
      }
      const release = await p.lock(lockName, onElsewhere);
      holding = true;
      return release;
    },
    useHere() {
      if (holding) return;
      p.setYielded(false);
      channel?.post(TAKE_OVER);
      asked?.();
      asked = null;
    },
    close() {
      channel?.close();
    },
  };
}
