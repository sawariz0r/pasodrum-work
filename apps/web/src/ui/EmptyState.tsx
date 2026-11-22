import type { ReactNode } from 'react';
import s from './EmptyState.module.css';

export type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children?: ReactNode;
};

/** A page with nothing in it yet: tile, title, one button. `children` is for absolutely placed extras such as a drawer toggle. */
export function EmptyState({ icon, title, action, children }: EmptyStateProps) {
  return (
    <div className={s.empty}>
      {children}
      <div className={s.tile}>{icon}</div>
      <h1 className={s.title}>{title}</h1>
      {action}
    </div>
  );
}
