// One place beside main for the thread and the Assistant (SIDE-14 spec §2.4): the one opened last is drawn, closing it shows
// the other. With no Assistant registered this draws the thread exactly as before.
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { raiseThread, threadGone, useRightPanelState } from '../rightPanel';
import { useRegistry } from '../RegistryProvider';
import { useOpenThread } from '../thread/useThread';

/** The Assistant panel is drawn now: registered, open, and on top (or nothing under it). */
export function useAssistantShown(): boolean {
  const registered = !!useRegistry().assistant;
  const { assistant, top } = useRightPanelState();
  const thread = useOpenThread() !== null;
  return registered && assistant && (top === 'assistant' || !thread);
}

/** Any right panel open (the Window1024 fold). */
export function useRightPanelOpen(): boolean {
  const thread = useOpenThread() !== null;
  const assistant = useAssistantShown();
  return thread || assistant;
}

/** The slot in the shell row: the Assistant when it is on top, else the thread the page passes (Threads view). */
export function RightPanel({ thread }: { thread?: ReactNode }) {
  const Panel = useRegistry().assistant?.Panel;
  const shown = useAssistantShown();
  return shown && Panel ? <Panel /> : thread;
}

/** At Workspace level: a thread opened by URL goes on top, and ⌘J / Ctrl J toggles the Assistant (not while a dialog is open). */
export function RightPanelHost() {
  const assistant = useRegistry().assistant;
  const rootId = useOpenThread();

  // Before paint, so a thread opened over the Assistant never shows the Assistant for a frame.
  useLayoutEffect(() => {
    if (rootId) raiseThread();
    else threadGone();
  }, [rootId]);

  useEffect(() => {
    if (!assistant) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.isComposing || e.key.toLowerCase() !== 'j') return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      assistant.toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [assistant]);

  return null;
}
