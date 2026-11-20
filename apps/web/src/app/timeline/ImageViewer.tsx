// Lightbox for the channel's images: ← → move, Esc closes, click toggles fit / 100 %, Download in the top bar.
import * as RD from '@radix-ui/react-dialog';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Message } from '../../matrix';
import { CloseIcon } from '../../ui/icons';
import { formatTime } from '../format';
import { ChevronLeftIcon, ChevronNextIcon, DownloadIcon } from '../icons';
import { downloadMedia, useMediaUrl } from './Media';
import s from './Viewer.module.css';
import { PersonAvatar } from './PersonAvatar';

function Picture({ message, actual, onToggle }: { message: Message; actual: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const media = message.media!;
  const url = useMediaUrl(media.ref);
  const ratio = media.width && media.height ? media.width / media.height : 3 / 2;
  return (
    <div className={`${s.stage} ${actual ? s.actual : ''}`}>
      {url ? (
        <img
          key={message.id}
          className={s.picture}
          src={url}
          alt={media.name}
          onClick={onToggle}
        />
      ) : (
        <div className={s.placeholder} style={{ aspectRatio: String(ratio) }} role="img" aria-label={media.name}>
          <span className={s.srOnly}>{t('common.loading')}</span>
        </div>
      )}
    </div>
  );
}

export function ImageViewer({ images, startId, onClose }: { images: Message[]; startId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const [index, setIndex] = useState(() => Math.max(0, images.findIndex((m) => m.id === startId)));
  const [actual, setActual] = useState(false);
  const current = images[Math.min(index, images.length - 1)];
  if (!current) return null;
  const date = new Date(current.ts);
  const go = (to: number) => {
    if (to < 0 || to >= images.length) return;
    setIndex(to);
    setActual(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'ArrowRight') go(index + 1);
  };

  return (
    <RD.Root open onOpenChange={(open) => !open && onClose()}>
      <RD.Portal>
        <RD.Overlay className={s.scrim} />
        <RD.Content className={s.viewer} aria-describedby={undefined} onKeyDown={onKeyDown}>
          <RD.Title className={s.srOnly}>{t('timeline.viewer', { name: current.sender.name })}</RD.Title>
          <div className={s.top}>
            <PersonAvatar size={32} person={current.sender} />
            <span className={s.who}>
              <span className={s.name}>{current.sender.name}</span>
              <time className={s.time} dateTime={date.toISOString()}>{formatTime(date)}</time>
            </span>
            <button
              type="button"
              className={s.button}
              aria-label={t('timeline.download')}
              onClick={() => void downloadMedia(store, current.media!)}
            >
              <DownloadIcon size={18} />
            </button>
            <RD.Close asChild>
              <button type="button" className={s.button} aria-label={t('timeline.close')}>
                <CloseIcon />
              </button>
            </RD.Close>
          </div>
          <div className={s.body}>
            <Picture key={current.id} message={current} actual={actual} onToggle={() => setActual((a) => !a)} />
            {index > 0 && (
              <button type="button" className={`${s.nav} ${s.prev}`} aria-label={t('timeline.prevImage')} onClick={() => go(index - 1)}>
                <ChevronLeftIcon />
              </button>
            )}
            {index < images.length - 1 && (
              <button type="button" className={`${s.nav} ${s.next}`} aria-label={t('timeline.nextImage')} onClick={() => go(index + 1)}>
                <ChevronNextIcon />
              </button>
            )}
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
