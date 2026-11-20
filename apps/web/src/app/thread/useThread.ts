// The open thread lives in the URL (?thread=<rootId>, D-19). The shell can read it to fold the sidebar (Window1024).
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

const param = 'thread';

/** Root id of the thread open in the current channel, or null. */
export function useOpenThread(): string | null {
  const [params] = useSearchParams();
  return params.get(param) || null;
}

export function useThreadNav(): { open(rootId: string): void; close(): void } {
  const [, setParams] = useSearchParams();
  const go = useCallback(
    (rootId: string | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (rootId) next.set(param, rootId);
          else next.delete(param);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return useMemo(() => ({ open: (id: string) => go(id), close: () => go(null) }), [go]);
}
