import { CheckIcon, OfflineIcon } from './icons';
import s from './Banner.module.css';

export type BannerProps = {
  status: 'offline' | 'reconnecting' | 'restored';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Slides out; hidden from assistive tech and focus while it does. */
  leaving?: boolean;
};

export function Banner({ status, text, actionLabel, onAction, leaving = false }: BannerProps) {
  return (
    <div
      role="status"
      className={[s.banner, s[status], leaving && s.leaving].filter(Boolean).join(' ')}
      aria-hidden={leaving || undefined}
      inert={leaving}
    >
      {status === 'offline' && <OfflineIcon />}
      {status === 'reconnecting' && (
        <span aria-hidden="true" className={s.dots}>
          <span />
          <span />
          <span />
        </span>
      )}
      {status === 'restored' && <CheckIcon />}
      <span>{text}</span>
      {actionLabel && onAction && (
        <button type="button" className={s.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
