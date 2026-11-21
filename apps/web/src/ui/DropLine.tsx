import type { CSSProperties } from 'react';
import s from './DropLine.module.css';

export type DropLineProps = {
  /** Which edge of the (position: relative) parent the line sits on. */
  edge?: 'top' | 'bottom';
  /** Distance outside that edge, in px: half the gap between rows puts it in the middle. */
  offset?: number;
  /** Left inset (a nesting depth in the tree). */
  inset?: number | string;
  /** A small ring at the start, for cards (BoardsDrag). */
  ring?: boolean;
  /** Another person's drop target (BoardsLive): their colour instead of the accent. */
  colour?: string;
};

/** Where a dragged item will land: a 2px accent line, drawn over the list without moving it. */
export function DropLine({ edge = 'bottom', offset = 5, inset = 0, ring = false, colour }: DropLineProps) {
  const style = { [edge]: -offset, left: inset, ...(colour ? { '--drop': colour } : {}) } as CSSProperties;
  return (
    <div aria-hidden="true" className={s.line} style={style}>
      {ring && <span className={s.ring} />}
    </div>
  );
}
