// Archived client spaces (DES-05 TidyArchivedList): off the rail, listed from the Pasodrum menu. Unarchive here; Owners also get the bin.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type Space } from '../../matrix';
import { Dialog, IconButton } from '../../ui';
import { TrashIcon } from '../icons';
import { useToast } from '../toast';
import s from './Channels.module.css';
import { UsersIcon } from './icons';
import { SpaceTile } from './SpaceSettings';

type Props = { open: boolean; onClose: () => void; onDelete: (spaceId: string) => void };

export function ArchivedSpacesDialog({ open, onClose, onDelete }: Props) {
  const { t } = useTranslation();
  const spaces = useWorkspace((x) => x.spaces);
  const owner = useWorkspace((x) => x.myRoles[x.spaces.find((sp) => sp.kind === 'workspace')?.id ?? ''] === 'owner');
  const archived = spaces.filter((sp) => sp.kind === 'client' && sp.archived);
  const empty = archived.length === 0;
  useEffect(() => {
    if (empty && open) onClose();
  }, [empty, open, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('spaces.archivedSpaces')}
      closeLabel={t('people.close')}
      width={480}
      top={168}
      bodyClassName={s.aslBody}
    >
      <div role="list">
        {archived.map((space) => (
          <Row key={space.id} space={space} onClose={onClose} onDelete={owner ? () => onDelete(space.id) : undefined} />
        ))}
      </div>
    </Dialog>
  );
}

function Row({ space, onClose, onDelete }: { space: Space; onClose: () => void; onDelete?: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [count, setCount] = useState<number>();
  useEffect(() => {
    let live = true;
    store.spaceMembers(space.id).then(
      (list) => live && setCount(list.filter((m) => !m.pending).length),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, space.id]);

  const view = () => {
    onClose();
    navigate(`/w/${encodeURIComponent(space.id)}`);
  };

  return (
    <div role="listitem" className={`${s.browseRow} ${s.aslRow}`} onClick={view}>
      <SpaceTile space={space} size="card" className={s.aslTile} />
      <button
        type="button"
        className={s.aslName}
        onClick={(e) => {
          e.stopPropagation();
          view();
        }}
      >
        {space.name}
      </button>
      {count !== undefined && (
        <span role="img" className={s.aslCount} aria-label={t('spaces.peopleCount', { count })}>
          <UsersIcon size={14} strokeWidth={2} />
          {count}
        </span>
      )}
      <button
        type="button"
        className={s.joinButton}
        onClick={(e) => {
          e.stopPropagation();
          void store.setArchived(space.id, false).catch(() => toast(t('failed.unarchiveSpace', { name: space.name })));
        }}
      >
        {t('spaces.unarchive')}
      </button>
      {onDelete && (
        <IconButton
          size={30}
          className={s.aslBin}
          label={t('spaces.deleteRow', { name: space.name })}
          icon={<TrashIcon />}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      )}
    </div>
  );
}
