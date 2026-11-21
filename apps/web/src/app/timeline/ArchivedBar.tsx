// ArchivedSpace: an archived client space's channels are read-only for everyone; one quiet bar replaces the composer.
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type Space } from '../../matrix';
import { Button } from '../../ui';
import { ArchiveIcon } from '../channels/icons';
import { canManage } from '../channels/roles';
import s from './Timeline.module.css';

/** The archived client space a channel belongs to, if any: its channels are read-only for everyone (D-28). */
export function useArchivedSpace(channelId: string): Space | undefined {
  return useWorkspace((snap) => {
    for (const list of Object.values(snap.channels)) {
      const c = list.find((x) => x.id === channelId);
      if (c) return snap.spaces.find((sp) => sp.id === c.spaceId && sp.archived);
    }
    return undefined;
  });
}

export function ArchivedBar({ space }: { space: Space }) {
  const { t } = useTranslation();
  const store = useStore();
  const manage = useWorkspace((x) => canManage(x.myRoles[space.id]));
  return (
    <div className={s.archivedWrap}>
      <div role="status" className={s.archived}>
        <span className={s.archivedIcon}>
          <ArchiveIcon />
        </span>
        <span className={s.archivedText}>{t('spaces.archived', { name: space.name })}</span>
        {manage && (
          <Button variant="secondary" className={s.archivedUndo} onClick={() => void store.setArchived(space.id, false).catch(() => {})}>
            {t('spaces.unarchive')}
          </Button>
        )}
      </div>
    </div>
  );
}
