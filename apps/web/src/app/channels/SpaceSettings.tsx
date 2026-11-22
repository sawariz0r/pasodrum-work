// Client space settings (SpaceSettings, SpacePeople, RemoveFromSpace, ArchiveSpace, DES-05 DeleteSpace). Owners and Admins, from the space menu.
// General: name, colour (saves as it changes), Archive; once archived, Delete for workspace Owners. People (D-36 PeopleSpaceInvite): an invite field for clients on top, then the
// team (Externals tagged), then the client, pending with the clock.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type Member, type PendingInvite, type Person, type Space } from '../../matrix';
import { Button, Dialog, IconButton, isImeEnter, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui';
import { HashIcon, LogoMark, MoreIcon, TrashIcon } from '../icons';
import { Face, PersonCorner } from '../people/Face';
import { channelPath, dmPath, spaceHome } from '../places';
import { BubbleIcon, MailIcon } from '../shell/icons';
import { firstName, useToast } from '../toast';
import s from './Channels.module.css';
import { AlertIcon, ArchiveIcon, LeaveIcon, LinkIcon, PendingIcon, StarIcon, UserPlusIcon, XIcon } from './icons';
import { Swatches } from './NewClientSpace';
import { canAddPeople, canManage, canRemoveFromSpace } from './roles';
import { copyText, isInviteFor, spaceColour, useRole, useSpace, useWorkspaceName } from './shared';

export type SpaceTab = 'general' | 'people';

type Props = { open: boolean; spaceId: string; tab?: SpaceTab; onClose: () => void; onDelete: (spaceId: string) => void };

export function SpaceSettingsDialog({ open, spaceId, tab: initialTab = 'general', onClose, onDelete }: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const space = useSpace(spaceId);
  const [tab, setTab] = useState<SpaceTab>(initialTab);
  const [members, setMembers] = useState<Member[]>([]);
  const [confirm, setConfirm] = useState<{ kind: 'archive' } | { kind: 'remove'; member: Member } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const ask = (next: typeof confirm) => {
    setFailed(false);
    setConfirm(next);
  };

  useEffect(() => {
    let live = true;
    store.spaceMembers(spaceId).then(
      (list) => live && setMembers(list),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, spaceId, tick]);

  if (!space) return null;
  const tabs: [SpaceTab, string][] = [
    ['general', t('spaces.general')],
    ['people', t('spaces.people')],
  ];

  return (
    <>
      <Dialog
        open={open && !confirm}
        onOpenChange={(o) => !o && onClose()}
        title={
          <span className={s.spTitle}>
            <SpaceTile space={space} size="title" />
            <span className={s.spTitleName}>{space.name}</span>
          </span>
        }
        closeLabel={t('people.close')}
        width={600}
        top={72}
        className={`${s.details} ${s.spDialog}`}
        bodyClassName={s.flush}
      >
        <div role="tablist" aria-label={t('spaces.settings')} className={s.tabs}>
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`space-${id}`} aria-selected={tab === id} className={s.tab} onClick={() => setTab(id)}>
              {label}
              {id === 'people' && <span className={s.tabCount}>{members.length}</span>}
            </button>
          ))}
        </div>
        <div key={tab} role="tabpanel" aria-labelledby={`space-${tab}`} className={s.panel}>
          {tab === 'general' ? (
            <General
              space={space}
              onArchive={() => ask({ kind: 'archive' })}
              onDelete={() => onDelete(space.id)}
            />
          ) : (
            <People space={space} members={members} tick={tick} onAdded={() => setTick((n) => n + 1)} onRemove={(member) => ask({ kind: 'remove', member })} onLeave={onClose} />
          )}
        </div>
      </Dialog>
      {confirm?.kind === 'archive' && (
        <ArchiveDialog
          open={open}
          space={space}
          members={members}
          alert={failed ? t('failed.archiveSpace', { name: space.name }) : undefined}
          onCancel={() => ask(null)}
          onArchive={() => {
            setFailed(false);
            void store.setArchived(space.id, true).then(onClose, () => setFailed(true));
          }}
        />
      )}
      {confirm?.kind === 'remove' && (
        <RemoveDialog
          open={open}
          space={space}
          member={confirm.member}
          alert={failed ? t('failed.removeFromSpace', { name: confirm.member.person.name }) : undefined}
          onCancel={() => ask(null)}
          onRemove={() => {
            setFailed(false);
            void store.removeFromSpace(space.id, confirm.member.person.id).then(
              () => {
                setMembers((list) => list.filter((m) => m.person.id !== confirm.member.person.id));
                setConfirm(null);
              },
              () => setFailed(true),
            );
          }}
        />
      )}
    </>
  );
}

/** A client space's tile at the sizes the settings boards use. */
export function SpaceTile({ space, size, name, className }: { space: Space; size: 'title' | 'field' | 'label' | 'card'; name?: string; className?: string }) {
  const initial = (Array.from((name ?? space.name).trim())[0] ?? '?').toUpperCase();
  return (
    <span className={[s.spTile, s[`spTile_${size}`], className].filter(Boolean).join(' ')} style={{ '--tile-bg': spaceColour(space) } as CSSProperties} aria-hidden="true">
      {initial}
    </span>
  );
}

function General({ space, onArchive, onDelete }: { space: Space; onArchive: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const spaces = useWorkspace((x) => x.spaces);
  const owner = useWorkspace((x) => x.myRoles[x.spaces.find((sp) => sp.kind === 'workspace')?.id ?? ''] === 'owner');
  const [name, setName] = useState(space.name);
  const [failed, setFailed] = useState<string | null>(null);
  // The last name sent: Enter then blur (or Escape) must not save twice.
  const sent = useRef(space.name);
  const clean = name.trim();
  const taken =
    !!clean &&
    (spaces.some((sp) => sp.id !== space.id && sp.kind === 'client' && sp.name.trim().toLowerCase() === clean.toLowerCase()) || failed === `taken:${clean}`);

  // Blur, Enter and Escape (which also closes the dialog) all save an edit; nothing is lost.
  const saveName = () => {
    if (!clean || taken || clean === sent.current) return;
    sent.current = clean;
    setFailed(null);
    store.updateSpace(space.id, { name: clean }).catch((e: unknown) => {
      sent.current = space.name;
      setFailed(e instanceof Error && e.message === 'name-taken' ? `taken:${clean}` : clean);
    });
  };

  return (
    <div className={s.spGeneral}>
      <div>
        <label htmlFor="space-name" className={s.fieldLabel}>
          {t('spaces.name')}
        </label>
        <div className={[s.spNameField, taken && s.invalid].filter(Boolean).join(' ')}>
          <SpaceTile space={space} size="field" name={name} />
          <input
            id="space-name"
            className={s.spNameInput}
            autoComplete="off"
            maxLength={80}
            aria-invalid={taken || undefined}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (isImeEnter(e)) {
                e.preventDefault();
                saveName();
              } else if (e.key === 'Escape') saveName();
            }}
          />
        </div>
        {taken ? (
          <p role="alert" className={s.error}>
            <AlertIcon />
            {t('spaces.taken', { name: clean })}
          </p>
        ) : (
          failed === clean && (
            <p role="alert" className={s.error}>
              <AlertIcon />
              {t('spaces.renameFailed', { name: clean })}
            </p>
          )
        )}
      </div>
      <div>
        <div id="space-colour" className={s.fieldLabel}>
          {t('spaces.colour')}
        </div>
        <Swatches labelledBy="space-colour" value={spaceColour(space)} size={30} onPick={(colour) => void store.updateSpace(space.id, { colour }).catch(() => toast(t('failed.colour', { name: space.name })))} />
      </div>
      {!space.archived ? (
        <div className={`${s.box} ${s.actions}`}>
          <button type="button" className={`${s.action} ${s.danger}`} onClick={onArchive}>
            <span>
              <ArchiveIcon />
            </span>
            {t('spaces.archive')}
          </button>
        </div>
      ) : (
        owner && (
          <div className={`${s.box} ${s.actions}`}>
            <button type="button" className={`${s.action} ${s.danger}`} onClick={onDelete}>
              <span>
                <TrashIcon size={17} />
              </span>
              {t('spaces.delete')}
            </button>
          </div>
        )
      )}
    </div>
  );
}

type PeopleProps = { space: Space; members: Member[]; tick: number; onAdded: () => void; onRemove: (m: Member) => void; onLeave: () => void };

function People({ space, members, tick, onAdded, onRemove, onLeave }: PeopleProps) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const meId = useWorkspace((x) => x.me.id);
  const workspace = useWorkspaceName();
  const mine = useRole(space.id);
  const manage = canManage(mine);
  const [pending, setPending] = useState<PendingInvite[]>([]);

  // Open join links can sit in any of the space's channels.
  useEffect(() => {
    if (!manage) return;
    let live = true;
    const ids = (store.getSnapshot().channels[space.id] ?? []).map((c) => c.id);
    Promise.all(ids.map((id) => store.pendingInvites(id).catch(() => [] as PendingInvite[]))).then((lists) => live && setPending(lists.flat()));
    return () => {
      live = false;
    };
  }, [store, space.id, manage, tick]);

  const team = members.filter((m) => m.role !== 'client');
  const clients = members.filter((m) => m.role === 'client');
  const message = async (userId: string) => {
    const id = await store.openDm([userId]);
    onLeave();
    navigate(dmPath(id));
  };

  const row = (m: Member) => {
    const { person } = m;
    const me = person.id === meId;
    const invite = m.pending ? pending.find((p) => isInviteFor(p, m)) : undefined;
    const mayRemove = canRemoveFromSpace(mine, m.role, me);
    const tag = m.pending ? 'pending' : m.role === 'owner' || m.role === 'admin' || m.role === 'external' ? m.role : null;
    const label = t('channels.more', { name: person.name });
    const staffSide = !m.pending && (m.role === 'owner' || m.role === 'admin' || m.role === 'staff');
    const isContact = staffSide && !!space.contacts?.includes(person.id);
    const mayMark = manage && staffSide;
    const mark = mayMark && (
      <MenuItem icon={<StarIcon />} onSelect={() => void store.setMainContact(space.id, person.id, !isContact).catch(() => toast(t('failed.mainContact')))}>
        {t(isContact ? 'spaces.removeMainContact' : 'spaces.makeMainContact')}
      </MenuItem>
    );
    return (
      <li key={person.id} className={s.memberRow}>
        {m.pending ? (
          <span className={s.pendingFace}>
            <PendingIcon />
            <PersonCorner person={person} className={s.spCorner} />
          </span>
        ) : (
          <span className={s.spFace}>
            <Face person={person} size={32} />
            <PersonCorner person={person} className={s.spCorner} />
          </span>
        )}
        <span className={s.memberName}>
          <span>{person.name}</span>
          {isContact && (
            <span className={`${s.tag} ${s.tagContact}`}>
              <StarIcon size={11} fill="currentColor" strokeWidth={0} />
              {t('channels.tags.mainContact')}
            </span>
          )}
          {me && <span className={s.you}>{t('channels.you')}</span>}
        </span>
        {tag && <span className={[s.tag, tag === 'pending' && s.tagPending, tag === 'external' && s.tagOutside].filter(Boolean).join(' ')}>{t(`channels.tags.${tag}`)}</span>}
        <span className={s.moreCell}>
          {manage && (me ? mayMark : mayRemove || !m.pending || invite) && (
            <Menu>
              <MenuTrigger asChild>
                <IconButton size={30} label={label} icon={<MoreIcon />} />
              </MenuTrigger>
              <MenuContent align="end" width={264} aria-label={label}>
                {me ? (
                  mark
                ) : m.pending ? (
                  <>
                    {invite?.link && (
                      <MenuItem icon={<LinkIcon />} onSelect={() => void copyText(invite.link!).catch(() => {})}>
                        {t('channels.copyJoinLink')}
                      </MenuItem>
                    )}
                    {invite && (
                      <MenuItem icon={<MailIcon size={16} strokeWidth={1.9} />} onSelect={() => void store.resendInvite(invite.code).catch(() => toast(t('failed.resend', { name: firstName(person.name) })))}>
                        {t('channels.sendAgain')}
                      </MenuItem>
                    )}
                  </>
                ) : (
                  <MenuItem icon={<BubbleIcon size={16} strokeWidth={1.9} />} onSelect={() => void message(person.id).catch(() => toast(t('failed.message', { name: firstName(person.name) })))}>
                    {t('people.message')}
                  </MenuItem>
                )}
                {!me && mark}
                {!me && mayRemove && (
                  <>
                    {(!m.pending || invite) && <MenuSeparator />}
                    <MenuItem icon={<XIcon />} className={s.danger} onSelect={() => onRemove(m)}>
                      {t('spaces.removeFrom', { name: space.name })}
                    </MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className={s.spPeople}>
      {canAddPeople(space, mine) && !space.archived && <InviteField space={space} members={members} onAdded={onAdded} />}
      <div className={s.spGroup}>
        <span className={s.spGroupTile} aria-hidden="true">
          <LogoMark size={12} />
        </span>
        <span className={s.spGroupName}>{workspace}</span>
      </div>
      <ul role="list" aria-label={workspace} className={s.memberList}>
        {team.map(row)}
      </ul>
      {clients.length > 0 && (
        <>
          <div className={s.spGroup}>
            <SpaceTile space={space} size="label" />
            <span className={s.spGroupName}>{space.name}</span>
          </div>
          <ul role="list" aria-label={space.name} className={s.memberList}>
            {clients.map(row)}
          </ul>
        </>
      )}
    </div>
  );
}

const emailShape = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** PeopleSpaceInvite: a client by email (or an existing client account by name), added to this space at once. */
function InviteField({ space, members, onAdded }: { space: Space; members: Member[]; onAdded: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const externals = useWorkspace((x) => x.externals);
  const [value, setValue] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text = value.trim();
  const isEmail = text.includes('@');

  useEffect(() => {
    if (!text || isEmail) return;
    let live = true;
    store.searchPeople(text).then(
      (list) => live && setFound(list),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [store, text, isEmail]);

  // Clients are the only ones invited here; Staff and Externals come from Add people and Access.
  const inSpace = new Set(members.map((m) => m.person.id));
  const people = (!text || isEmail ? [] : found).filter((p) => p.external && !externals[p.id] && !inSpace.has(p.id)).slice(0, 5);

  const send = async (who: { person?: Person; email?: string }) => {
    if (busy) return;
    if (who.email !== undefined && !emailShape.test(who.email)) {
      setError(t('channels.notEmail', { email: who.email }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await store.addPeople(space.id, { type: 'client', userIds: who.person ? [who.person.id] : [], emails: who.email ? [who.email] : [] });
      const failed = result.failed.find((f) => f.reason !== 'already-member');
      if (failed) {
        setError(failed.reason === 'invalid-email' ? t('channels.notEmail', { email: failed.who }) : t('channels.couldNotAdd', { name: who.person?.name ?? failed.who }));
        return;
      }
      setValue('');
      onAdded();
    } catch {
      setError(t('channels.couldNotAdd', { name: who.person?.name ?? who.email ?? '' }));
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (!text) return;
    if (isEmail) void send({ email: text });
    else {
      const hit = people[0];
      if (hit) void send({ person: hit });
    }
  };

  return (
    <div className={s.spInvite}>
      <div className={s.spInviteRow}>
        <label className={s.spInviteField}>
          <UserPlusIcon size={17} />
          <input
            className={s.spInviteInput}
            autoComplete="off"
            aria-label={t('people.search')}
            placeholder={t('people.search')}
            value={value}
            aria-invalid={!!error || undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (isImeEnter(e)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {isEmail && <span className={s.tokenTag}>{t('channels.tags.client')}</span>}
        </label>
        <Button className={s.spInviteAdd} disabled={!text || busy || (!isEmail && !people.length)} onClick={submit}>
          {t('channels.add')}
        </Button>
      </div>
      {error && (
        <p role="alert" className={`${s.error} ${s.spInviteError}`}>
          <AlertIcon />
          {error}
        </p>
      )}
      {people.length > 0 && (
        <ul className={`${s.suggestions} ${s.spInviteFound}`} aria-label={t('channels.suggestions')}>
          {people.map((p) => (
            <li key={p.id} className={s.suggestion}>
              <Face person={p} size={30} />
              <span className={s.suggestionName}>{p.name}</span>
              <button type="button" className={s.addButton} aria-label={t('channels.addName', { name: p.name })} onClick={() => void send({ person: p })}>
                {t('channels.add')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type RemoveProps = { open: boolean; space: Space; member: Member; alert?: string; onCancel: () => void; onRemove: () => void };

function RemoveDialog({ open, space, member, alert, onCancel, onRemove }: RemoveProps) {
  const { t } = useTranslation();
  const store = useStore();
  const { person } = member;
  const [email, setEmail] = useState<string>();
  const [leaves, setLeaves] = useState<string[]>();

  useEffect(() => {
    let live = true;
    if (!member.pending) {
      store.profile(person.id).then(
        (p) => live && setEmail(p.email),
        () => {},
      );
    }
    // They leave the space and every channel in it (RulesM5): the ones I'm in and the ones I could join.
    const mine = (store.getSnapshot().channels[space.id] ?? []).map((c) => c.name);
    const all = (names: string[]) => [...new Set(names)].sort((a, b) => a.localeCompare(b));
    store.browseChannels(space.id).then(
      (list) => live && setLeaves(all([...mine, ...list.map((c) => c.name)])),
      () => live && setLeaves(all(mine)),
    );
    return () => {
      live = false;
    };
  }, [store, space.id, person.id, member.pending]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      role="alertdialog"
      width={480}
      top={168}
      title={t('spaces.removeTitle', { person: person.name, name: space.name })}
      closeLabel={t('people.close')}
      alert={alert}
      bodyClassName={s.spConfirmBody}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onCancel}>
            {t('people.cancel')}
          </Button>
          <Button variant="danger" onClick={onRemove}>
            {t('spaces.removeButton')}
          </Button>
        </>
      }
    >
      <div className={s.spCard}>
        <div className={s.spCardRow}>
          {member.pending ? (
            <span className={`${s.pendingFace} ${s.spCardFace}`}>
              <PendingIcon />
              <PersonCorner person={person} className={s.spCorner} />
            </span>
          ) : (
            <span className={s.spFace}>
              <Face person={person} size={36} />
              <PersonCorner person={person} className={s.spCorner} />
            </span>
          )}
          <span className={s.spCardText}>
            <span className={s.spCardName}>{person.name}</span>
            {email && <span className={s.spCardSub}>{email}</span>}
          </span>
        </div>
        {leaves && leaves.length > 0 && (
          <div className={s.spLeaves}>
            <span className={s.spLeavesIcon}>
              <LeaveIcon size={15} strokeWidth={2} />
            </span>
            {leaves.map((n) => (
              <span key={n} className={s.spLeave}>
                <HashIcon size={13} strokeWidth={2.2} />
                {n}
              </span>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

type ArchiveProps = { open: boolean; space: Space; members: Member[]; alert?: string; onCancel: () => void; onArchive: () => void };

function ArchiveDialog({ open, space, members, alert, onCancel, onArchive }: ArchiveProps) {
  const { t } = useTranslation();
  const faces = members.filter((m) => !m.pending).slice(0, 4);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      role="alertdialog"
      width={440}
      top={168}
      title={t('spaces.archiveTitle', { name: space.name })}
      closeLabel={t('people.close')}
      alert={alert}
      bodyClassName={s.spConfirmBody}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onCancel}>
            {t('people.cancel')}
          </Button>
          <Button variant="danger" onClick={onArchive}>
            {t('spaces.archiveButton')}
          </Button>
        </>
      }
    >
      <div className={`${s.spCard} ${s.spCardRow}`}>
        <SpaceTile space={space} size="card" />
        <span className={s.spCardName}>{space.name}</span>
        <span className={s.spPile}>
          {faces.map((m) => (
            <Face key={m.person.id} person={m.person} size={26} className={s.spPileFace} />
          ))}
        </span>
      </div>
    </Dialog>
  );
}

/** DES-05 DeleteSpace: typing the space's name arms Delete; afterwards you land on the workspace. */
export function DeleteSpaceDialog({ open, spaceId, onClose }: { open: boolean; spaceId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const space = useSpace(spaceId);
  const home = useWorkspace((x) => {
    const ws = x.spaces.find((sp) => sp.kind === 'workspace');
    const channel = ws && spaceHome(x, ws.id);
    return ws && channel ? channelPath(ws.id, channel.id) : '/';
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [typed, setTyped] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const whatId = useId();
  // The name it opened with: the snapshot drops the space while the delete finishes.
  const [name] = useState(space?.name ?? '');

  useEffect(() => {
    let live = true;
    store.spaceMembers(spaceId).then(
      (list) => live && setMembers(list),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, spaceId]);

  if (!space && !busy) return null;
  const armed = typed.trim() === name && !busy;
  const faces = members.filter((m) => !m.pending).slice(0, 4);
  const remove = () => {
    if (!armed) return;
    setFailed(false);
    setBusy(true);
    store.deleteSpace(spaceId).then(
      () => {
        onClose();
        navigate(home);
      },
      () => {
        setBusy(false);
        setFailed(true);
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      role="alertdialog"
      width={440}
      top={168}
      title={t('spaces.deleteTitle', { name })}
      closeLabel={t('people.close')}
      alert={failed ? t('failed.deleteSpace', { name }) : undefined}
      busy={busy}
      bodyClassName={s.spConfirmBody}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onClose}>
            {t('people.cancel')}
          </Button>
          <Button variant="danger" disabled={!armed} onClick={remove}>
            {t('spaces.deleteButton')}
          </Button>
        </>
      }
    >
      {space && (
        <div className={`${s.spCard} ${s.spCardRow}`}>
          <SpaceTile space={space} size="card" />
          <span className={s.spCardName}>{name}</span>
          <span className={s.spPile}>
            {faces.map((m) => (
              <Face key={m.person.id} person={m.person} size={26} className={s.spPileFace} />
            ))}
          </span>
        </div>
      )}
      <p id={whatId} className={s.dsWhat}>
        {t('spaces.deleteWhat')}
      </p>
      <label htmlFor={inputId} className={s.dsLabel}>
        {t('spaces.deleteLabel')}
      </label>
      <input
        id={inputId}
        className={s.dsInput}
        autoComplete="off"
        placeholder={name}
        aria-describedby={whatId}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (isImeEnter(e)) {
            e.preventDefault();
            remove();
          }
        }}
      />
    </Dialog>
  );
}
