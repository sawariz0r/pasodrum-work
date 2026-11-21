import { useTranslation } from 'react-i18next';
import { useStore } from '../../matrix';
import { Dialog } from '../../ui';
import { AccountPair } from './AccountPair';
import { elementXDownload } from './elementX';
import { OpenOutIcon } from './icons';
import s from './Another.module.css';

/** Profile menu → Another app (AnotherApp, AnotherAppJP). */
export function AnotherAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const { server, username } = store.anotherApp();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('another.title')}
      closeLabel={t('another.close')}
      width={440}
      top={168}
      bodyClassName={s.sheetBody}
    >
      <AccountPair server={server} username={username} look="sheet" />
      <a className={s.get} href={elementXDownload} target="_blank" rel="noopener noreferrer">
        {t('another.getElementX')}
        <OpenOutIcon size={15} strokeWidth={2} className={s.getIcon} />
      </a>
    </Dialog>
  );
}
