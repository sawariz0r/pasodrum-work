// Pieces the encryption dialogs share (SecurityProvider, share/).
import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon } from '../../ui/icons';
import s from './Security.module.css';

/** One step of the security card. */
export type View = {
  key: string;
  title: string;
  tile?: ReactNode;
  closeable: boolean;
  alert?: boolean;
  width: number;
  body?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

/** Without `label` the dots are only decoration (a busy button says what it's doing). */
export function Dots({ label, centred = false }: { label?: string; centred?: boolean }) {
  return (
    <span role={label ? 'status' : undefined} aria-hidden={label ? undefined : true} className={[s.dots, centred && s.dotsCentred].filter(Boolean).join(' ')}>
      <span />
      <span />
      <span />
      {label && <span className={s.sr}>{label}</span>}
    </span>
  );
}

export function Tile({ ok = false, children }: { ok?: boolean; children: ReactNode }) {
  return <span className={`${s.tile} ${ok ? s.okTile : s.failTile}`}>{children}</span>;
}

export function OkTile() {
  return (
    <Tile ok>
      <CheckIcon size={28} strokeWidth={2.6} />
    </Tile>
  );
}

export function FailTile() {
  return (
    <Tile>
      <AlertIcon size={28} strokeWidth={2} />
    </Tile>
  );
}

export function FieldError({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} role="alert" className={s.error}>
      <AlertIcon size={15} strokeWidth={2.2} />
      {text}
    </p>
  );
}
