import type { ComponentPropsWithRef, ReactNode } from 'react';
import s from './Button.module.css';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  block?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = [s.button, s[variant], s[size], block && s.block, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}
