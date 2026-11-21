// Role on the profile card (RoleChange, RoleChangeAdmin, MakeOwner; D-25).
// Owners pick Owner / Admin / Member; Admins pick Admin / Member. Nobody switches their own role or demotes an Owner.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type Person, type Role } from '../../matrix';
import { Button, Dialog } from '../../ui';
import { Face } from '../people/Face';
import { roleEvents } from '../people/ProfileCardContext';
import s from './Channels.module.css';
import { ArrowIcon, CheckIcon, ChevronIcon, PersonIcon } from './icons';
import { roleChoices } from './roles';

function useWorkspaceId() {
  return useWorkspace((x) => x.spaces.find((sp) => sp.kind === 'workspace')?.id);
}

export function RoleControl({ person, channelId, onMakeOwner }: { person: Person; channelId: string; onMakeOwner: (person: Person, from: Role) => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const workspaceId = useWorkspaceId();
  const mine = useWorkspace((x) => (workspaceId ? x.myRoles[workspaceId] : undefined));
  const self = useWorkspace((x) => x.me.id === person.id);
  const [theirs, setTheirs] = useState<Role>();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let live = true;
    store.channelMembers(channelId).then(
      (list) => live && setTheirs(list.find((m) => m.person.id === person.id)?.role),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, channelId, person.id]);

  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [menu]);

  if (!theirs || !workspaceId) return null;
  const choices = roleChoices(mine, theirs, self);
  const label = theirs === 'owner' || theirs === 'admin' || theirs === 'member' ? t(`channels.roles.${theirs}`) : null;

  if (!choices.length) {
    if (theirs !== 'owner' && theirs !== 'admin') return null;
    return (
      <span className={s.roleFact}>
        <PersonIcon />
        <span className={s.roleTag}>{label}</span>
      </span>
    );
  }

  const pick = (next: 'owner' | 'admin' | 'member') => {
    setMenu(false);
    if (next === theirs) return;
    if (next === 'owner') {
      onMakeOwner(person, theirs);
      return;
    }
    const prev = theirs;
    setTheirs(next);
    store.setRole(workspaceId, person.id, next).then(
      () => roleEvents.dispatchEvent(new Event('change')),
      () => setTheirs(prev),
    );
  };

  return (
    <span ref={box} className={s.roleFact}>
      <PersonIcon />
      <button
        type="button"
        className={s.roleButton}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={t('channels.roleOf', { name: person.name })}
        onClick={() => setMenu(!menu)}
      >
        {label}
        <ChevronIcon size={13} strokeWidth={2.4} />
      </button>
      {menu && (
        <span
          role="menu"
          data-claims-escape=""
          aria-label={t('channels.roleOf', { name: person.name })}
          className={s.roleMenu}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setMenu(false);
            }
          }}
        >
          {choices.map((r) => (
            <button key={r} type="button" role="menuitemradio" aria-checked={r === theirs} className={s.roleItem} autoFocus={r === theirs} onClick={() => pick(r)}>
              <span>{t(`channels.roles.${r}`)}</span>
              {r === theirs && <CheckIcon size={16} />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function MakeOwnerDialog({ open, person, from, onClose }: { open: boolean; person: Person; from: Role; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const workspaceId = useWorkspaceId();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      await store.setRole(workspaceId, person.id, 'owner');
      roleEvents.dispatchEvent(new Event('change'));
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      role="alertdialog"
      width={440}
      top={168}
      title={t('channels.makeOwnerTitle', { name: person.name })}
      closeLabel={t('people.close')}
      bodyClassName={s.confirmBody}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onClose}>
            {t('people.cancel')}
          </Button>
          <Button disabled={busy} onClick={() => void confirm()}>
            {t('channels.makeOwner')}
          </Button>
        </>
      }
    >
      <div className={s.personCard}>
        <Face person={person} size={36} />
        <span className={s.personCardName}>{person.name}</span>
        <span className={s.roleChange}>
          <span className={s.roleFrom}>{t(`channels.tags.${from}`)}</span>
          <span className={s.roleArrow}>
            <ArrowIcon />
          </span>
          <span className={s.roleTo}>{t('channels.tags.owner')}</span>
        </span>
      </div>
    </Dialog>
  );
}
