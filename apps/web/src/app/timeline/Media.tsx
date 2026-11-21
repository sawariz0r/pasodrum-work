// Inline images, video, audio and file cards. Media URLs come from store.mediaUrl (authenticated, cached in matrix/).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Media, type Message, type WorkspaceStore } from '../../matrix';
import { IconButton } from '../../ui';
import { formatDuration, formatSize } from '../format';
import { DownloadIcon, PauseIcon, PlayIcon } from '../icons';
import s from './Rich.module.css';

export function useMediaUrl(ref: string | undefined, thumbnail = false): string | undefined {
  const store = useStore();
  const [got, setGot] = useState<{ key: string; url: string }>();
  const key = ref ? `${ref}|${thumbnail}` : '';
  useEffect(() => {
    if (!ref) return;
    let live = true;
    store.mediaUrl(ref, thumbnail ? { thumbnail: true } : undefined).then(
      (url) => live && setGot({ key: `${ref}|${thumbnail}`, url }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, ref, thumbnail]);
  return got?.key === key ? got.url : undefined;
}

export async function downloadMedia(store: WorkspaceStore, media: Media) {
  const url = await store.mediaUrl(media.ref);
  const a = document.createElement('a');
  a.href = url;
  a.download = media.name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

/** One image up to 360 × 280, aspect kept; unknown size gets a 360 × 240 placeholder. */
export function fitImage(media: Media, maxW = 360, maxH = 280): { width: number; height: number } {
  const { width: w, height: h } = media;
  if (!w || !h) return { width: maxW, height: 240 };
  const scale = Math.min(1, maxW / w, maxH / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function Img({ media }: { media: Media }) {
  const url = useMediaUrl(media.thumbnailRef ?? media.ref, true);
  return url ? <img className={s.img} src={url} alt="" draggable={false} /> : null;
}

export function ImageSingle({ message, onOpen }: { message: Message; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const media = message.media!;
  const size = fitImage(media);
  return (
    <button
      type="button"
      className={s.media}
      style={size}
      aria-label={t('timeline.openImage', { name: media.name })}
      onClick={() => onOpen(message.id)}
    >
      <Img media={media} />
    </button>
  );
}

/** Consecutive images from one sender: 2 side by side, 3 with a tall first, 4 as 2 × 2, more as 4 with "+N". */
export function ImageGrid({ messages, onOpen }: { messages: Message[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const shown = messages.slice(0, 4);
  const extra = messages.length - shown.length;
  return (
    <div className={s.grid} style={{ gridAutoRows: messages.length === 2 ? 200 : 132 }}>
      {shown.map((m, i) => (
        <button
          key={m.id}
          type="button"
          className={[s.tile, messages.length === 3 && i === 0 && s.tileSpan].filter(Boolean).join(' ')}
          aria-label={t('timeline.openNth', { index: i + 1, count: messages.length })}
          onClick={() => onOpen(m.id)}
        >
          <Img media={m.media!} />
          {extra > 0 && i === 3 && <span className={s.moreTiles} aria-hidden="true">{`+${extra}`}</span>}
        </button>
      ))}
    </div>
  );
}

export function VideoPlayer({ media }: { media: Media }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const poster = useMediaUrl(media.thumbnailRef);
  const src = useMediaUrl(playing ? media.ref : undefined);
  const ratio = media.width && media.height ? media.width / media.height : 16 / 9;
  const width = Math.min(400, 300 * ratio);
  return (
    <div className={s.video} style={{ width, aspectRatio: String(ratio) }}>
      {playing ? (
        src && <video className={s.videoEl} src={src} controls autoPlay playsInline />
      ) : (
        <>
          {poster && <img className={s.videoPoster} src={poster} alt="" />}
          <span className={s.videoShade} />
          <button type="button" className={s.videoPlay} aria-label={t('timeline.playVideo')} onClick={() => setPlaying(true)}>
            <span className={s.playDisc}>
              <PlayIcon size={22} />
            </span>
          </button>
          {media.durationMs !== undefined && <span className={s.duration}>{formatDuration(media.durationMs)}</span>}
        </>
      )}
    </div>
  );
}

export function AudioPlayer({ media }: { media: Media }) {
  const { t } = useTranslation();
  const store = useStore();
  const audio = useRef<HTMLAudioElement>(null);
  const [wanted, setWanted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [duration, setDuration] = useState(media.durationMs ? media.durationMs / 1000 : 0);
  const src = useMediaUrl(wanted ? media.ref : undefined);

  useEffect(() => {
    if (src && audio.current && wanted) void audio.current.play().catch(() => setPlaying(false));
  }, [src, wanted]);

  const toggle = () => {
    const el = audio.current;
    if (!wanted) setWanted(true);
    else if (el?.paused) void el.play().catch(() => {});
    else el?.pause();
  };

  return (
    <div className={`${s.card} ${s.audio}`}>
      <button
        type="button"
        className={s.playButton}
        aria-label={playing ? t('timeline.pause') : t('timeline.play')}
        aria-pressed={playing}
        onClick={toggle}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className={s.audioMain}>
        <span className={s.fileName}>{media.name}</span>
        <span className={s.track}>
          <span className={s.bar}>
            <span className={s.barFill} style={{ width: `${duration ? (at / duration) * 100 : 0}%` }} />
          </span>
          <span className={s.time}>{formatDuration((playing || at ? at : duration) * 1000)}</span>
        </span>
      </span>
      <IconButton
        size={30}
        label={t('timeline.downloadName', { name: media.name })}
        icon={<DownloadIcon />}
        onClick={() => void downloadMedia(store, media)}
      />
      {src && (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setAt(0);
          }}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        />
      )}
    </div>
  );
}

const TILE: [RegExp, string][] = [
  [/^pdf$/, '#B42318'],
  [/^(docx?|odt|pages|rtf|txt|md)$/, '#1D4ED8'],
  [/^(xlsx?|csv|ods|numbers)$/, '#15803D'],
  [/^(pptx?|key|odp)$/, '#C2410C'],
  [/^(zip|rar|7z|gz|tgz|tar)$/, '#55535C'],
  [/^(mov|mp4|m4v|webm|mkv|avi)$/, '#0F766E'],
  [/^(m4a|mp3|wav|ogg|oga|flac|aac|opus)$/, '#7E22CE'],
];

export function tileOf(media: Media): { ext: string; color: string } {
  const dot = media.name.lastIndexOf('.');
  const ext = dot > 0 ? media.name.slice(dot + 1).toLowerCase() : (media.mimetype?.split('/')[1] ?? '');
  const color = TILE.find(([re]) => re.test(ext))?.[1] ?? '#475569';
  return { ext: ext.toUpperCase().slice(0, 4), color };
}

/** One card per message; consecutive files from one sender stack in one card. */
export function FileCard({ messages }: { messages: Message[] }) {
  const { t } = useTranslation();
  const store = useStore();
  return (
    <div className={s.card}>
      {messages.map((m) => {
        const media = m.media!;
        const tile = tileOf(media);
        return (
          <div key={m.id} className={s.file}>
            <span className={s.fileTile} style={{ '--tile': tile.color } as CSSProperties} aria-hidden="true">
              {tile.ext}
            </span>
            <span className={s.fileMain}>
              <span className={s.fileName}>{media.name}</span>
              {media.size !== undefined && <span className={s.fileSize}>{formatSize(media.size)}</span>}
            </span>
            <IconButton
              size={30}
              label={t('timeline.downloadName', { name: media.name })}
              icon={<DownloadIcon />}
              onClick={() => void downloadMedia(store, media)}
            />
          </div>
        );
      })}
    </div>
  );
}
