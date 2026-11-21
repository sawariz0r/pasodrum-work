import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore, type Message } from '../../matrix';
import { Skeleton } from '../../ui';
import { useListTime } from '../../app/pages/lists';
import { ImageViewer } from '../../app/timeline/ImageViewer';
import { downloadMedia, tileOf, useMediaUrl } from '../../app/timeline/Media';
import { useT } from './strings';
import s from './Files.module.css';

export function useFilesLabel() {
  return useT()('files');
}

export function PaperclipIcon({ size = 15, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L16 7" />
    </svg>
  );
}

/** Keep paging while the end of the list is this close (or the list doesn't fill the pane yet). */
const moreWithinPx = 600;
const skeletons: [string, string][] = [
  ['42%', '24%'], ['30%', '18%'], ['52%', '26%'], ['36%', '20%'], ['46%', '22%'], ['28%', '16%'], ['40%', '24%'],
];

/** `stalled`: the last page failed; `next` is kept and paging waits for a scroll to the end (or reopening the tab). */
type Pages = { items: Message[]; next?: string; started: boolean; stalled?: boolean };

function Thumb({ message }: { message: Message }) {
  const media = message.media!;
  const url = useMediaUrl(media.thumbnailRef ?? media.ref, true);
  return <span className={s.thumb}>{url && <img src={url} alt="" draggable={false} />}</span>;
}

/** FilesTab: newest first; images open the viewer, everything else downloads. Encrypted conversations are scanned on
 * this device, so pages can come back short or empty while more is on the way (FilesTabMore). */
export function FilesTab({ channelId }: { channelId: string }) {
  const t = useT();
  const store = useStore();
  const listTime = useListTime();
  const scroller = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [pages, setPages] = useState<Pages>({ items: [], started: false });
  const [viewing, setViewing] = useState<string | null>(null);

  const page = useCallback(
    (from?: string) => {
      if (busy.current) return;
      busy.current = true;
      store.files(channelId, from).then(
        (p) => {
          busy.current = false;
          setPages((prev) => {
            const seen = new Set(prev.items.map((m) => m.id));
            return { items: [...prev.items, ...p.items.filter((m) => !seen.has(m.id))], next: p.next, started: true };
          });
        },
        () => {
          busy.current = false;
          setPages((prev) => ({ ...prev, started: true, stalled: true }));
        },
      );
    },
    [store, channelId],
  );

  const more = useCallback(
    (auto: boolean) => {
      const el = scroller.current;
      if (!pages.started || !pages.next || !el || (auto && pages.stalled)) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < moreWithinPx) page(pages.next);
    },
    [pages, page],
  );

  useEffect(() => {
    page();
  }, [page]);
  useEffect(() => more(true), [more]);

  const loading = !pages.started || (pages.items.length === 0 && !!pages.next && !pages.stalled);
  const finished = pages.started && !pages.next;
  const images = pages.items.filter((m) => m.kind === 'image');
  const when = (ts: number) => (new Date(ts).toDateString() === new Date().toDateString() ? t('today') : listTime(ts));
  const open = (m: Message) => (m.kind === 'image' ? setViewing(m.id) : void downloadMedia(store, m.media!).catch(() => {}));

  return (
    <div ref={scroller} className={s.pane} aria-busy={loading || (!!pages.next && !pages.stalled)} onScroll={() => more(false)}>
      <ul className={s.list}>
        {pages.items.map((m) => {
          const media = m.media!;
          const tile = m.kind === 'image' ? null : tileOf(media);
          return (
            <li key={m.id}>
              <button type="button" className={s.row} onClick={() => open(m)}>
                <span className={s.icon}>
                  {tile ? (
                    <span className={s.tile} style={{ '--tile': tile.color } as CSSProperties} aria-hidden="true">
                      {tile.ext}
                    </span>
                  ) : (
                    <Thumb message={m} />
                  )}
                </span>
                <span className={s.main}>
                  <span className={s.name}>{media.name}</span>
                  <span className={s.meta}>{t('meta', { name: m.sender.name, when: when(m.ts) })}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {(loading || (pages.next && !pages.stalled)) &&
        skeletons.slice(0, loading ? 7 : 2).map(([w1, w2], i) => (
          <div key={i} className={s.skel} aria-hidden="true">
            <Skeleton width={40} height={40} radius={8} />
            <div className={s.skelLines}>
              <Skeleton width={w1} height={10} className={s.skelName} />
              <Skeleton width={w2} height={8} className={s.skelMeta} />
            </div>
          </div>
        ))}
      {finished && pages.items.length === 0 && (
        <div className={s.empty}>
          <div className={s.emptyIcon}>
            <PaperclipIcon size={30} strokeWidth={1.8} />
          </div>
          <h2 className={s.emptyTitle}>{t('noFiles')}</h2>
        </div>
      )}
      {viewing && <ImageViewer images={images} startId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
