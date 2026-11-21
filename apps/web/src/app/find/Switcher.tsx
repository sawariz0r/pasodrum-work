// ⌘K (Switcher, SwitcherResults, SwitcherEmpty; RulesM8): opened by ⌘K / Ctrl K or the header search button.
// Empty: recent conversations. Typed: Channels, Direct messages, People, then always "Search messages for …".
import * as RD from '@radix-ui/react-dialog';
import { createContext, useContext, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { fold, useStore, useWorkspace, type Channel, type Dm, type Person } from '../../matrix';
import { IconButton, isImeEnter, useMenuReturnFocus } from '../../ui';
import { HashIcon, LockIcon } from '../icons';
import { Face, others } from '../people/Face';
import { useDmName } from '../people/names';
import { channelPath, dmPath } from '../places';
import { recentConversations } from '../prefs';
import { useWorkspaceName } from '../channels/shared';
import { SearchIcon } from '../shell/icons';
import { firstName, useToast } from '../toast';
import { highlight } from './highlight';
import s from './Find.module.css';

type Find = { open: () => void; isOpen: boolean };
const FindContext = createContext<Find>({ open: () => {}, isOpen: false });

export function useFind(): Find {
  return useContext(FindContext);
}

export function searchPath(query: string) {
  return `/search?${new URLSearchParams({ q: query })}`;
}

export function FindProvider({ children }: { children: ReactNode }) {
  // A fresh switcher each time it opens; negative = closing (keeps the exit animation).
  const [open, setOpen] = useState(0);
  const value = useMemo(() => ({ open: () => setOpen((n) => (n > 0 ? n : Math.abs(n) + 1)), isOpen: open > 0 }), [open]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setOpen((n) => (n > 0 ? -n : Math.abs(n) + 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <FindContext.Provider value={value}>
      {children}
      <Switcher key={Math.abs(open)} open={open > 0} onClose={() => setOpen((n) => -Math.abs(n))} />
    </FindContext.Provider>
  );
}

/** The search button at the end of every conversation header. */
export function FindButton() {
  const { t } = useTranslation();
  const find = useFind();
  const workspace = useWorkspaceName();
  return (
    <IconButton
      className={s.headButton}
      label={t('find.placeholder', { workspace })}
      aria-haspopup="dialog"
      aria-expanded={find.isOpen}
      icon={<SearchIcon size={18} strokeWidth={1.9} />}
      onClick={find.open}
    />
  );
}

type Option =
  | { kind: 'channel'; key: string; channel: Channel }
  | { kind: 'dm'; key: string; dm: Dm }
  | { kind: 'person'; key: string; person: Person }
  | { kind: 'search'; key: string };

const recentCount = 6;
const perGroup = 5;

function Switcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const workspace = useWorkspaceName();
  const dmName = useDmName();
  const meId = useWorkspace((x) => x.me.id);
  const channels = useWorkspace((x) => x.channels);
  const dms = useWorkspace((x) => x.dms);
  const returnFocus = useMenuReturnFocus(open);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [active, setActive] = useState(0);

  const q = query.trim();
  const needle = fold(q);
  const all = useMemo(() => Object.values(channels).flat().filter((c) => !c.archived), [channels]);

  useEffect(() => {
    if (!open || !q) return;
    let live = true;
    store.searchPeople(q).then(
      (list) => live && setPeople(list),
      () => live && setPeople([]),
    );
    return () => {
      live = false;
    };
  }, [store, q, open]);

  const groups: { id: string; label?: string; options: Option[] }[] = [];
  if (!q) {
    // Recent first, then the newest DMs and the channels, so it's never empty.
    const byId = new Map<string, Option>([
      ...all.map((c) => [c.id, { kind: 'channel', key: c.id, channel: c }] as const),
      ...dms.map((d) => [d.id, { kind: 'dm', key: d.id, dm: d }] as const),
    ]);
    const ids = [...new Set([...recentConversations(), ...dms.map((d) => d.id), ...all.map((c) => c.id)])];
    groups.push({ id: 'recent', options: ids.flatMap((id) => byId.get(id) ?? []).slice(0, recentCount) });
  } else {
    const hit = (name: string) => fold(name).includes(needle);
    const chans = all.filter((c) => hit(c.name)).slice(0, perGroup);
    const convs = dms.filter((d) => hit(dmName(d))).slice(0, perGroup);
    const shown = new Set(convs.filter((d) => others(d, meId).length === 1).map((d) => others(d, meId)[0]!.id));
    const folks = people.filter((p) => p.id !== meId && hit(p.name) && !shown.has(p.id)).slice(0, perGroup);
    if (chans.length) groups.push({ id: 'channels', label: t('find.channels'), options: chans.map((c) => ({ kind: 'channel', key: c.id, channel: c })) });
    if (convs.length) groups.push({ id: 'dms', label: t('find.dms'), options: convs.map((d) => ({ kind: 'dm', key: d.id, dm: d })) });
    if (folks.length) groups.push({ id: 'people', label: t('find.people'), options: folks.map((p) => ({ kind: 'person', key: p.id, person: p })) });
  }
  const options = [...groups.flatMap((g) => g.options), ...(q ? [{ kind: 'search', key: 'search' } as Option] : [])];
  const current = Math.min(active, Math.max(options.length - 1, 0));
  const listId = 'find-options';
  const optionId = (i: number) => `${listId}-${i}`;

  const go = (o: Option) => {
    onClose();
    if (o.kind === 'channel') navigate(channelPath(o.channel.spaceId, o.channel.id));
    else if (o.kind === 'dm') navigate(dmPath(o.dm.id));
    else if (o.kind === 'search') navigate(searchPath(q));
    else
      store.openDm([o.person.id]).then(
        (id) => navigate(dmPath(id)),
        () => toast(t('failed.message', { name: firstName(o.person.name) })),
      );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length) setActive((current + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (isImeEnter(e)) {
      e.preventDefault();
      const o = options[current];
      if (o) go(o);
    }
  };

  const nameOf = (o: Option) =>
    o.kind === 'channel' ? o.channel.name : o.kind === 'dm' ? dmName(o.dm) : o.kind === 'person' ? o.person.name : t('find.searchFor', { query: q });

  const icon = (o: Option) => {
    if (o.kind === 'channel') return o.channel.private ? <LockIcon size={17} strokeWidth={1.9} /> : <HashIcon size={17} strokeWidth={1.9} />;
    if (o.kind === 'search') return <SearchIcon size={17} strokeWidth={1.9} />;
    const list = o.kind === 'dm' ? others(o.dm, meId) : [o.person];
    if (list.length > 1) return <span className={s.count}>{list.length}</span>;
    return list[0] ? <Face person={list[0]} size={26} className={s.face} /> : null;
  };

  let index = -1;
  const row = (o: Option) => {
    const i = ++index;
    return (
      <div
        key={o.key}
        id={optionId(i)}
        role="option"
        aria-selected={i === current}
        className={s.option}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => i !== current && setActive(i)}
        onClick={() => go(o)}
      >
        <span className={s.optionIcon}>{icon(o)}</span>
        <span className={s.optionName}>
          {o.kind === 'search'
            ? nameOf(o)
            : highlight(nameOf(o), q).map((p, k) => (p.hit ? <mark key={k}>{p.text}</mark> : <span key={k}>{p.text}</span>))}
        </span>
      </div>
    );
  };

  const placeholder = t('find.placeholder', { workspace });
  return (
    <RD.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RD.Portal>
        <RD.Overlay className={s.overlay}>
          <RD.Content className={s.switcher} aria-label={placeholder} aria-describedby={undefined} onCloseAutoFocus={returnFocus}>
            <RD.Title className={s.hidden}>{placeholder}</RD.Title>
            <div className={s.inputRow}>
              <SearchIcon size={20} strokeWidth={1.9} />
              <input
                autoFocus
                className={s.input}
                role="combobox"
                aria-expanded={options.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={options.length ? optionId(current) : undefined}
                aria-label={placeholder}
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
              />
            </div>
            {options.length > 0 && (
              <div role="listbox" id={listId} aria-label={placeholder} className={s.list}>
                {groups.map((g, gi) =>
                  g.options.length === 0 ? null : (
                    <div key={g.id} role="group" aria-labelledby={g.label ? `${listId}-${g.id}` : undefined}>
                      {gi > 0 && <div role="separator" className={s.separator} />}
                      {g.label && (
                        <div id={`${listId}-${g.id}`} className={s.groupLabel}>
                          {g.label}
                        </div>
                      )}
                      {g.options.map(row)}
                    </div>
                  ),
                )}
                {q && (
                  <>
                    {groups.length > 0 && <div role="separator" className={s.separator} />}
                    {row({ kind: 'search', key: 'search' })}
                  </>
                )}
              </div>
            )}
          </RD.Content>
        </RD.Overlay>
      </RD.Portal>
    </RD.Root>
  );
}
