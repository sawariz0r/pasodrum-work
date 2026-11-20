import { useState } from 'react';
import s from './Badge.module.css';

export type BadgeProps = {
  count: number;
  size?: 'sm' | 'md';
  className?: string;
};

/** Renders nothing at 0; pops when the count grows while shown. */
export function Badge({ count, size = 'md', className }: BadgeProps) {
  const [seen, setSeen] = useState(count);
  const [pops, setPops] = useState(0);
  if (count !== seen) {
    setSeen(count);
    if (count > seen) setPops(pops + 1);
  }
  if (count <= 0) return null;
  return (
    <span key={pops} className={[s.badge, s[size], pops > 0 && s.pop, className].filter(Boolean).join(' ')}>
      {count}
    </span>
  );
}

export function AttentionDot({ className }: { className?: string }) {
  return <span className={[s.dot, className].filter(Boolean).join(' ')} />;
}
