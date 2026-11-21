// Workspace settings → Access (PeopleAccess, PeopleAccessNew, PeopleAccessNotApplied): access roles for Externals.
// Changes save as you make them; membership follows in this app (D-36). Channels: only ones I'm in (I can only grant what I'm in).
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type AccessChange, type AccessRole, type ExternalAccess, type Member } from '../../matrix';
import { isImeEnter, Menu, MenuContent, MenuItem, MenuTrigger } from '../../ui';
import { HashIcon, LockIcon, TrashIcon } from '../icons';
import { AlertIcon, CheckIcon, PendingIcon, PlusIcon, XIcon } from '../channels/icons';
import { spaceColour } from '../channels/shared';
import { ExternalCorner, Face } from '../people/Face';
import { HistoryIcon } from '../security/icons';
import s from './Workspace.module.css';

/** Access role colours, in swatch order (PeopleAccess). */
const colours = [
  ['teal', '#0F766E'],
  ['amber', '#B45309'],
  ['blue', '#1D4ED8'],
  ['purple', '#7E22CE'],
  ['pink', '#BE185D'],
  ['slate', '#475569'],
] as const;

type Draft = Omit<AccessRole, 'id'> & { id?: string; people: string[] };

type Props = { workspaceId: string; people: Member[]; access: ExternalAccess[]; onChanged: () => void };

export function AccessPane({ workspaceId, people, access, onChanged }: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const roles = useWorkspace((x) => x.accessRoles);
  const externals = useWorkspace((x) => x.externals);
  const [selected, setSelected] = useState<string | undefined>(() => roles[0]?.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  // What I last sent per role, shown until the next change (last save wins).
  const [local, setLocal] = useState<Record<string, AccessRole>>({});
  const [error, setError] = useState<string | null>(null);
  const creating = useRef(false);

  const current: Draft | undefined = draft ?? (() => {
    const r = roles.find((x) => x.id === selected) ?? roles[0];
    return r ? { ...(local[r.id] ?? r), people: [] } : undefined;
  })();
  const count = (id: string) => Object.values(externals).filter((e) => e.roles.includes(id)).length;
  const rolesOf = (userId: string) => externals[userId]?.roles ?? access.find((a) => a.person.id === userId)?.roles ?? [];
  const nameOf = (userId: string) => {
    const m = people.find((p) => p.person.id === userId);
    return m?.pending && m.email ? m.email : (m?.person.name ?? userId);
  };

  const report = (change: AccessChange) => {
    const who = [...new Set(change.failed.map((f) => f.userId))];
    if (who.length) setError(t('workspaceSettings.failed.people', { names: who.map(nameOf).join(t('people.nameSeparator')) }));
    onChanged();
  };

  const startNew = () => {
    setError(null);
    const used = new Set(roles.map((r) => r.colour.toLowerCase()));
    const colour = (colours.find(([, hex]) => !used.has(hex.toLowerCase())) ?? colours[0])[1];
    setDraft({ name: '', colour, channels: [], spaces: [], people: [] });
  };

  const select = (id: string) => {
    setError(null);
    setDraft(null);
    setSelected(id);
  };

  /** A new role is created once it has a name; until then edits stay here. */
  const create = (next: Draft) => {
    if (creating.current) return;
    creating.current = true;
    const { people: holders, ...role } = next;
    store.saveAccessRole(role).then(
      async (change) => {
        creating.current = false;
        setDraft(null);
        setSelected(change.id);
        const failed = [...change.failed];
        for (const userId of holders) {
          await store.setExternalRoles(userId, [...rolesOf(userId), change.id]).then(
            (c) => failed.push(...c.failed),
            () => failed.push({ userId, roomId: '' }),
          );
        }
        report({ failed });
      },
      () => {
        creating.current = false;
        setError(t('workspaceSettings.failed.save', { name: next.name }));
      },
    );
  };

  const change = (patch: Partial<Draft>) => {
    if (!current) return;
    setError(null);
    const next = { ...current, ...patch };
    if (!next.id) {
      setDraft(next);
      if (patch.name !== undefined && next.name) create(next);
      return;
    }
    const role: AccessRole = { id: next.id, name: next.name, colour: next.colour, channels: next.channels, spaces: next.spaces };
    const saved = roles.find((r) => r.id === role.id);
    setLocal((l) => ({ ...l, [role.id]: role }));
    store.saveAccessRole(role).then(report, () => {
      setLocal((l) => {
        const rest = { ...l };
        delete rest[role.id];
        return rest;
      });
      setError(t('workspaceSettings.failed.save', { name: saved?.name ?? role.name }));
    });
  };

  const remove = () => {
    if (!current) return;
    setError(null);
    if (!current.id) {
      setDraft(null);
      return;
    }
    const id = current.id;
    store.deleteAccessRole(id).then(
      (c) => {
        setSelected(roles.find((r) => r.id !== id)?.id);
        report(c);
      },
      () => setError(t('workspaceSettings.failed.delete', { name: current.name })),
    );
  };

  const hold = (userId: string, on: boolean) => {
    if (!current) return;
    setError(null);
    if (!current.id) {
      setDraft({ ...current, people: on ? [...current.people, userId] : current.people.filter((p) => p !== userId) });
      return;
    }
    const id = current.id;
    const mine = rolesOf(userId);
    store.setExternalRoles(userId, on ? [...new Set([...mine, id])] : mine.filter((r) => r !== id)).then(report, () =>
      setError(t('workspaceSettings.failed.people', { names: nameOf(userId) })),
    );
  };

  const apply = (userId: string) => {
    setError(null);
    store.applyAccess(userId).then(report, () => setError(t('workspaceSettings.failed.people', { names: nameOf(userId) })));
  };

  const list = draft ? [...roles, null] : roles;

  return (
    <div className={`${s.pane} ${s.access}`}>
      <div className={s.roles} role="list" aria-label={t('workspaceSettings.roleList')}>
        <button type="button" className={s.newRole} onClick={startNew}>
          <PlusIcon size={15} strokeWidth={2.4} />
          {t('workspaceSettings.newRole')}
        </button>
        {list.map((r) => {
          const role = r ? (local[r.id] ?? r) : draft!;
          const on = r ? !draft && r.id === current?.id : true;
          return (
            <button key={r?.id ?? 'new'} type="button" role="listitem" className={s.role} aria-current={on} onClick={() => (r ? select(r.id) : undefined)}>
              <span className={s.menuDot} style={{ '--dot': role.colour } as CSSProperties} aria-hidden="true" />
              <span className={s.roleName}>{role.name || t('workspaceSettings.newRole')}</span>
              <span className={s.roleCount}>{r ? count(r.id) : draft!.people.length}</span>
            </button>
          );
        })}
      </div>
      {current && <Editor key={current.id ?? 'new'} role={current} workspaceId={workspaceId} people={people} access={access} error={error} onChange={change} onDelete={remove} onHold={hold} onApply={apply} />}
    </div>
  );
}

type EditorProps = {
  role: Draft;
  workspaceId: string;
  people: Member[];
  access: ExternalAccess[];
  error: string | null;
  onChange: (patch: Partial<Draft>) => void;
  onDelete: () => void;
  onHold: (userId: string, on: boolean) => void;
  onApply: (userId: string) => void;
};

function Editor({ role, workspaceId, people, access, error, onChange, onDelete, onHold, onApply }: EditorProps) {
  const { t } = useTranslation();
  const channels = useWorkspace((x) => x.channels[workspaceId]);
  const spaces = useWorkspace((x) => x.spaces);
  const [name, setName] = useState(role.name);
  // The last name sent: Enter then blur must not save twice.
  const sent = useRef(role.name);
  const clients = spaces.filter((sp) => sp.kind === 'client');

  const saveName = () => {
    const clean = name.trim();
    if (!clean) {
      setName(sent.current);
      return;
    }
    if (clean === sent.current) return;
    sent.current = clean;
    onChange({ name: clean });
  };

  const toggle = (key: 'channels' | 'spaces', id: string) =>
    onChange({ [key]: role[key].includes(id) ? role[key].filter((x) => x !== id) : [...role[key], id] });

  const holders = role.id ? access.filter((a) => a.roles.includes(role.id!)) : access.filter((a) => role.people.includes(a.person.id));
  const draftOnly = role.id ? [] : people.filter((m) => role.people.includes(m.person.id) && !access.some((a) => a.person.id === m.person.id));
  const candidates = people.filter((m) => m.role === 'external' && !holders.some((h) => h.person.id === m.person.id) && !draftOnly.includes(m));
  const label = (m: { person: { name: string }; pending?: boolean; email?: string }) => (m.pending && m.email ? m.email : m.person.name);

  const pick = (e: KeyboardEvent<HTMLButtonElement>, list: string[], index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + list.length) % list.length;
    onChange({ colour: list[next]! });
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  const hexes = colours.map(([, hex]) => hex as string);
  const at = hexes.findIndex((hex) => hex.toLowerCase() === role.colour.toLowerCase());

  return (
    <div className={s.editor}>
      <div>
        <label htmlFor="access-role-name" className={s.label}>
          {t('workspaceSettings.name')}
        </label>
        <div className={s.nameField}>
          <span className={s.nameDot} style={{ '--dot': role.colour } as CSSProperties} aria-hidden="true" />
          <input
            id="access-role-name"
            className={s.nameInput}
            autoComplete="off"
            maxLength={80}
            autoFocus={!role.id}
            placeholder={role.id ? undefined : t('workspaceSettings.newRole')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (isImeEnter(e)) {
                e.preventDefault();
                saveName();
              }
            }}
          />
        </div>
      </div>
      <div>
        <div id="access-role-colour" className={s.label}>
          {t('workspaceSettings.colour')}
        </div>
        <div role="radiogroup" aria-labelledby="access-role-colour" className={s.swatches}>
          {colours.map(([id, hex], i) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={i === at}
              aria-label={t(`workspaceSettings.swatches.${id}`)}
              tabIndex={i === (at < 0 ? 0 : at) ? 0 : -1}
              className={s.swatch}
              style={{ '--swatch': hex } as CSSProperties}
              onKeyDown={(e) => pick(e, hexes, i)}
              onClick={() => i !== at && onChange({ colour: hex })}
            />
          ))}
        </div>
      </div>
      {channels && channels.length > 0 && (
        <div>
          <div id="access-role-channels" className={s.label}>
            {t('workspaceSettings.channels')}
          </div>
          <div className={s.box} role="group" aria-labelledby="access-role-channels">
            {channels.map((c) => (
              <button key={c.id} type="button" role="checkbox" aria-checked={role.channels.includes(c.id)} className={s.option} onClick={() => toggle('channels', c.id)}>
                <span className={s.tick} aria-hidden="true">
                  {role.channels.includes(c.id) && <CheckIcon size={13} strokeWidth={3} />}
                </span>
                <span className={s.optionIcon}>{c.private ? <LockIcon size={15} strokeWidth={2} /> : <HashIcon size={15} strokeWidth={2} />}</span>
                <span className={s.optionName}>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {clients.length > 0 && (
        <div>
          <div id="access-role-spaces" className={s.label}>
            {t('workspaceSettings.clientSpaces')}
            <span className={s.labelNote}>
              <HistoryIcon size={13} strokeWidth={2} />
              {t('workspaceSettings.earlier')}
            </span>
          </div>
          <div className={s.box} role="group" aria-labelledby="access-role-spaces">
            {clients.map((sp) => (
              <button key={sp.id} type="button" role="checkbox" aria-checked={role.spaces.includes(sp.id)} className={s.option} onClick={() => toggle('spaces', sp.id)}>
                <span className={s.tick} aria-hidden="true">
                  {role.spaces.includes(sp.id) && <CheckIcon size={13} strokeWidth={3} />}
                </span>
                <span className={s.tile} style={{ '--tile': spaceColour(sp) } as CSSProperties} aria-hidden="true">
                  {(Array.from(sp.name.trim())[0] ?? '').toUpperCase()}
                </span>
                <span className={s.optionName}>{sp.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div id="access-role-people" className={s.label}>
          {t('workspaceSettings.people')}
        </div>
        <div className={s.holders} role="list" aria-labelledby="access-role-people">
          {holders.map((a) => {
            const name = label(a);
            return (
              <span key={a.person.id} role="listitem" className={[s.holder, a.pending && s.holderPending].filter(Boolean).join(' ')}>
                {a.pending ? (
                  <span className={s.holderPendingFace} aria-hidden="true">
                    <PendingIcon size={13} strokeWidth={2} />
                  </span>
                ) : (
                  <Face person={a.person} size={26} />
                )}
                <span className={s.holderName}>{name}</span>
                {a.pending ? (
                  <span className={s.tag}>{t('workspaceSettings.tags.pending')}</span>
                ) : (
                  <>
                    {a.notApplied && (
                      <>
                        <span className={`${s.tag} ${s.tagExternal}`}>{t('workspaceSettings.notApplied')}</span>
                        <button type="button" className={s.apply} onClick={() => onApply(a.person.id)}>
                          {t('workspaceSettings.apply')}
                        </button>
                      </>
                    )}
                    <button type="button" className={s.unhold} aria-label={t('workspaceSettings.removePerson', { name })} onClick={() => onHold(a.person.id, false)}>
                      <XIcon size={13} strokeWidth={2.4} />
                    </button>
                  </>
                )}
              </span>
            );
          })}
          {draftOnly.map((m) => (
            <span key={m.person.id} role="listitem" className={s.holder}>
              <Face person={m.person} size={26} />
              <span className={s.holderName}>{label(m)}</span>
              <button type="button" className={s.unhold} aria-label={t('workspaceSettings.removePerson', { name: label(m) })} onClick={() => onHold(m.person.id, false)}>
                <XIcon size={13} strokeWidth={2.4} />
              </button>
            </span>
          ))}
          {candidates.length > 0 && (
            <Menu>
              <MenuTrigger asChild>
                <button type="button" className={s.addPerson}>
                  <PlusIcon size={14} strokeWidth={2.4} />
                  {t('workspaceSettings.add')}
                </button>
              </MenuTrigger>
              <MenuContent align="start" width={268} className={s.menu} aria-label={t('workspaceSettings.add')}>
                {candidates.map((m) => (
                  <MenuItem
                    key={m.person.id}
                    icon={
                      m.pending ? (
                        <span className={s.holderPendingFace}>
                          <PendingIcon size={13} strokeWidth={2} />
                        </span>
                      ) : (
                        <span className={s.faceBox}>
                          <Face person={m.person} size={26} />
                          <ExternalCorner className={s.corner} />
                        </span>
                      )
                    }
                    onSelect={() => onHold(m.person.id, true)}
                  >
                    <span className={s.holderName}>{label(m)}</span>
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          <AlertIcon />
          {error}
        </p>
      )}
      <div className={`${s.box} ${s.deleteBox}`}>
        <button type="button" className={s.deleteRole} onClick={onDelete}>
          <TrashIcon size={16} strokeWidth={2} />
          {t('workspaceSettings.deleteRole')}
        </button>
      </div>
    </div>
  );
}
