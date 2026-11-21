// A dialog opened from a menu item outlives that item. When the dialog closes, focus goes back to the menu's trigger
// (otherwise Radix returns it to the removed item and it lands on <body>).
import { useLayoutEffect, useRef } from 'react';

let last: { el: HTMLElement; at: number } | null = null;

/** Called by MenuItem on select: remembers the trigger of the menu it belongs to. */
export function rememberMenuTrigger(item: HTMLElement) {
  const id = item.closest('[role="menu"]')?.getAttribute('aria-labelledby');
  const el = id ? document.getElementById(id) : null;
  last = el ? { el, at: Date.now() } : null;
}

function takeMenuTrigger(): HTMLElement | null {
  const hit = last && Date.now() - last.at < 1000 ? last.el : null;
  last = null;
  return hit;
}

/** For a dialog's onCloseAutoFocus: focuses the menu trigger it was opened from, if there was one. */
export function useMenuReturnFocus(open: boolean): (e: Event) => void {
  const target = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) target.current = takeMenuTrigger() ?? target.current;
  }, [open]);
  return (e) => {
    const el = target.current;
    if (!el?.isConnected) return;
    e.preventDefault();
    el.focus();
  };
}
