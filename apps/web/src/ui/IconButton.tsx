import type { ComponentPropsWithRef, ReactNode } from 'react';
import s from './IconButton.module.css';

export type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'aria-label' | 'children'> & {
  label: string;
  icon: ReactNode;
  size?: 24 | 28 | 30 | 34;
  outline?: boolean;
};

export function IconButton({ label, icon, size = 34, outline = false, type = 'button', className, ...rest }: IconButtonProps) {
  const cls = [s.button, s[`s${size}`], outline && s.outline, className].filter(Boolean).join(' ');
  return (
    <button type={type} aria-label={label} className={cls} {...rest}>
      {icon}
    </button>
  );
}
