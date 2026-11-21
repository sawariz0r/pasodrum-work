// ArchivedSpace, ArchivedChannel: an archived client space's channels, or an archived channel, are read-only for everyone;
// one quiet bar replaces the composer.
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type Channel, type Space } from '../../matrix';
import { Button } from '../../ui';
import { ArchiveIcon } from '../channels/icons';
import { canManage } from '../channels/roles';
import s from './Timeline.module.css';

export type Archived = { space: Space } | { channel: Channel };

/** The archived client space a channel belongs to, else the channel itself when archived (D-28, E2). */
export function useArchived(channelId: string): Archived | undefined {
  const space = useWorkspace((snap) => {
    for (const list of Object.values(snap.channels)) {
      const c = list.find((x) => x.id === channelId);
      if (c) return snap.spaces.find((sp) => sp.id === c.spaceId && sp.archived);
    }
    return undefined;
  });
  const channel = useWorkspace((snap) => {
    for (const list of Object.values(snap.channels)) {
      const c = list.find((x) => x.id === channelId);
      if (c) return c.archived ? c : undefined;
    }
    return undefined;
  });
  return space ? { space } : channel ? { channel } : undefined;
}

export function ArchivedBar({ archived }: { archived: Archived }) {
  const { t } = useTranslation();
  const store = useStore();
  const spaceId = 'space' in archived ? archived.space.id : archived.channel.spaceId;
  const manageSpace = useWorkspace((x) => canManage(x.myRoles[spaceId]));
  const manage = 'space' in archived ? manageSpace : !!archived.channel.manageable;
  const undo = () => ('space' in archived ? store.setArchived(archived.space.id, false) : store.setChannelArchived(archived.channel.id, false));
  return (
    <div className={s.archivedWrap}>
      <div role="status" className={s.archived}>
        <span className={s.archivedIcon}>
          <ArchiveIcon />
        </span>
        <span className={s.archivedText}>
          {'space' in archived ? t('spaces.archived', { name: archived.space.name }) : t('channels.archived', { name: archived.channel.name })}
        </span>
        {manage && (
          <Button variant="secondary" className={s.archivedUndo} onClick={() => void undo().catch(() => {})}>
            {t('spaces.unarchive')}
          </Button>
        )}
      </div>
    </div>
  );
}
