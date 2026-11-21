// Workspace settings → People (PeopleWorkspace): everyone but clients, All / Staff / External, an External's roles beside the name.
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type AccessRole, type Member, type Person, type Role } from '../../matrix';
import { Button, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui';
import { HashIcon, LockIcon, MoreIcon, SearchIcon } from '../icons';
import { CheckIcon, LeaveIcon, PendingIcon, UserPlusIcon } from '../channels/icons';
import { roleChoices } from '../channels/roles';
import { ExternalCorner, Face } from '../people/Face';
import { roleEvents } from '../people/ProfileCardContext';
import { dmPath } from '../places';
import { BubbleIcon } from '../shell/icons';
import { firstName, useToast } from '../toast';
import s from './Workspace.module.css';

type Filter = 'all' | 'staff' | 'external';

type Props = {
  workspaceId: string;
  people: Member[];
  onPeople: (next: Member[]) => void;
  onChanged: () => void;
  onAddPeople: () => void;
  onRemove: (m: Member) => void;
  onMakeOwner: (person: Person, from: Role) => void;
  onLeave: () => void;
};

const fold = (text: string) => text.normalize('NFKC').toLowerCase();

export function PeoplePane({ workspaceId, people, onPeople, onChanged, onAddPeople, onRemove, onMakeOwner, onLeave }: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const meId = useWorkspace((x) => x.me.id);
  const mine = useWorkspace((x) => x.myRoles[workspaceId]);
  const accessRoles = useWorkspace((x) => x.accessRoles);
  const channels = useWorkspace((x) => x.channels[workspaceId]);
  const externals = useWorkspace((x) => x.externals);
  const workspace = useWorkspace((x) => x.spaces.find((sp) => sp.id === workspaceId)?.name ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const isExternal = (m: Member) => m.role === 'external';
  const counts: Record<Filter, number> = {
    all: people.length,
    staff: people.filter((m) => !isExternal(m)).length,
    external: people.filter(isExternal).length,
  };
  const q = fold(query.trim());
  const shown = people.filter(
    (m) => (filter === 'all' || (filter === 'external') === isExternal(m)) && (!q || fold(m.person.name).includes(q) || (m.email && fold(m.email).includes(q))),
  );

  const message = async (person: Person) => {
    try {
      const id = await store.openDm([person.id]);
      onLeave();
      navigate(dmPath(id));
    } catch {
      toast(t('failed.message', { name: firstName(person.name) }));
    }
  };

  // Ticking a role saves at once; membership follows (D-36).
  const toggleRole = (m: Member, roleId: string) => {
    const before = m.roles ?? [];
    const next = before.includes(roleId) ? before.filter((r) => r !== roleId) : [...before, roleId];
    const patch = (roles: string[]) => people.map((p) => (p.person.id === m.person.id ? { ...p, roles } : p));
    onPeople(patch(next));
    store.setExternalRoles(m.person.id, next).then(
      (change) => {
        if (change.failed.length) toast(t('workspaceSettings.failed.access', { name: firstName(m.person.name) }));
        onChanged();
      },
      () => {
        onPeople(patch(before));
        toast(t('workspaceSettings.failed.access', { name: firstName(m.person.name) }));
      },
    );
  };

  const setRole = (m: Member, next: 'owner' | 'admin' | 'staff') => {
    if (next === m.role) return;
    if (next === 'owner') {
      onMakeOwner(m.person, m.role);
      return;
    }
    const swap = (role: Role) => people.map((p) => (p.person.id === m.person.id ? { ...p, role } : p));
    onPeople(swap(next));
    store.setRole(workspaceId, m.person.id, next).then(
      () => roleEvents.dispatchEvent(new Event('change')),
      () => {
        onPeople(swap(m.role));
        toast(t('failed.role', { name: firstName(m.person.name) }));
      },
    );
  };

  const channelOf = (id: string) => channels?.find((c) => c.id === id);

  const row = (m: Member) => {
    const { person } = m;
    const me = person.id === meId;
    const external = isExternal(m);
    const name = m.pending && m.email ? m.email : person.name;
    const tag = m.pending ? 'pending' : external ? 'external' : m.role === 'owner' || m.role === 'admin' ? m.role : null;
    const held = external ? accessRoles.filter((r) => m.roles?.includes(r.id)) : [];
    const oneOffs = external ? (externals[person.id]?.channels ?? []).flatMap((id) => channelOf(id) ?? []) : [];
    const choices = external ? [] : roleChoices(mine, m.role, me);
    const label = t('channels.more', { name });
    return (
      <li key={person.id} className={s.row}>
        {m.pending ? (
          <span className={s.pendingFace}>
            <PendingIcon size={15} strokeWidth={2} />
            {external && <ExternalCorner className={s.corner} />}
          </span>
        ) : (
          <span className={s.faceBox}>
            <Face person={person} size={32} />
            {external && <ExternalCorner className={s.corner} />}
          </span>
        )}
        <span className={s.who}>
          <span className={s.name}>{name}</span>
          {me && <span className={s.you}>{t('workspaceSettings.you')}</span>}
          {held.map((r) => (
            <RoleChip key={r.id} role={r} />
          ))}
          {oneOffs.map((c) => (
            <span key={c.id} className={`${s.chip} ${s.chipChannel}`}>
              {c.private ? <LockIcon size={11} strokeWidth={2.4} /> : <HashIcon size={11} strokeWidth={2.4} />}
              {c.name}
            </span>
          ))}
        </span>
        {tag && <span className={[s.tag, tag === 'external' && s.tagExternal].filter(Boolean).join(' ')}>{t(`workspaceSettings.tags.${tag}`)}</span>}
        <span className={s.moreCell}>
          {!me && (
            <Menu>
              <MenuTrigger asChild>
                <IconButton size={30} label={label} icon={<MoreIcon />} />
              </MenuTrigger>
              <MenuContent align="end" width={268} aria-label={label} className={s.menu}>
                {external && accessRoles.length > 0 && (
                  <>
                    <div className={s.menuHead}>{t('workspaceSettings.roles')}</div>
                    {accessRoles.map((r) => {
                      const on = !!m.roles?.includes(r.id);
                      return (
                        <MenuItem
                          key={r.id}
                          role="menuitemcheckbox"
                          aria-checked={on}
                          onSelect={(e) => {
                            e.preventDefault();
                            toggleRole(m, r.id);
                          }}
                        >
                          <span className={s.check}>{on && <CheckIcon size={15} strokeWidth={2.6} />}</span>
                          <span className={s.menuDot} style={{ '--dot': r.colour } as CSSProperties} aria-hidden="true" />
                          {r.name}
                        </MenuItem>
                      );
                    })}
                    <MenuSeparator />
                  </>
                )}
                {choices.length > 0 && (
                  <>
                    {choices.map((r) => (
                      <MenuItem key={r} role="menuitemradio" aria-checked={r === m.role} onSelect={() => setRole(m, r)}>
                        <span className={s.check}>{r === m.role && <CheckIcon size={15} strokeWidth={2.6} />}</span>
                        {t(`channels.roles.${r}`)}
                      </MenuItem>
                    ))}
                    <MenuSeparator />
                  </>
                )}
                {!m.pending && (
                  <MenuItem icon={<BubbleIcon size={16} strokeWidth={1.9} />} onSelect={() => void message(person)}>
                    {t('people.message')}
                  </MenuItem>
                )}
                {external && (
                  <MenuItem icon={<LeaveIcon size={16} strokeWidth={2} />} className={s.danger} onSelect={() => onRemove(m)}>
                    {t('workspaceSettings.removeFrom', { workspace })}
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className={s.pane}>
      <div className={s.toolbar}>
        <label className={s.search}>
          <SearchIcon size={16} strokeWidth={2} />
          <input
            className={s.searchInput}
            type="search"
            autoComplete="off"
            placeholder={t('workspaceSettings.search')}
            aria-label={t('workspaceSettings.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button className={s.addButton} icon={<UserPlusIcon size={16} strokeWidth={2} />} onClick={onAddPeople}>
          {t('common.addPeople')}
        </Button>
      </div>
      <div role="group" aria-label={t('workspaceSettings.filters.label')} className={s.filters}>
        {(['all', 'staff', 'external'] as const).map((f) => (
          <button key={f} type="button" className={s.filter} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`workspaceSettings.filters.${f}`)}
            <span className={s.filterCount}>{counts[f]}</span>
          </button>
        ))}
      </div>
      <ul role="list" className={s.list}>
        {shown.map(row)}
      </ul>
    </div>
  );
}

export function RoleChip({ role }: { role: AccessRole }) {
  return (
    <span className={s.chip}>
      <span className={s.dot} style={{ '--dot': role.colour } as CSSProperties} aria-hidden="true" />
      {role.name}
    </span>
  );
}
