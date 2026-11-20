// Add people (AddPeople, AddPeopleMember, AddPeopleClient, AddPeopleErrors): colleagues by name, new people by email.
// Owners/Admins in a workspace channel pick Member or Guest (an outside email is a Guest); a Member adds guests;
// in a client space new people are clients. No shared link: a pending person has their own join link (D-25).
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, useWorkspace, type PendingInvite, type Person } from '../../matrix';
import { Button, Dialog, isImeEnter } from '../../ui';
import { Face } from '../people/Face';
import { SmallCloseIcon } from '../shell/icons';
import s from './Channels.module.css';
import { AlertIcon, CheckIcon, LinkIcon } from './icons';
import { addRoles, type AddRole } from './roles';
import { useChannel, useCopy, useRole, useSpace } from './shared';

type Token = { kind: 'person'; person: Person } | { kind: 'email'; email: string; external: boolean };
type Problem = { who: string; reason: 'invalid-email' | 'other' };

const emailShape = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const keyOf = (tk: Token) => (tk.kind === 'person' ? tk.person.id : tk.email.toLowerCase());

export function AddPeopleDialog({ open, channelId, onClose }: { open: boolean; channelId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const meId = useWorkspace((x) => x.me.id);
  const channel = useChannel(channelId);
  const space = useSpace(channel?.spaceId);
  const roles = addRoles(space, useRole(channel?.spaceId));
  const [tokens, setTokens] = useState<Token[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  const [inChannel, setInChannel] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [picked, setPicked] = useState<AddRole>(roles.includes('member') ? 'member' : (roles[0] ?? 'guest'));
  const [domain, setDomain] = useState(() => meId.split(':')[1] ?? '');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    store.profile(meId).then(
      (p) => live && p.email && setDomain(p.email.split('@')[1] ?? ''),
      () => {},
    );
    store.channelMembers(channelId).then(
      (list) => live && setInChannel(new Set(list.filter((m) => !m.pending).map((m) => m.person.id))),
      () => {},
    );
    store.pendingInvites(channelId).then(
      (list) => live && setPending(list),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [store, meId, channelId]);

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

  if (!channel || !roles.length) return null;

  const bad = (tk: Token) => problems.some((p) => p.who.toLowerCase() === keyOf(tk).toLowerCase());
  const external = tokens.some((tk) => tk.kind === 'email' && tk.external);
  // An outside email is a Guest: Member can't be picked while one is in the list.
  const role: AddRole = roles.length > 1 && external && picked === 'member' ? 'guest' : picked;
  const valid = tokens.filter((tk) => !bad(tk));
  const emailTag = role === 'client' ? t('channels.tags.client') : role === 'guest' ? t('channels.tags.guest') : null;

  const add = (tk: Token) => {
    setTokens((list) => (list.some((x) => keyOf(x) === keyOf(tk)) ? list : [...list, tk]));
    setQuery('');
    input.current?.focus();
  };
  const addEmail = (raw: string) => {
    const email = raw.trim().replace(/[,;]+$/, '');
    if (!email) return;
    if (!emailShape.test(email)) setProblems((p) => [...p, { who: email, reason: 'invalid-email' }]);
    add({ kind: 'email', email, external: email.split('@')[1]?.toLowerCase() !== domain.toLowerCase() });
  };
  const remove = (tk: Token) => {
    setTokens((list) => list.filter((x) => keyOf(x) !== keyOf(tk)));
    setProblems((p) => p.filter((x) => x.who.toLowerCase() !== keyOf(tk).toLowerCase()));
    input.current?.focus();
  };

  const q = query.trim().toLowerCase();
  const people = found.filter((p) => p.id !== meId).slice(0, q ? 5 : 3);
  const pendingRows = pending.filter((p) => !q || `${p.name ?? ''} ${p.email}`.toLowerCase().includes(q));

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
        const hit = people.find((p) => !inChannel.has(p.id));
        if (hit) add({ kind: 'person', person: hit });
      }
    } else if (e.key === 'Backspace' && !query && tokens.length) {
      remove(tokens[tokens.length - 1]!);
    }
  };

  const submit = async () => {
    if (!valid.length || busy) return;
    setBusy(true);
    try {
      const userIds = valid.flatMap((tk) => (tk.kind === 'person' ? [tk.person.id] : []));
      const emails = valid.flatMap((tk) => (tk.kind === 'email' ? [tk.email] : []));
      const result = await store.addPeople(channelId, { userIds, emails, role });
      const failed = result.failed.filter((f) => f.reason !== 'already-member');
      if (!failed.length) {
        onClose();
        return;
      }
      const left = new Set(failed.map((f) => f.who.toLowerCase()));
      setTokens((list) => list.filter((tk) => left.has(keyOf(tk).toLowerCase())));
      setProblems(failed.map((f) => ({ who: f.who, reason: f.reason === 'invalid-email' ? 'invalid-email' : 'other' })));
    } catch {
      setProblems(valid.map((tk) => ({ who: keyOf(tk), reason: 'other' })));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (who: string) => {
    const tk = tokens.find((x) => keyOf(x).toLowerCase() === who.toLowerCase());
    return tk?.kind === 'person' ? tk.person.name : who;
  };
  const problem = problems[0];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('channels.addTo', { name: channel.name })}
      closeLabel={t('people.close')}
      bodyClassName={s.addBody}
      footer={
        <>
          <span className={s.spacer} />
          <Button variant="secondary" onClick={onClose}>
            {t('people.cancel')}
          </Button>
          <Button disabled={!valid.length || busy} onClick={() => void submit()}>
            {valid.length ? t('channels.addCount', { count: valid.length }) : t('common.addPeople')}
          </Button>
        </>
      }
    >
      <div className={s.tokens} onClick={() => input.current?.focus()}>
        {tokens.map((tk) => {
          const isBad = bad(tk);
          const label = tk.kind === 'person' ? tk.person.name : tk.email;
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
              {tk.kind === 'email' && !isBad && emailTag && <span className={s.tokenTag}>{emailTag}</span>}
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
      {problem && (
        <p role="alert" className={s.error}>
          <AlertIcon />
          {problem.reason === 'invalid-email' ? t('channels.notEmail', { email: problem.who }) : t('channels.couldNotAdd', { name: nameOf(problem.who) })}
        </p>
      )}
      <ul className={s.suggestions} aria-label={t('channels.suggestions')}>
        {people.map((p) => {
          const status = inChannel.has(p.id) ? t('channels.inChannel') : tokens.some((tk) => keyOf(tk) === p.id) ? t('channels.added') : null;
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
        {pendingRows.map((p) => (
          <PendingRow key={p.code} invite={p} />
        ))}
      </ul>
      {roles.length > 1 ? (
        <div className={s.roles}>
          <div role="group" aria-label={t('channels.role')} className={s.segments}>
            {roles.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={role === id}
                disabled={id === 'member' && external}
                className={`${s.segment} ${s.tall}`}
                onClick={() => setPicked(id)}
              >
                {t(`channels.roles.${id}`)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={s.noRoles} />
      )}
    </Dialog>
  );
}

function PendingRow({ invite }: { invite: PendingInvite }) {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  const name = invite.name ?? invite.email;
  return (
    <li className={s.suggestion}>
      <Face person={{ id: invite.email, name }} size={30} />
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
