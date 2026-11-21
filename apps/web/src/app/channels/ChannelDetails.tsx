// Channel details from the header (ChannelAbout, ChannelMembers, ChannelSettings, LeaveChannel).
// A lock means private; nothing here talks about encryption.
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type Channel, type Member, type NotifyLevel, type PendingInvite } from '../../matrix';
import { Button, Dialog, IconButton, isImeEnter, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../ui';
import { HashIcon, LockIcon, MoreIcon } from '../icons';
import { ExternalCorner, Face } from '../people/Face';
import { useShowExternal } from '../people/names';
import { roleEvents, useProfileCard } from '../people/ProfileCardContext';
import { channelPath, dmPath, spaceHome } from '../places';
import { BubbleIcon, MailIcon, SearchIcon } from '../shell/icons';
import s from './Channels.module.css';
import { AlertIcon, ArchiveIcon, CheckIcon, LeaveIcon, LinkIcon, PendingIcon, UnarchiveIcon, UserPlusIcon, XIcon } from './icons';
import { addRoles, canManage, channelSlug } from './roles';
import { channelLink, copyText, isInviteFor, useChannel, useCopy, useRole, useSpace } from './shared';

export type DetailsTab = 'about' | 'members' | 'settings';

type Props = { open: boolean; channelId: string; tab: DetailsTab; onClose: () => void; onAddPeople: () => void };

export function ChannelDetailsDialog({ open, channelId, tab: initialTab, onClose, onAddPeople }: Props) {
  const { t } = useTranslation();
  const channel = useChannel(channelId);
  const [tab, setTab] = useState(initialTab);
  const [leaving, setLeaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const store = useStore();
  const navigate = useNavigate();

  if (!channel) return null;

  const leave = async () => {
    await store.leaveChannel(channel.id);
    onClose();
    const next = spaceHome(store.getSnapshot(), channel.spaceId);
    navigate(next && next.id !== channel.id ? channelPath(channel.spaceId, next.id) : `/w/${encodeURIComponent(channel.spaceId)}/channels`);
  };

  const tabs: DetailsTab[] = ['about', 'members', 'settings'];
  const icon = channel.private ? <LockIcon size={20} strokeWidth={2.1} /> : <HashIcon size={20} strokeWidth={2.1} />;

  return (
    <>
      <Dialog
        open={open && !leaving && !archiving}
        onOpenChange={(o) => !o && onClose()}
        title={
          <span className={s.detailsTitle}>
            {icon}
            <span>{channel.name}</span>
          </span>
        }
        closeLabel={t('people.close')}
        width={600}
        top={72}
        className={s.details}
        bodyClassName={s.flush}
      >
        <div role="tablist" aria-label={t('shell.header.details')} className={s.tabs}>
          {tabs.map((id) => (
            <button key={id} type="button" role="tab" id={`details-${id}`} aria-selected={tab === id} className={s.tab} onClick={() => setTab(id)}>
              {t(`channels.${id}`)}
              {id === 'members' && <span className={s.tabCount}>{channel.memberCount}</span>}
            </button>
          ))}
        </div>
        <div key={tab} role="tabpanel" aria-labelledby={`details-${tab}`} className={s.panel}>
          {tab === 'about' && <About channel={channel} onLeave={() => (channel.private ? setLeaving(true) : void leave().catch(() => {}))} />}
          {tab === 'members' && <Members channel={channel} onAddPeople={onAddPeople} onLeave={onClose} />}
          {tab === 'settings' && <Settings channel={channel} onArchive={() => setArchiving(true)} />}
        </div>
      </Dialog>
      {leaving && <LeaveDialog open={open} channel={channel} onCancel={onClose} onLeave={() => void leave().catch(() => {})} />}
      {archiving && (
        <ArchiveDialog
          open={open}
          channel={channel}
          onCancel={() => setArchiving(false)}
          onArchive={() => void store.setChannelArchived(channel.id, true).then(onClose, () => setArchiving(false))}
        />
      )}
    </>
  );
}

function About({ channel, onLeave }: { channel: Channel; onLeave: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const manage = canManage(useRole(channel.spaceId));
  const [editing, setEditing] = useState<string | null>(null);
  const [copied, copy] = useCopy();

  const save = async () => {
    if (editing === null) return;
    await store.setTopic(channel.id, editing.trim()).then(() => setEditing(null), () => {});
  };

  return (
    <div className={s.aboutPanel}>
      {(channel.topic || manage) && (
        <div className={s.box}>
          <div className={s.topic}>
            <div className={s.topicText}>
              <label className={s.label} htmlFor="channel-topic">
                {t('channels.topic')}
              </label>
              {editing === null ? (
                channel.topic && <p className={s.topicValue}>{channel.topic}</p>
              ) : (
                <>
                  <textarea
                    id="channel-topic"
                    className={s.topicInput}
                    autoFocus
                    rows={2}
                    maxLength={250}
                    value={editing}
                    onChange={(e) => setEditing(e.target.value)}
                    onKeyDown={(e) => {
                      if (isImeEnter(e) && !e.shiftKey) {
                        e.preventDefault();
                        void save();
                      }
                    }}
                  />
                  <div className={s.topicActions}>
                    <Button variant="secondary" onClick={() => setEditing(null)}>
                      {t('people.cancel')}
                    </Button>
                    <Button onClick={() => void save()}>{t('channels.save')}</Button>
                  </div>
                </>
              )}
            </div>
            {manage && editing === null && (
              <button type="button" className={s.linkButton} onClick={() => setEditing(channel.topic ?? '')}>
                {t('channels.edit')}
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`${s.box} ${s.actions}`}>
        <button type="button" className={s.action} onClick={() => copy(channelLink(channel))}>
          <span>
            <LinkIcon />
          </span>
          {copied ? t('channels.linkCopied') : t('channels.copyLink')}
        </button>
        <button type="button" className={`${s.action} ${s.danger}`} onClick={onLeave}>
          <span>
            <LeaveIcon />
          </span>
          {t('channels.leave')}
        </button>
      </div>
    </div>
  );
}

type Row = { kind: 'member'; member: Member } | { kind: 'pending'; key: string; label: string; userId?: string; invite?: PendingInvite };

/** `onLeave` closes the dialog when a row takes you elsewhere (Message). */
function Members({ channel, onAddPeople, onLeave }: { channel: Channel; onAddPeople: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const card = useProfileCard();
  const meId = useWorkspace((x) => x.me.id);
  const role = useRole(channel.spaceId);
  const space = useSpace(channel.spaceId);
  const manage = canManage(role);
  const mayAdd = addRoles(space, role).length > 0;
  const showExternal = useShowExternal();
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    roleEvents.addEventListener('change', again);
    return () => roleEvents.removeEventListener('change', again);
  }, []);

  useEffect(() => {
    let live = true;
    store.channelMembers(channel.id).then(
      (list) => live && setMembers(list),
      () => {},
    );
    if (mayAdd) {
      store.pendingInvites(channel.id).then(
        (list) => live && setPending(list),
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, [store, channel.id, mayAdd, tick]);

  const q = query.trim().toLowerCase();
  const order = { owner: 0, admin: 1, member: 2, client: 3, guest: 4 } as const;
  // Someone added by email shows as a pending member; the invite (if the service answers) adds their link.
  const waiting = members.filter((m) => m.pending);
  const rows: Row[] = [
    ...members
      .filter((m) => !m.pending)
      .sort((a, b) => order[a.role] - order[b.role])
      .map((member) => ({ kind: 'member' as const, member })),
    ...waiting.map((m) => {
      const invite = pending.find((p) => isInviteFor(p, m));
      return { kind: 'pending' as const, key: m.person.id, label: invite?.name ?? invite?.email ?? m.person.name, userId: m.person.id, invite };
    }),
    ...pending
      .filter((p) => !waiting.some((m) => isInviteFor(p, m)))
      .map((invite) => ({ kind: 'pending' as const, key: invite.code, label: invite.name ?? invite.email, invite })),
  ].filter((r) => !q || (r.kind === 'member' ? r.member.person.name : `${r.label} ${r.invite?.email ?? ''}`).toLowerCase().includes(q));

  const remove = async (userId: string) => {
    await store.removeFromChannel(channel.id, userId);
    setMembers((list) => list.filter((m) => m.person.id !== userId));
  };
  const dropPending = async (r: Extract<Row, { kind: 'pending' }>) => {
    if (r.invite) await store.revokeInvite(r.invite.code);
    else if (r.userId) await store.removeFromChannel(channel.id, r.userId);
    setPending((list) => list.filter((p) => p !== r.invite));
    setMembers((list) => list.filter((m) => m.person.id !== r.userId));
  };
  const message = async (userId: string) => {
    const id = await store.openDm([userId]);
    onLeave();
    navigate(dmPath(id));
  };
  const tagOf = (r: Member['role']) => (r === 'member' ? null : r);

  return (
    <div className={s.membersPanel}>
      <div className={s.membersSearch}>
        <label className={s.searchField}>
          <SearchIcon />
          <input type="search" aria-label={t('channels.findMembers')} placeholder={t('channels.findMembers')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      {mayAdd && !space?.archived && !channel.archived && (
        <button type="button" className={s.addPeopleRow} onClick={onAddPeople}>
          <span className={s.addPeopleIcon}>
            <UserPlusIcon size={17} />
          </span>
          {t('common.addPeople')}
        </button>
      )}
      <ul role="list" aria-label={t('channels.members')} className={s.memberList}>
        {rows.map((r) => {
          if (r.kind === 'pending') {
            const p = r.invite;
            return (
              <li key={r.key} className={s.memberRow}>
                <span className={s.pendingFace}>
                  <PendingIcon />
                </span>
                <span className={s.memberName}>
                  <span>{r.label}</span>
                </span>
                <span className={`${s.tag} ${s.tagPending}`}>{t('channels.tags.pending')}</span>
                <span className={s.moreCell}>
                  {(mayAdd || manage) && (
                    <RowMenu up label={t('channels.more', { name: r.label })}>
                      {p?.link && (
                        <MenuItem icon={<LinkIcon />} onSelect={() => void copyText(p.link!).catch(() => {})}>
                          {t('channels.copyJoinLink')}
                        </MenuItem>
                      )}
                      {p && (
                        <MenuItem icon={<MailIcon size={16} strokeWidth={1.9} />} onSelect={() => void store.resendInvite(p.code).catch(() => {})}>
                          {t('channels.sendAgain')}
                        </MenuItem>
                      )}
                      {p && <MenuSeparator />}
                      <MenuItem icon={<XIcon />} className={s.danger} onSelect={() => void dropPending(r).catch(() => {})}>
                        {t('channels.removeFrom', { name: channel.name })}
                      </MenuItem>
                    </RowMenu>
                  )}
                </span>
              </li>
            );
          }
          const { person, role: theirs } = r.member;
          const me = person.id === meId;
          const tag = tagOf(theirs);
          return (
            <li key={person.id} className={s.memberRow}>
              {showExternal && person.external ? (
                <span className={s.spFace}>
                  <Face person={person} size={32} />
                  <ExternalCorner className={s.spCorner} />
                </span>
              ) : (
                <Face person={person} size={32} />
              )}
              <span className={s.memberName}>
                <button type="button" className={s.personButton} onClick={(e) => card.open(person.id, e.currentTarget)}>
                  {person.name}
                </button>
                {me && <span className={s.you}>{t('channels.you')}</span>}
              </span>
              {tag && <span className={[s.tag, (tag === 'guest' || tag === 'client') && s.tagGuest].filter(Boolean).join(' ')}>{t(`channels.tags.${tag}`)}</span>}
              <span className={s.moreCell}>
                {manage && !me && theirs !== 'owner' && (
                  <RowMenu label={t('channels.more', { name: person.name })}>
                    <MenuItem icon={<BubbleIcon size={16} strokeWidth={1.9} />} onSelect={() => void message(person.id).catch(() => {})}>
                      {t('people.message')}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<XIcon />} className={s.danger} onSelect={() => void remove(person.id).catch(() => {})}>
                      {t('channels.removeFrom', { name: channel.name })}
                    </MenuItem>
                  </RowMenu>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RowMenu({ label, children, up }: { label: string; children: ReactNode; up?: boolean }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton size={30} label={label} icon={<MoreIcon />} />
      </MenuTrigger>
      <MenuContent align="end" side={up ? 'top' : 'bottom'} width={264} aria-label={label}>
        {children}
      </MenuContent>
    </Menu>
  );
}

function Settings({ channel, onArchive }: { channel: Channel; onArchive: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const [level, setLevel] = useState<NotifyLevel>(() => store.notifyLevel(channel.id));
  const levels: [NotifyLevel, string][] = [
    ['all', t('channels.notifyAll')],
    ['mentions', t('channels.notifyMentions')],
    ['none', t('channels.notifyOff')],
  ];
  const pick = (next: NotifyLevel) => {
    const prev = level;
    setLevel(next);
    store.setNotifyLevel(channel.id, next).catch(() => setLevel(prev));
  };
  return (
    <div className={s.settingsPanel}>
      {channel.manageable && <NameField channel={channel} />}
      <div>
        <div id="channel-notify" className={s.fieldLabel}>
          {t('channels.notifications')}
        </div>
        <div role="radiogroup" aria-labelledby="channel-notify" className={s.segments}>
          {levels.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={level === id} className={s.segment} onClick={() => pick(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {channel.manageable && (
        <div className={`${s.box} ${s.actions}`}>
          {channel.archived ? (
            <button type="button" className={s.action} onClick={() => void store.setChannelArchived(channel.id, false).catch(() => {})}>
              <span>
                <UnarchiveIcon />
              </span>
              {t('channels.unarchiveChannel')}
            </button>
          ) : (
            <button type="button" className={`${s.action} ${s.danger}`} onClick={onArchive}>
              <span>
                <ArchiveIcon />
              </span>
              {t('channels.archive')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** RenameChannel: rules as New channel; Save sits in the field once the name differs, Enter saves, Escape puts the old name back. */
function NameField({ channel }: { channel: Channel }) {
  const { t } = useTranslation();
  const store = useStore();
  const joined = useWorkspace((x) => x.channels[channel.spaceId]);
  const [name, setName] = useState(channel.name);
  const [known, setKnown] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [was, setWas] = useState(channel.name);

  // Renamed elsewhere (or just now): the field follows unless I'm mid-edit.
  if (was !== channel.name) {
    if (name.trim() === was || name.trim() === channel.name) setName(channel.name);
    setWas(channel.name);
  }

  useEffect(() => {
    let live = true;
    store.browseChannels(channel.spaceId).then(
      (list) => live && setKnown(list.filter((c) => c.id !== channel.id).map((c) => c.name)),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, channel.spaceId, channel.id]);

  const clean = name.trim().replace(/-+$/, '');
  const changed = !!clean && clean !== channel.name;
  const taken = changed && [...(joined ?? []).filter((c) => c.id !== channel.id).map((c) => c.name), ...known, ...rejected].some((n) => n.toLowerCase() === clean);
  const error = changed && !taken && failed === clean;

  const save = async () => {
    if (!changed || taken || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await store.renameChannel(channel.id, clean);
      setName(clean);
      setSaved(true);
    } catch (e) {
      if (e instanceof Error && e.message === 'name-taken') setRejected((r) => [...r, clean]);
      else setFailed(clean);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label htmlFor="channel-name" className={s.fieldLabel}>
        {t('channels.name')}
      </label>
      <div className={[s.rnField, changed && s.rnChanged, taken && s.invalid].filter(Boolean).join(' ')}>
        <span className={s.nameIcon}>{channel.private ? <LockIcon size={16} strokeWidth={2.1} /> : <HashIcon size={16} strokeWidth={2.1} />}</span>
        <input
          id="channel-name"
          className={s.spNameInput}
          autoComplete="off"
          maxLength={80}
          aria-invalid={taken || undefined}
          aria-describedby="channel-name-msg"
          value={name}
          onChange={(e) => {
            setName(channelSlug(e.target.value));
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if (isImeEnter(e)) {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape' && changed) {
              e.preventDefault();
              e.stopPropagation();
              setName(channel.name);
            }
          }}
        />
        {changed && !taken && (
          <Button className={s.rnSave} disabled={busy} onClick={() => void save()}>
            {error ? t('channels.retry') : t('channels.save')}
          </Button>
        )}
        {saved && !changed && (
          <span className={s.rnDone}>
            <CheckIcon size={17} />
          </span>
        )}
      </div>
      {(taken || error) && (
        <p id="channel-name-msg" role="alert" className={s.error}>
          <AlertIcon />
          {taken ? t('channels.taken', { name: clean }) : t('channels.renameFailed', { name: channel.name })}
        </p>
      )}
    </div>
  );
}

function ArchiveDialog({ open, channel, onCancel, onArchive }: { open: boolean; channel: Channel; onCancel: () => void; onArchive: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const faces = store.members(channel.id).slice(0, 4);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      role="alertdialog"
      width={440}
      top={168}
      title={t('channels.archiveTitle', { name: channel.name })}
      closeLabel={t('people.close')}
      bodyClassName={s.spConfirmBody}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onCancel}>
            {t('people.cancel')}
          </Button>
          <Button variant="danger" onClick={onArchive}>
            {t('channels.archiveButton')}
          </Button>
        </>
      }
    >
      <div className={`${s.spCard} ${s.spCardRow}`}>
        <span className={s.browseIcon}>{channel.private ? <LockIcon size={17} strokeWidth={2} /> : <HashIcon size={17} strokeWidth={2} />}</span>
        <span className={s.spCardName}>{channel.name}</span>
        <span className={s.spPile}>
          {faces.map((p) => (
            <Face key={p.id} person={p} size={26} className={s.spPileFace} />
          ))}
        </span>
      </div>
    </Dialog>
  );
}

function LeaveDialog({ open, channel, onCancel, onLeave }: { open: boolean; channel: Channel; onCancel: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      role="alertdialog"
      width={440}
      top={168}
      title={
        <span className={s.detailsTitle}>
          {channel.private ? <LockIcon size={20} strokeWidth={2.1} /> : <HashIcon size={20} strokeWidth={2.1} />}
          <span>{t('channels.leaveTitle', { name: channel.name })}</span>
        </span>
      }
      closeLabel={t('people.close')}
      bodyClassName={s.confirmGap}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onCancel}>
            {t('people.cancel')}
          </Button>
          <Button variant="danger" onClick={onLeave}>
            {t('channels.leaveButton')}
          </Button>
        </>
      }
    >
      <span />
    </Dialog>
  );
}
