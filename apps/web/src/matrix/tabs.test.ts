import { expect, test, vi } from 'vitest';
import { createTabs } from './tabs';

function fakePlatform(yielded = false) {
  let deliver: (m: string) => void = () => {};
  const p = {
    flag: yielded,
    lock: vi.fn(() => Promise.resolve(() => {})),
    channel: () => ({ post: vi.fn(), listen: (cb: (m: string) => void) => ((deliver = cb), () => {}), close: () => {} }),
    reload: vi.fn(),
    yielded: () => p.flag,
    setYielded: vi.fn((on: boolean) => void (p.flag = on)),
  };
  return { p, send: (m: string) => deliver(m) };
}

test('a holder mid-reset yields only after it finishes; the reloaded tab never opens the store until Use here', async () => {
  const { p, send } = fakePlatform();
  let finishReset = () => {};
  const resetRunning = new Promise<void>((resolve) => (finishReset = resolve));
  const holder = createTabs(p, 'store', 'tabs', () => resetRunning);
  await holder.acquire(() => {});

  send('take-over');
  await Promise.resolve();
  expect(p.reload).not.toHaveBeenCalled();
  finishReset();
  await vi.waitFor(() => expect(p.reload).toHaveBeenCalledOnce());
  expect(p.flag).toBe(true);

  // After the reload: 'elsewhere', and no lock request until the person asks for it.
  const after = fakePlatform(true);
  const onElsewhere = vi.fn();
  const reloaded = createTabs(after.p, 'store', 'tabs', () => Promise.resolve());
  const acquired = reloaded.acquire(onElsewhere);
  await Promise.resolve();
  expect(onElsewhere).toHaveBeenCalled();
  expect(after.p.lock).not.toHaveBeenCalled();
  reloaded.useHere();
  await acquired;
  expect(after.p.lock).toHaveBeenCalledOnce();
  expect(after.p.flag).toBe(false);
});
