import s from './Badge.module.css';

export type BadgeProps = {
  count: number;
  size?: 'sm' | 'md';
  className?: string;
};

export function Badge({ count, size = 'md', className }: BadgeProps) {
  return <span className={[s.badge, s[size], className].filter(Boolean).join(' ')}>{count}</span>;
}

export function AttentionDot({ className }: { className?: string }) {
  return <span className={[s.dot, className].filter(Boolean).join(' ')} />;
}
