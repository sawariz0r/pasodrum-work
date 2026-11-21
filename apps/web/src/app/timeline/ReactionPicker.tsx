// Opens the composer's emoji picker next to a reaction trigger (hover bar React, the reactions row's add button).
import { cloneElement, useEffect, useRef, useState, type MouseEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { EmojiPicker } from '../composer/lazy';

const W = 344;
const H = 404;
const gap = 8;

type TriggerProps = { onClick?: (e: MouseEvent) => void; 'aria-expanded'?: boolean; 'aria-haspopup'?: 'dialog' };

export function ReactionPicker({
  children,
  onPick,
  align = 'end',
  onOpenChange,
}: {
  children: ReactElement<TriggerProps>;
  onPick: (key: string) => void;
  align?: 'start' | 'end';
  onOpenChange?: (open: boolean) => void;
}) {
  const [at, setAt] = useState<{ left: number; top: number; up: boolean; trigger: HTMLElement } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const open = at !== null;

  const close = (focusBack = true) => {
    const trigger = at?.trigger;
    setAt(null);
    onOpenChange?.(false);
    if (focusBack) trigger?.focus();
  };

  useEffect(() => {
    if (!at) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !at.trigger.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  });

  const toggle = (e: MouseEvent) => {
    if (open) return close();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const up = r.top - gap - H >= 8 || r.bottom + gap + H > window.innerHeight;
    const left = Math.max(8, Math.min(window.innerWidth - W - 8, align === 'end' ? r.right - W : r.left));
    setAt({ left, top: Math.max(8, up ? r.top - gap - H : r.bottom + gap), up, trigger: el });
    onOpenChange?.(true);
  };

  return (
    <>
      {cloneElement(children, { onClick: toggle, 'aria-expanded': open, 'aria-haspopup': 'dialog' })}
      {open &&
        createPortal(
          <div
            ref={box}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              }
            }}
          >
            <EmojiPicker
              style={{
                position: 'fixed',
                left: at.left,
                top: at.top,
                bottom: 'auto',
                zIndex: 40,
                transformOrigin: `${align === 'end' ? '100%' : '0'} ${at.up ? '100%' : '0'}`,
              }}
              onPick={(key) => {
                onPick(key);
                close();
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
