import { createContext, useContext, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { IconButton } from '../../ui';
import { SidebarIcon } from '../icons';
import { BackIcon } from './icons';
import s from './Shell.module.css';

/** `back`: on DMs and Activity at ≤800px the list and the conversation take turns; this is the way back to the list. */
export type Drawer = { open: boolean; toggle: () => void; back?: string };
export const DrawerContext = createContext<Drawer>({ open: false, toggle: () => {} });

/** Opens the sidebar as a drawer below 1000px; on rail pages at ≤800px it is a back arrow to the list. */
export function DrawerToggle() {
  const { t } = useTranslation();
  const { open, toggle, back } = useContext(DrawerContext);
  return (
    <>
      <IconButton className={s.drawerToggle} label={t('shell.sidebar.toggle')} icon={<SidebarIcon />} aria-expanded={open} onClick={toggle} />
      {back && (
        <Link to={back} className={s.back} aria-label={t('shell.back')}>
          <BackIcon />
        </Link>
      )}
    </>
  );
}

const narrowQuery = '(max-width: 800px)';

function subscribe(onChange: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia(narrowQuery);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** ≤800px (Window800): rail pages show either their list or the open item. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => typeof matchMedia === 'function' && matchMedia(narrowQuery).matches);
}
