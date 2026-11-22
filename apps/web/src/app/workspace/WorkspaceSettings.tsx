// Workspace settings → People and Access (D-36; PeopleWorkspace, PeopleAccess*, RemoveExternalSignOut, RemoveStaff). Owners and Admins, from the workspace menu.
import * as RD from '@radix-ui/react-dialog';
import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type ExternalAccess, type Member, type Person, type Role } from '../../matrix';
import { IconButton, useMenuReturnFocus } from '../../ui';
import { LogoMark } from '../icons';
import { UsersIcon, XIcon } from '../channels/icons';
import { MakeOwnerDialog } from '../channels/RoleControl';
import { canManage } from '../channels/roles';
import { KeyIcon } from '../security/icons';
import { AccessPane } from './AccessPane';
import { PeoplePane } from './PeoplePane';
import { RemovePersonDialog } from './RemovePerson';
import s from './Workspace.module.css';

export type WorkspaceTab = 'people' | 'access';

type Props = { open: boolean; tab?: WorkspaceTab; onClose: () => void; onAddPeople: (spaceId: string) => void };

type Confirm = { kind: 'remove'; member: Member } | { kind: 'owner'; person: Person; from: Role };

export function WorkspaceSettingsDialog({ open, tab: initialTab = 'people', onClose, onAddPeople }: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const workspace = useWorkspace((x) => x.spaces.find((sp) => sp.kind === 'workspace'));
  const mine = useWorkspace((x) => (workspace ? x.myRoles[workspace.id] : undefined));
  const roleCount = useWorkspace((x) => x.accessRoles.length);
  const titleId = useId();
  const returnFocus = useMenuReturnFocus(open);
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [people, setPeople] = useState<Member[]>([]);
  const [access, setAccess] = useState<ExternalAccess[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const manage = canManage(mine);

  const reload = useCallback(() => {
    store.workspacePeople().then(setPeople, () => {});
    store.externalAccess().then(setAccess, () => {});
  }, [store]);

  useEffect(() => {
    if (manage) reload();
  }, [manage, reload]);

  // Owners and Admins only; Staff read role names elsewhere.
  if (!workspace || !manage) return null;
  const tabs: [WorkspaceTab, string, number][] = [
    ['people', t('workspaceSettings.tabs.people'), people.length],
    ['access', t('workspaceSettings.tabs.access'), roleCount],
  ];

  return (
    <>
      <RD.Root open={open && !confirm} onOpenChange={(o) => !o && onClose()}>
        <RD.Portal>
          <RD.Overlay className={s.overlay}>
            <RD.Content className={[s.dialog, tab === 'access' && s.tall].filter(Boolean).join(' ')} aria-describedby={undefined} aria-labelledby={titleId} onCloseAutoFocus={returnFocus}>
              <nav className={s.nav} aria-label={t('workspaceSettings.title')}>
                <RD.Title className={s.navTitle}>
                  <span className={s.logo} aria-hidden="true">
                    <LogoMark size={16} />
                  </span>
                  <span className={s.navTitleName}>{workspace.name}</span>
                </RD.Title>
                {tabs.map(([id, label, count]) => (
                  <button key={id} type="button" className={s.tab} aria-current={id === tab ? 'page' : undefined} onClick={() => setTab(id)}>
                    {id === 'people' ? <UsersIcon size={16} strokeWidth={1.9} /> : <KeyIcon size={16} strokeWidth={1.9} />}
                    <span className={s.tabLabel}>{label}</span>
                    <span className={s.tabCount}>{count}</span>
                  </button>
                ))}
              </nav>
              <section className={s.main} aria-labelledby={titleId}>
                <div className={s.header}>
                  <h2 id={titleId} className={s.title}>
                    {t(`workspaceSettings.tabs.${tab}`)}
                  </h2>
                  <RD.Close asChild>
                    <IconButton label={t('people.close')} icon={<XIcon size={18} strokeWidth={2} />} className={s.close} />
                  </RD.Close>
                </div>
                <div className={s.body}>
                  {tab === 'people' ? (
                    <PeoplePane
                      key="people"
                      workspaceId={workspace.id}
                      people={people}
                      onPeople={setPeople}
                      onChanged={reload}
                      onAddPeople={() => onAddPeople(workspace.id)}
                      onRemove={(member) => setConfirm({ kind: 'remove', member })}
                      onMakeOwner={(person, from) => setConfirm({ kind: 'owner', person, from })}
                      onLeave={onClose}
                    />
                  ) : (
                    <AccessPane key="access" workspaceId={workspace.id} people={people} access={access} onChanged={reload} />
                  )}
                </div>
              </section>
            </RD.Content>
          </RD.Overlay>
        </RD.Portal>
      </RD.Root>
      {confirm?.kind === 'remove' && (
        <RemovePersonDialog
          open={open}
          workspace={workspace}
          member={confirm.member}
          access={access.find((a) => a.person.id === confirm.member.person.id)}
          onCancel={() => setConfirm(null)}
          onRemoved={() => {
            setPeople((list) => list.filter((m) => m.person.id !== confirm.member.person.id));
            setConfirm(null);
            reload();
          }}
        />
      )}
      {confirm?.kind === 'owner' && (
        <MakeOwnerDialog
          open={open}
          person={confirm.person}
          from={confirm.from}
          onClose={() => {
            setConfirm(null);
            reload();
          }}
        />
      )}
    </>
  );
}
