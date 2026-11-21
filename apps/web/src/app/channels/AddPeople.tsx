// Add people (D-36: PeopleAddStaff/External/Client, PeopleAddNordlys, PeopleAddChannel, PeopleAddStaffOnly; AddPeopleErrors).
// Owners/Admins at the workspace or a client space pick a type first, then who, then where: client spaces for Staff, roles and
// one-off channels for Externals, the client space for Clients. Staff in a client space add its clients (no type, no where).
// To a channel: no type; colleagues and existing Externals by name, a new email is a one-off External (Owners/Admins only).
// No shared link: a pending person has their own join link (D-25).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type AddPeopleRequest, type PendingInvite, type Person, type Space } from '../../matrix';
import { Button, Dialog, isImeEnter, Menu, MenuContent, MenuItem, MenuTrigger } from '../../ui';
import { HashIcon, LockIcon } from '../icons';
import { Face } from '../people/Face';
import { SmallCloseIcon } from '../shell/icons';
import s from './Channels.module.css';
import { useChannels } from './ChannelsProvider';
import { AlertIcon, CheckIcon, ChevronIcon, LinkIcon, PendingIcon, PlusIcon } from './icons';
import { addTypes, canAddNew, canAddPeople, type AddRole } from './roles';
import { spaceColour, useChannel, useCopy, useRole, useSpace } from './shared';

type Token = { kind: 'person'; person: Person } | { kind: 'email'; email: string };
type Problem = { who: string; reason: 'invalid-email' | 'not-allowed' | 'other' };
type Mode = 'typed' | 'space' | 'channel';

const emailShape = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const keyOf = (tk: Token) => (tk.kind === 'person' ? tk.person.id : tk.email.toLowerCase());
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function AddPeopleDialog({ open, targetId, onClose }: { open: boolean; targetId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const api = useChannels();
  const meId = useWorkspace((x) => x.me.id);
  const allSpaces = useWorkspace((x) => x.spaces);
  const myRoles = useWorkspace((x) => x.myRoles);
  const accessRoles = useWorkspace((x) => x.accessRoles);
  const externals = useWorkspace((x) => x.externals);
  const workspaceChannels = useWorkspace((x) => x.channels);
  const channel = useChannel(targetId);
  const ownSpace = useSpace(targetId);
  const space = useSpace(channel?.spaceId) ?? ownSpace;
  const workspace = allSpaces.find((sp) => sp.kind === 'workspace');
  const myRole = useRole(space?.id);
  const types = channel ? [] : addTypes(workspace && myRoles[workspace.id]);
  const mode: Mode = channel ? 'channel' : types.length ? 'typed' : 'space';
  // Client spaces I'm on as team (Owners/Admins are on all of them), open ones only.
  const clientSpaces = useMemo(() => allSpaces.filter((sp) => sp.kind === 'client' && !sp.archived && canAddPeople(sp, myRoles[sp.id])), [allSpaces, myRoles]);
  const myChannels = useMemo(() => (workspace ? (workspaceChannels[workspace.id] ?? []).filter((c) => !c.archived) : []), [workspace, workspaceChannels]);

  const [type, setType] = useState<AddRole>(ownSpace?.kind === 'client' ? 'client' : 'staff');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [staffSpaces, setStaffSpaces] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [oneOffs, setOneOffs] = useState<string[]>([]);
  const [clientSpaceId, setClientSpaceId] = useState(() => (ownSpace?.kind === 'client' ? ownSpace.id : clientSpaces[0]?.id));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Where the people go: a channel, the client space (Client type or Staff in a client space), else the workspace.
  const toClients = mode === 'space' || (mode === 'typed' && type === 'client');
  const where = mode === 'channel' ? targetId : toClients ? clientSpaceId : workspace?.id;

  useEffect(() => {
    if (!where) return;
    let live = true;
    (mode === 'channel' ? store.channelMembers(where) : store.spaceMembers(where)).then(
      (list) => live && setMembers(new Set(list.filter((m) => !m.pending).map((m) => m.person.id))),
      () => live && setMembers(new Set()),
    );
    // A channel lists its own pending people; a client space the clients waiting in any of its channels.
    const lists = mode === 'channel' ? [where] : toClients ? (store.getSnapshot().channels[where] ?? []).map((c) => c.id) : [];
    Promise.all(lists.map((id) => store.pendingInvites(id).catch(() => [] as PendingInvite[]))).then(
      (all) => live && setPending(all.flat().filter((p) => mode === 'channel' || p.role === 'client')),
    );
    return () => {
      live = false;
    };
  }, [store, mode, where, toClients]);

  useEffect(() => {
    let live = true;
    store.searchPeople(query.trim()).then(
      (list) => live && setFound(list),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [store, query]);

  if (!space || !canAddPeople(space, myRole) || (mode === 'space' && space.kind !== 'client')) return null;

  const isExternal = (p: Person) => !!externals[p.id];
  const isClient = (p: Person) => !!p.external && !isExternal(p);
  const inWorkspaceChannel = mode === 'channel' && space.kind === 'workspace';
  // A new email in a workspace channel is a one-off External; Staff may only add colleagues (PeopleAddStaffOnly).
  const staffOnly = inWorkspaceChannel && !canAddNew(myRole);
  const emailKind: AddRole | null = mode === 'typed' ? (type === 'staff' ? null : type) : mode === 'space' || !inWorkspaceChannel ? 'client' : staffOnly ? null : 'external';

  const bad = (tk: Token) => (staffOnly && tk.kind === 'email') || problems.some((p) => same(p.who, keyOf(tk)));
  const valid = tokens.filter((tk) => !bad(tk));
  const tagOf = (tk: Token): string | null => {
    if (tk.kind === 'person') return isExternal(tk.person) && (inWorkspaceChannel || type === 'external') ? t('channels.tags.external') : null;
    return emailKind ? t(`channels.tags.${emailKind}`) : null;
  };

  // Who can be picked by name here, and who is already in.
  const eligible = (p: Person) => {
    if (p.id === meId) return false;
    if (inWorkspaceChannel) return staffOnly ? !p.external : !isClient(p);
    if (mode === 'channel') return true;
    if (mode === 'typed' && type === 'staff') return !p.external;
    if (mode === 'typed' && type === 'external') return isExternal(p);
    return isClient(p);
  };
  const joined = (p: Person) => members.has(p.id) || (mode === 'typed' && ((type === 'staff' && !p.external) || (type === 'external' && isExternal(p))));

  const add = (tk: Token) => {
    setTokens((list) => (list.some((x) => keyOf(x) === keyOf(tk)) ? list : [...list, tk]));
    setQuery('');
    input.current?.focus();
  };
  const addEmail = (raw: string) => {
    const email = raw.trim().replace(/[,;]+$/, '');
    if (!email) return;
    if (!emailShape.test(email)) setProblems((p) => [...p, { who: email, reason: 'invalid-email' }]);
    add({ kind: 'email', email });
  };
  const remove = (tk: Token) => {
    setTokens((list) => list.filter((x) => keyOf(x) !== keyOf(tk)));
    setProblems((p) => p.filter((x) => !same(x.who, keyOf(tk))));
    input.current?.focus();
  };

  const q = query.trim().toLowerCase();
  // A channel suggests a few people up front (PeopleAddChannel); elsewhere names show while typing.
  const people = mode === 'channel' || q ? found.filter(eligible).slice(0, q ? 5 : 3) : [];
  const pendingRows = (mode === 'channel' || toClients ? pending : []).filter((p) => !q || `${p.name ?? ''} ${p.email}`.toLowerCase().includes(q));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const separator = e.key === ',' || e.key === ';' || (e.key === ' ' && query.includes('@'));
    if (isImeEnter(e) || separator) {
      if (!query.trim()) {
        if (isImeEnter(e)) {
          e.preventDefault();
          void submit();
        }
        return;
      }
      e.preventDefault();
      if (query.includes('@')) addEmail(query);
      else {
        const hit = people.find((p) => !joined(p));
        if (hit) add({ kind: 'person', person: hit });
      }
    } else if (e.key === 'Backspace' && !query && tokens.length) {
      remove(tokens[tokens.length - 1]!);
    }
  };

  const ready = valid.length > 0 && !!where && !(mode === 'typed' && type === 'external' && !roles.length && !oneOffs.length);
  const submit = async () => {
    if (!ready || busy || !where) return;
    setBusy(true);
    try {
      const userIds = valid.flatMap((tk) => (tk.kind === 'person' ? [tk.person.id] : []));
      const emails = valid.flatMap((tk) => (tk.kind === 'email' ? [tk.email] : []));
      const req: AddPeopleRequest =
        mode === 'typed' && type === 'staff'
          ? { type: 'staff', userIds, emails, spaces: staffSpaces }
          : mode === 'typed' && type === 'external'
            ? { type: 'external', userIds, emails, roles, channels: oneOffs }
            : { type: inWorkspaceChannel ? 'channel' : 'client', userIds, emails };
      const result = await store.addPeople(where, req);
      const failed = result.failed.filter((f) => f.reason !== 'already-member');
      if (!failed.length) {
        onClose();
        return;
      }
      const left = new Set(failed.map((f) => f.who.toLowerCase()));
      setTokens((list) => list.filter((tk) => left.has(keyOf(tk).toLowerCase())));
      setProblems(failed.map((f) => ({ who: f.who, reason: f.reason === 'invalid-email' || f.reason === 'not-allowed' ? f.reason : 'other' })));
    } catch {
      setProblems(valid.map((tk) => ({ who: keyOf(tk), reason: 'other' })));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (who: string) => {
    const tk = tokens.find((x) => same(keyOf(x), who));
    return tk?.kind === 'person' ? tk.person.name : who;
  };
  const problem = problems[0];
  const error =
    staffOnly && tokens.some((tk) => tk.kind === 'email')
      ? t('channels.onlyManagers')
      : problem &&
        (problem.reason === 'invalid-email'
          ? t('channels.notEmail', { email: problem.who })
          : problem.reason === 'not-allowed'
            ? t('channels.onlyManagers')
            : t('channels.couldNotAdd', { name: nameOf(problem.who) }));

  const field = (
    <div className={mode === 'typed' ? s.apField : mode === 'channel' ? s.apFieldChannel : s.apFieldTop}>
      <div className={s.tokens} onClick={() => input.current?.focus()}>
        {tokens.map((tk) => {
          const isBad = bad(tk);
          const label = tk.kind === 'person' ? tk.person.name : tk.email;
          const tag = isBad ? null : tagOf(tk);
          return (
            <span key={keyOf(tk)} className={[s.token, isBad && s.tokenBad].filter(Boolean).join(' ')}>
              {tk.kind === 'person' ? (
                <Face person={tk.person} size={20} className={s.face} />
              ) : (
                <span className={s.tokenFace} style={{ '--tok-bg': isBad ? '#8A8893' : '#475569' } as CSSProperties} aria-hidden="true">
                  {tk.email.charAt(0).toUpperCase()}
                </span>
              )}
              <span className={s.tokenName}>{label}</span>
              {tag && <span className={s.tokenTag}>{tag}</span>}
              <button type="button" className={s.tokenRemove} aria-label={t('people.remove', { name: label })} onClick={() => remove(tk)}>
                <SmallCloseIcon />
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          autoFocus
          className={s.tokenInput}
          autoComplete="off"
          aria-label={t('people.search')}
          placeholder={t('people.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => query.includes('@') && addEmail(query)}
        />
      </div>
      {error && (
        <p role="alert" className={s.error}>
          <AlertIcon />
          {error}
        </p>
      )}
      {people.length > 0 && (
        <ul className={s.suggestions} aria-label={t('channels.suggestions')}>
          {people.map((p) => {
            const status = joined(p) ? t(mode === 'channel' ? 'channels.inChannel' : 'channels.inSpace') : tokens.some((tk) => keyOf(tk) === p.id) ? t('channels.added') : null;
            return (
              <li key={p.id} className={s.suggestion}>
                <Face person={p} size={30} />
                <span className={s.suggestionName}>{p.name}</span>
                {status ? (
                  <span className={s.status}>
                    <CheckIcon size={13} strokeWidth={2.4} />
                    {status}
                  </span>
                ) : (
                  <button type="button" className={s.addButton} aria-label={t('channels.addName', { name: p.name })} onClick={() => add({ kind: 'person', person: p })}>
                    {t('channels.add')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {mode === 'channel' && pendingRows.length > 0 && (
        <ul className={s.suggestions} aria-label={t('channels.tags.pending')}>
          {pendingRows.map((p) => (
            <PendingRow key={p.code} invite={p} />
          ))}
        </ul>
      )}
    </div>
  );

  const pendingList = toClients && pendingRows.length > 0 && (
    <ul className={mode === 'typed' ? s.apPending : s.apPendingTop} aria-label={t('channels.tags.pending')}>
      {pendingRows.map((p) => (
        <PendingRow key={p.code} invite={p} />
      ))}
    </ul>
  );

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const clientSpace = clientSpaces.find((sp) => sp.id === clientSpaceId);
  const title = mode === 'channel' ? t('channels.addTo', { name: channel!.name }) : mode === 'space' ? t('channels.addToSpace', { name: space.name }) : t('common.addPeople');

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      closeLabel={t('people.close')}
      width={mode === 'channel' ? 540 : 560}
      bodyClassName={s.apBody}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onClose}>
            {t('people.cancel')}
          </Button>
          <Button disabled={!ready || busy} onClick={() => void submit()}>
            {valid.length ? t('channels.addCount', { count: valid.length }) : t('common.addPeople')}
          </Button>
        </>
      }
    >
      {mode === 'typed' && (
        <div className={s.apTypes}>
          <div role="group" aria-label={t('channels.type')} className={s.segments}>
            {types.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={type === id}
                className={`${s.segment} ${s.tall}`}
                onClick={() => {
                  setType(id);
                  setProblems([]);
                  input.current?.focus();
                }}
              >
                {t(`channels.roles.${id}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {field}
      {mode === 'typed' &&
        type === 'staff' &&
        (clientSpaces.length > 0 ? (
          <Section label={t('channels.clientSpaces')} className={s.apSectionLast}>
            {clientSpaces.map((sp) => (
              <Chip key={sp.id} on={staffSpaces.includes(sp.id)} lead={<Tile space={sp} />} onClick={() => setStaffSpaces((l) => toggle(l, sp.id))}>
                {sp.name}
              </Chip>
            ))}
          </Section>
        ) : (
          <div className={s.apEnd} />
        ))}
      {mode === 'typed' && type === 'external' && (
        <>
          <Section label={t('channels.accessRoles')} className={s.apSection}>
            {accessRoles.map((r) => (
              <Chip key={r.id} on={roles.includes(r.id)} lead={<span className={s.apDot} style={{ background: r.colour }} aria-hidden="true" />} onClick={() => setRoles((l) => toggle(l, r.id))}>
                {r.name}
              </Chip>
            ))}
            <button type="button" className={s.apNewRole} onClick={() => api.workspaceSettings('access')}>
              <PlusIcon size={14} strokeWidth={2.4} />
              {t('channels.newRole')}
            </button>
          </Section>
          <Section label={t('channels.title')} className={s.apSectionChannels}>
            {oneOffs.map((id) => {
              const c = myChannels.find((x) => x.id === id);
              if (!c) return null;
              return (
                <span key={id} className={s.apChannel}>
                  <span className={s.apChannelIcon}>{c.private ? <LockIcon size={13} strokeWidth={2.2} /> : <HashIcon size={13} strokeWidth={2.2} />}</span>
                  {c.name}
                  <button type="button" className={s.tokenRemove} aria-label={t('people.remove', { name: c.name })} onClick={() => setOneOffs((l) => l.filter((x) => x !== id))}>
                    <SmallCloseIcon />
                  </button>
                </span>
              );
            })}
            {myChannels.some((c) => !oneOffs.includes(c.id)) && (
              <Menu>
                <MenuTrigger asChild>
                  <button type="button" className={s.apAddChannel} aria-label={t('spaces.addChannel')}>
                    <PlusIcon size={14} strokeWidth={2.4} />
                  </button>
                </MenuTrigger>
                <MenuContent align="start" width={240} aria-label={t('spaces.addChannel')} className={s.apMenu}>
                  {myChannels
                    .filter((c) => !oneOffs.includes(c.id))
                    .map((c) => (
                      <MenuItem key={c.id} icon={c.private ? <LockIcon /> : <HashIcon />} onSelect={() => setOneOffs((l) => [...l, c.id])}>
                        {c.name}
                      </MenuItem>
                    ))}
                </MenuContent>
              </Menu>
            )}
          </Section>
        </>
      )}
      {mode === 'typed' && type === 'client' && (
        <>
          <Section label={t('channels.clientSpace')} className={s.apSection}>
            <Menu>
              <MenuTrigger asChild>
                <button type="button" className={s.apPick} disabled={!clientSpaces.length}>
                  {clientSpace && <Tile space={clientSpace} />}
                  <span className={s.apPickName}>{clientSpace?.name}</span>
                  <ChevronIcon size={15} />
                </button>
              </MenuTrigger>
              <MenuContent align="start" width={240} aria-label={t('channels.clientSpace')}>
                {clientSpaces.map((sp) => (
                  <MenuItem key={sp.id} icon={<Tile space={sp} />} onSelect={() => setClientSpaceId(sp.id)}>
                    {sp.name}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </Section>
          {pendingList || <div className={s.apEnd} />}
        </>
      )}
      {mode === 'space' && (pendingList || <div className={s.apEnd} />)}
    </Dialog>
  );
}

function Section({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={className}>
      <div className={s.apLabel}>{label}</div>
      <div className={s.apChips}>{children}</div>
    </div>
  );
}

function Chip({ on, lead, onClick, children }: { on: boolean; lead: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} className={s.apChip} onClick={onClick}>
      {lead}
      {children}
      {on && (
        <span className={s.apChipCheck}>
          <CheckIcon size={14} strokeWidth={2.6} />
        </span>
      )}
    </button>
  );
}

function Tile({ space }: { space: Space }) {
  return (
    <span className={s.apTile} style={{ '--tile-bg': spaceColour(space) } as CSSProperties} aria-hidden="true">
      {(Array.from(space.name.trim())[0] ?? '').toUpperCase()}
    </span>
  );
}

function PendingRow({ invite }: { invite: PendingInvite }) {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  const name = invite.name ?? invite.email;
  return (
    <li className={s.suggestion}>
      <span className={`${s.pendingFace} ${s.apPendingFace}`}>
        <PendingIcon />
      </span>
      <span className={s.suggestionName}>{name}</span>
      <span className={s.pendingTag}>{t('channels.tags.pending')}</span>
      {invite.link && (
        <button type="button" className={`${s.addButton} ${s.copyButton}`} onClick={() => copy(invite.link!)}>
          <LinkIcon size={14} strokeWidth={2} />
          {copied ? t('channels.linkCopied') : t('channels.copyJoinLink')}
        </button>
      )}
    </li>
  );
}
