import { CheckIcon, OfflineIcon } from './icons';
import s from './Banner.module.css';

export type BannerProps = {
  status: 'offline' | 'reconnecting' | 'restored';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function Banner({ status, text, actionLabel, onAction }: BannerProps) {
  return (
    <div role="status" className={`${s.banner} ${s[status]}`}>
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
