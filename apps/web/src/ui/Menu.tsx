import * as DM from '@radix-ui/react-dropdown-menu';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import s from './Menu.module.css';
import { rememberMenuTrigger } from './menuFocus';

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export type MenuContentProps = ComponentPropsWithRef<typeof DM.Content> & { width?: number };

export function MenuContent({ width, className, style, sideOffset = 8, collisionPadding = 12, ...rest }: MenuContentProps) {
  return (
    <DM.Portal>
      <DM.Content
        className={[s.content, className].filter(Boolean).join(' ')}
        style={{ width, ...style }}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        {...rest}
      />
    </DM.Portal>
  );
}

export type MenuItemProps = ComponentPropsWithRef<typeof DM.Item> & { icon?: ReactNode };

export function MenuItem({ icon, className, children, onSelect, ...rest }: MenuItemProps) {
  return (
    <DM.Item
      className={[s.item, className].filter(Boolean).join(' ')}
      onSelect={(e) => {
        if (e.currentTarget instanceof HTMLElement) rememberMenuTrigger(e.currentTarget);
        onSelect?.(e);
      }}
      {...rest}
    >
      {icon && <span className={s.icon}>{icon}</span>}
      {children}
    </DM.Item>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <DM.Separator className={[s.separator, className].filter(Boolean).join(' ')} />;
}

export type MenuSegmentsProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; lang?: string }[];
  icon?: ReactNode;
};

export function MenuSegments({ label, value, onValueChange, options, icon }: MenuSegmentsProps) {
  return (
    <div className={s.segRow}>
      {icon && <span className={s.segIcon}>{icon}</span>}
      <DM.RadioGroup aria-label={label} value={value} onValueChange={onValueChange} className={s.segments}>
        {options.map((o) => (
          <DM.RadioItem
            key={o.value}
            value={o.value}
            lang={o.lang}
            className={s.segment}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DM.RadioItem>
        ))}
      </DM.RadioGroup>
    </div>
  );
}
