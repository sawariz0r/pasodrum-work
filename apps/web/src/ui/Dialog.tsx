import * as RD from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';
import s from './Dialog.module.css';
import { useMenuReturnFocus } from './menuFocus';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Absent: no close button (a step that must be finished, RecoveryKeySave). */
  closeLabel?: string;
  /** A round tile above a centred title, no close button (ConfirmDone, ConfirmDeclined). */
  tile?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Distance from the top of the window; dialogs open from the top centre. */
  top?: number;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  bodyClassName?: string;
  /** A decorative column beside header, body and footer (NewClientSpace preview). */
  aside?: ReactNode;
  busy?: boolean;
};

export function Dialog({ open, onOpenChange, title, closeLabel, tile, children, footer, width = 540, top, role, className, bodyClassName, aside, busy }: DialogProps) {
  const returnFocus = useMenuReturnFocus(open);
  const column = (
    <>
      {tile ? (
        <div className={s.centred}>
          {tile}
          <RD.Title className={s.centredTitle}>{title}</RD.Title>
        </div>
      ) : (
        <div className={[s.header, !closeLabel && s.headerBare].filter(Boolean).join(' ')}>
          <RD.Title className={s.title}>{title}</RD.Title>
          {closeLabel && (
            <RD.Close asChild>
              <IconButton label={closeLabel} icon={<CloseIcon />} />
            </RD.Close>
          )}
        </div>
      )}
      {children && <div className={[s.body, bodyClassName].filter(Boolean).join(' ')}>{children}</div>}
      {footer && <div className={s.footer}>{footer}</div>}
    </>
  );
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className={s.overlay} style={top === undefined ? undefined : { paddingTop: top }}>
          <RD.Content
            className={[s.content, aside && s.split, className].filter(Boolean).join(' ')}
            style={{ maxWidth: width }}
            aria-describedby={undefined}
            aria-busy={busy || undefined}
            onCloseAutoFocus={returnFocus}
            // An inline editor inside (marked data-claims-escape) handles its own Escape; the dialog stays.
            onEscapeKeyDown={(e) => {
              if (e.target instanceof Element && e.target.closest('[data-claims-escape]')) e.preventDefault();
            }}
            {...(role && { role })}
          >
            {aside ? (
              <>
                {aside}
                <div className={s.column}>{column}</div>
              </>
            ) : (
              column
            )}
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}
