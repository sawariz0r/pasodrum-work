// A dialog opened from a menu item outlives that item. When the dialog closes, focus goes back to the menu's trigger
// (otherwise Radix returns it to the removed item and it lands on <body>). A dialog opened any other way has no Radix
// Trigger, so Radix would drop focus on <body> too: it goes back to what had focus when the dialog opened.
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

/** For a dialog's onCloseAutoFocus: focuses the menu trigger it was opened from, else what had focus before it opened. */
export function useMenuReturnFocus(open: boolean): (e: Event) => void {
  const target = useRef<HTMLElement | null>(null);
  // A layout effect runs before Radix moves focus into the dialog, so the active element is still the opener.
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    target.current = takeMenuTrigger() ?? (active instanceof HTMLElement && active !== document.body ? active : null) ?? target.current;
  }, [open]);
  return (e) => {
    const el = target.current;
    if (!el?.isConnected) return;
    e.preventDefault();
    el.focus();
  };
}
