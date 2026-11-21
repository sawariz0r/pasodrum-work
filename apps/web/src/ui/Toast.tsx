import { createPortal } from 'react-dom';
import { AlertIcon } from './icons';
import s from './Toast.module.css';

/**
 * ActionFailed: a short line at the bottom for an action with no dialog. Mounted on body only while it shows, so an open
 * dialog (which hides what was there before it from assistive tech) doesn't silence it.
 */
export function Toast({ message, id }: { message?: string; id?: number }) {
  if (!message) return null;
  return createPortal(
    <div key={id} role="status" className={s.toast}>
      <AlertIcon size={16} strokeWidth={2.2} />
      <span>{message}</span>
    </div>,
    document.body,
  );
}
