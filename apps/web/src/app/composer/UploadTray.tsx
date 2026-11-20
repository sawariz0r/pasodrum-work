import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Upload } from '../../matrix';
import { RetryIcon, SmallCloseIcon } from './icons';
import s from './Composer.module.css';

const kindColor: [RegExp, string][] = [
  [/pdf/, '#B42318'],
  [/word|document|msword|rtf|text\//, '#1D4ED8'],
  [/sheet|excel|csv/, '#15803D'],
  [/presentation|powerpoint|keynote/, '#C2410C'],
  [/zip|compressed|tar|rar|7z/, '#55535C'],
  [/^video\//, '#0F766E'],
  [/^audio\//, '#7E22CE'],
];

const colorOf = (u: Upload) => kindColor.find(([re]) => re.test(u.mimetype) || re.test(u.name.toLowerCase()))?.[1] ?? '#475569';
const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 4) : '');

export function formatSize(bytes: number, lng: string) {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let n = bytes;
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return new Intl.NumberFormat(lng, { style: 'unit', unit: units[i], unitDisplay: 'short', maximumFractionDigits: i === 0 ? 0 : 1 }).format(n);
}

function Remove({ u, onRemove }: { u: Upload; onRemove: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={s.remove} aria-label={t('composer.removeFile', { name: u.name })} onClick={() => onRemove(u.id)}>
      <SmallCloseIcon size={10} sw={3} />
    </button>
  );
}

function Progress({ u, onImage }: { u: Upload; onImage?: boolean }) {
  const pct = Math.round(u.progress * 100);
  return (
    <span role="progressbar" aria-label={u.name} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className={onImage ? s.imgProgress : s.fileProgress}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

function Tile({ u, onRetry, onRemove }: { u: Upload; onRetry: (id: string) => void; onRemove: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const image = u.mimetype.startsWith('image/') && u.status !== 'too-large';
  if (image) {
    return (
      <div
        role="group"
        aria-label={u.name}
        className={[s.imgTile, u.status === 'failed' && s.tileFailed].filter(Boolean).join(' ')}
        style={u.previewUrl ? ({ backgroundImage: `url("${u.previewUrl}")` } as CSSProperties) : undefined}
      >
        {u.status === 'uploading' && (
          <>
            <span className={s.imgShade} />
            <Progress u={u} onImage />
          </>
        )}
        {u.status === 'failed' && (
          <span className={s.imgFailed}>
            <button type="button" className={s.imgRetry} aria-label={t('composer.retryFile', { name: u.name })} onClick={() => onRetry(u.id)}>
              <RetryIcon />
            </button>
          </span>
        )}
        <Remove u={u} onRemove={onRemove} />
      </div>
    );
  }
  const bad = u.status === 'failed' || u.status === 'too-large';
  return (
    <div role="group" aria-label={u.name} className={[s.fileTile, bad && s.fileFailed].filter(Boolean).join(' ')}>
      <span className={s.fileIcon} style={{ background: colorOf(u) }}>
        {extOf(u.name)}
      </span>
      <span className={s.fileText}>
        <span className={s.fileName}>{u.name}</span>
        {u.status === 'uploading' && <Progress u={u} />}
        {u.status === 'done' && <span className={s.fileSize}>{formatSize(u.size, i18n.language)}</span>}
        {bad && (
          <span role="alert" className={s.fileError}>
            <span className={s.errorText}>{t(u.status === 'too-large' ? 'composer.tooLarge' : 'composer.uploadFailed')}</span>
            {u.status === 'failed' && (
              <>
                <span aria-hidden="true" className={s.sep} />
                <button type="button" className={s.retryLink} aria-label={t('composer.retryFile', { name: u.name })} onClick={() => onRetry(u.id)}>
                  {t('composer.retry')}
                </button>
              </>
            )}
          </span>
        )}
      </span>
      <Remove u={u} onRemove={onRemove} />
    </div>
  );
}

export function UploadTray({ uploads, onRetry, onRemove }: { uploads: Upload[]; onRetry: (id: string) => void; onRemove: (id: string) => void }) {
  if (uploads.length === 0) return null;
  return (
    <div className={s.tray}>
      {uploads.map((u) => (
        <Tile key={u.id} u={u} onRetry={onRetry} onRemove={onRemove} />
      ))}
    </div>
  );
}
