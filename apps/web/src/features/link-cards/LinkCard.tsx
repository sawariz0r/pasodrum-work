import { useEffect, useState } from 'react';
import { useStore, type LinkPreview, type Message } from '../../matrix';
import { Skeleton } from '../../ui';
import { useMediaUrl } from '../../app/timeline/Media';
import s from './LinkCard.module.css';

/** LinkCard: the first link only, at one fixed height. Loading keeps that height; no preview leaves the plain link. */
export function LinkCard({ message }: { message: Message }) {
  const url = message.links?.find((l) => new URL(l).origin !== location.origin);
  return url ? <Card key={url} url={url} /> : null;
}

function Card({ url }: { url: string }) {
  const store = useStore();
  const [preview, setPreview] = useState<LinkPreview | null>();
  useEffect(() => {
    let live = true;
    store.linkPreview(url).then(
      (p) => live && setPreview(p),
      () => live && setPreview(null),
    );
    return () => {
      live = false;
    };
  }, [store, url]);

  if (preview === undefined) {
    return (
      <div className={s.card} aria-hidden="true">
        <Skeleton width={112} height="100%" radius={8} />
        <span className={s.text}>
          <Skeleton width="30%" height={9} />
          <Skeleton width="76%" height={11} />
          <Skeleton width="58%" height={9} />
        </span>
      </div>
    );
  }
  if (!preview || !(preview.title || preview.description)) return null;
  // The page's own words are untrusted: React renders them as text, and the link is the one from the message.
  return (
    <a className={`${s.card} ${s.shown}`} href={url} target="_blank" rel="noopener noreferrer">
      {preview.image && <Picture image={preview.image} />}
      <span className={`${s.text} ${s.words}`}>
        <span className={s.site}>{preview.site ?? hostOf(url)}</span>
        {preview.title && <span className={s.title}>{preview.title}</span>}
        {preview.description && <span className={s.description}>{preview.description}</span>}
      </span>
    </a>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function Picture({ image }: { image: string }) {
  const src = useMediaUrl(image, true);
  return <span className={s.picture}>{src && <img src={src} alt="" draggable={false} />}</span>;
}
