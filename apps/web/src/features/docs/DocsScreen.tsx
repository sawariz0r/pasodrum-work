// /docs and /docs/:pageId (DocsPage, DocsNone, DocsLoading). /docs opens the selected space's first page.
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { rememberSpace } from '../../app/prefs';
import { DrawerToggle } from '../../app/shell/Drawer';
import { NotAvailable } from '../../app/shell/NotAvailable';
import { useDocsBoards, useWorkspace } from '../../matrix';
import { Button, EmptyState } from '../../ui';
import { pagePath, useCreatePage } from './actions';
import { BigPageIcon, PlusBold } from './icons';
import { locate, useScope } from './model';
import { PageSkeleton } from './PageSkeleton';
import { PageView } from './PageView';
import { useT } from './strings';
import s from './Docs.module.css';

export function DocsScreen() {
  const { pageId } = useParams();
  const { selected } = useScope();
  const spaces = useWorkspace((x) => x.spaces);
  const pages = useDocsBoards((x) => x.pages);
  const located = useMemo(() => (pageId ? locate(pages, pageId) : undefined), [pages, pageId]);
  // A page that goes away while open (deleted, here or elsewhere) hands over to the space's first page.
  const [seen, setSeen] = useState<string>();
  if (located && pageId !== seen) setSeen(pageId);
  // A page opened from another space (Activity, a chat link) lights that space's tile. Keyed on the page's space
  // alone, so a tile click away from the open page isn't undone before the route changes.
  const pageSpace = located?.node.spaceId;
  useEffect(() => {
    if (pageSpace) rememberSpace(pageSpace);
  }, [pageSpace]);

  if (!pageId) {
    const mine = selected && pages[selected.id];
    if (!selected || !mine) return <PageSkeleton />;
    const first = mine.roots[0];
    if (first) return (
      <>
        <Navigate to={pagePath(first.id)} replace />
        <PageSkeleton />
      </>
    );
    return <NoPages spaceId={selected.id} canCreate={mine.canCreate} />;
  }
  if (!located && pageId === seen) return (
    <>
      <Navigate to="/docs" replace />
      <PageSkeleton />
    </>
  );
  if (!located) return spaces.every((sp) => pages[sp.id]) ? <NotAvailable /> : <PageSkeleton />;
  return <PageView key={pageId} located={located} />;
}

function NoPages({ spaceId, canCreate }: { spaceId: string; canCreate: boolean }) {
  const t = useT();
  const create = useCreatePage();
  return (
    <EmptyState
      icon={<BigPageIcon />}
      title={t('noPages')}
      action={canCreate && <Button icon={<PlusBold />} onClick={() => create({ spaceId })}>{t('newPage')}</Button>}
    >
      <div className={s.floatingToggle}>
        <DrawerToggle />
      </div>
    </EmptyState>
  );
}
