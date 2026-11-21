// Remove an External from the workspace (PeopleRemoveExternal): lists every channel and client space they lose.
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type ExternalAccess, type Member, type Space } from '../../matrix';
import { Button, Dialog } from '../../ui';
import { HashIcon, LockIcon } from '../icons';
import { LeaveIcon, PendingIcon } from '../channels/icons';
import { spaceColour } from '../channels/shared';
import { ExternalCorner, Face } from '../people/Face';
import s from './Workspace.module.css';

type Props = { open: boolean; workspace: Space; member: Member; access?: ExternalAccess; onCancel: () => void; onRemoved: () => void };

export function RemoveExternalDialog({ open, workspace, member, access, onCancel, onRemoved }: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const { person } = member;
  const name = member.pending && member.email ? member.email : person.name;
  const spaces = useWorkspace((x) => x.spaces);
  const joined = useWorkspace((x) => x.channels[workspace.id]);
  const [email, setEmail] = useState(member.pending ? undefined : access?.email);
  const [named, setNamed] = useState<{ id: string; name: string; private: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    if (!member.pending) {
      store.profile(person.id).then(
        (p) => live && p.email && setEmail(p.email),
        () => {},
      );
    }
    // Channels I'm not in still have a name in Browse; private ones I'm not in stay unnamed and are left out.
    store.browseChannels(workspace.id).then(
      (list) => live && setNamed(list),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, person.id, member.pending, workspace.id]);

  const channelOf = (id: string) => joined?.find((c) => c.id === id) ?? named.find((c) => c.id === id);
  const channels = (access?.rooms.channels ?? []).flatMap((id) => channelOf(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const lost = (access?.rooms.spaces ?? []).flatMap((id) => spaces.find((sp) => sp.id === id) ?? []).sort((a, b) => a.name.localeCompare(b.name));

  const remove = () => {
    setBusy(true);
    setFailed(false);
    store.removeExternal(person.id).then(onRemoved, () => {
      setBusy(false);
      setFailed(true);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      role="alertdialog"
      width={480}
      top={168}
      title={t('workspaceSettings.removeTitle', { name, workspace: workspace.name })}
      closeLabel={t('people.close')}
      alert={failed ? t('workspaceSettings.failed.remove', { name }) : undefined}
      bodyClassName={s.confirmBody}
      busy={busy}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onCancel}>
            {t('people.cancel')}
          </Button>
          <Button variant="danger" disabled={busy} onClick={remove}>
            {t('workspaceSettings.removeButton')}
          </Button>
        </>
      }
    >
      <div className={s.card}>
        <div className={s.cardRow}>
          {member.pending ? (
            <span className={s.pendingFace}>
              <PendingIcon size={15} strokeWidth={2} />
              <ExternalCorner className={`${s.corner} ${s.cardCorner}`} />
            </span>
          ) : (
            <span className={s.faceBox}>
              <Face person={person} size={36} />
              <ExternalCorner className={`${s.corner} ${s.cardCorner}`} />
            </span>
          )}
          <span className={s.cardText}>
            <span className={s.cardName}>{name}</span>
            {email && email !== name && <span className={s.cardSub}>{email}</span>}
          </span>
        </div>
        {(channels.length > 0 || lost.length > 0) && (
          <div className={s.loses} role="list" aria-label={t('workspaceSettings.loses')}>
            <span className={s.losesIcon} aria-hidden="true">
              <LeaveIcon size={15} strokeWidth={2} />
            </span>
            {channels.map((c) => (
              <span key={c.id} role="listitem" className={s.lose}>
                {c.private ? <LockIcon size={13} strokeWidth={2.2} /> : <HashIcon size={13} strokeWidth={2.2} />}
                {c.name}
              </span>
            ))}
            {lost.map((sp) => (
              <span key={sp.id} role="listitem" className={`${s.lose} ${s.loseSpace}`}>
                <span className={`${s.tile} ${s.loseTile}`} style={{ '--tile': spaceColour(sp) } as CSSProperties} aria-hidden="true">
                  {(Array.from(sp.name.trim())[0] ?? '').toUpperCase()}
                </span>
                {sp.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
