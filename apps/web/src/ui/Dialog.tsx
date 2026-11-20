import * as RD from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';
import s from './Dialog.module.css';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  closeLabel: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Distance from the top of the window; dialogs open from the top centre. */
  top?: number;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  bodyClassName?: string;
};

export function Dialog({ open, onOpenChange, title, closeLabel, children, footer, width = 540, top, role, className, bodyClassName }: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className={s.overlay} style={top === undefined ? undefined : { paddingTop: top }}>
          <RD.Content className={[s.content, className].filter(Boolean).join(' ')} style={{ maxWidth: width }} aria-describedby={undefined} {...(role && { role })}>
            <div className={s.header}>
              <RD.Title className={s.title}>{title}</RD.Title>
              <RD.Close asChild>
                <IconButton label={closeLabel} icon={<CloseIcon />} />
              </RD.Close>
            </div>
            {children && <div className={[s.body, bodyClassName].filter(Boolean).join(' ')}>{children}</div>}
            {footer && <div className={s.footer}>{footer}</div>}
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}
