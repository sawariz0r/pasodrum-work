import type { ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { useDocsBoards, useWorkspace, type DocsBoardsSnapshot, type Message, type PageNode } from '../../matrix';
import { useT } from './strings';
import s from './DocCard.module.css';

/** DB-05: a card under a message for its first link to one of our pages. The body keeps the plain link (D-05). */
export function DocCard({ message }: { message: Message }) {
  const pageId = firstPageId(message);
  return pageId ? <Card key={pageId} pageId={pageId} /> : null;
}

function Card({ pageId }: { pageId: string }) {
  const t = useT();
  const page = useDocsBoards((d) => findPage(d.pages, pageId));
  const parent = useDocsBoards((d) => (page?.parent ? findPage(d.pages, page.parent) : undefined));
  const space = useWorkspace((w) => w.spaces.find((x) => x.id === page?.spaceId)?.name);
  // Another space's page, or a deleted one: the plain link stays on its own.
  if (!page) return null;
  return (
    <CardLink to={`/docs/${encodeURIComponent(pageId)}`}>
      <span className={s.icon}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
          <path d="M14 3v6h6M8 13h8M8 17h5" />
        </svg>
      </span>
      <span className={s.text}>
        <span className={s.title}>{page.title || t('cardUntitled')}</span>
        {(space || parent) && (
          <span className={s.path}>
            {space && <span>{space}</span>}
            {parent && <span>{parent.title || t('cardUntitled')}</span>}
          </span>
        )}
      </span>
    </CardLink>
  );
}

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return useInRouterContext() ? (
    <Link className={s.card} to={to}>
      {children}
    </Link>
  ) : (
    <a className={s.card} href={to}>
      {children}
    </a>
  );
}

function findPage(pages: DocsBoardsSnapshot['pages'], id: string): PageNode | undefined {
  const walk = (nodes: PageNode[]): PageNode | undefined => {
    for (const n of nodes) {
      const hit = n.id === id ? n : walk(n.children);
      if (hit) return hit;
    }
  };
  for (const space of Object.values(pages)) {
    const hit = walk(space.roots);
    if (hit) return hit;
  }
}

/** `${origin}/docs/<pageRoomId>`. Encrypted conversations carry no `links` (D-33), so read the body there. */
function firstPageId(message: Message): string | undefined {
  const urls = message.links ?? message.body.match(/https?:\/\/[\x21-\x7E]+/g) ?? [];
  for (const raw of urls) {
    try {
      const url = new URL(raw.replace(/[.,;:!?)\]]+$/, ''));
      const m = url.origin === location.origin && /^\/docs\/([^/]+)\/?$/.exec(url.pathname);
      if (m) return decodeURIComponent(m[1]!);
    } catch {
      // not a URL
    }
  }
}
