// New message (Batch C NewMessage / NewMessageGroup): one dialog for a DM and a group DM.
// Enter adds the highlighted person; Message opens the conversation (an existing DM with exactly these people is reused).
import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, type Person } from '../../matrix';
import { Button, Dialog, isImeEnter } from '../../ui';
import { formatList } from '../format';
import { dmPath } from '../places';
import { firstName } from '../toast';
import { BubbleIcon, SearchIcon, SmallCloseIcon } from '../shell/icons';
import { ExternalCorner, Face } from './Face';
import { useShowExternal } from './names';
import s from './People.module.css';

const NewMessageContext = createContext<() => void>(() => {});

export function useNewMessage(): () => void {
  return useContext(NewMessageContext);
}

export function NewMessageProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(0);
  const start = useMemo(() => () => setOpen((n) => (n > 0 ? n : Math.abs(n) + 1)), []);
  return (
    <NewMessageContext.Provider value={start}>
      {children}
      {/* A fresh dialog each time it opens; negative = closing (keeps the exit animation). */}
      <NewMessageDialog key={Math.abs(open)} open={open > 0} onClose={() => setOpen((n) => -Math.abs(n))} />
    </NewMessageContext.Provider>
  );
}

function NewMessageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const showExternal = useShowExternal();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Person[]>([]);
  const [found, setFound] = useState<Person[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    store.searchPeople(query.trim()).then(
      (list) => {
        if (live) setFound(list);
      },
      () => {
        if (live) setFound([]);
      },
    );
    return () => {
      live = false;
    };
  }, [store, query, open]);

  const rows = found.filter((p) => !chosen.some((c) => c.id === p.id));
  const current = Math.min(active, Math.max(rows.length - 1, 0));

  const add = (p: Person) => {
    setChosen((list) => [...list, p]);
    setQuery('');
    setActive(0);
    input.current?.focus();
  };
  const remove = (id: string) => {
    setChosen((list) => list.filter((p) => p.id !== id));
    input.current?.focus();
  };
  const go = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const id = await store.openDm(chosen.map((p) => p.id));
      onClose();
      navigate(dmPath(id));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) setActive((current + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
    } else if (e.key === 'Backspace' && !query && chosen.length) {
      setChosen((list) => list.slice(0, -1));
    } else if (isImeEnter(e)) {
      e.preventDefault();
      const hit = rows[current];
      if (hit && (query.trim() || !chosen.length)) add(hit);
      else void go();
    }
  };

  const q = query.trim().toLowerCase();
  const listId = 'new-message-people';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('shell.sidebar.newMessage')}
      closeLabel={t('people.close')}
      alert={failed ? t('failed.messageDialog', { name: formatList(chosen.map((p) => firstName(p.name))) }) : undefined}
      footer={
        <>
          <span className={s.footerSpacer} />
          <Button variant="secondary" onClick={onClose}>
            {t('people.cancel')}
          </Button>
          <Button icon={<BubbleIcon size={16} strokeWidth={2} />} disabled={!chosen.length || busy} onClick={() => void go()}>
            {t('people.message')}
          </Button>
        </>
      }
    >
      <div className={s.combo} onClick={() => input.current?.focus()}>
        <span className={s.comboIcon}>
          <SearchIcon />
        </span>
        {chosen.map((p) => (
          <span key={p.id} className={s.chip}>
            <Face person={p} size={20} />
            <span className={s.chipName}>{p.name}</span>
            <button type="button" className={s.chipRemove} aria-label={t('people.remove', { name: p.name })} onClick={() => remove(p.id)}>
              <SmallCloseIcon />
            </button>
          </span>
        ))}
        <input
          ref={input}
          autoFocus
          className={s.query}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={rows[current] ? `${listId}-${current}` : undefined}
          aria-label={t('people.search')}
          placeholder={chosen.length ? undefined : t('people.search')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {rows.length > 0 && (
        <div role="listbox" id={listId} aria-label={t('shell.sidebar.newMessage')} className={s.results}>
          {rows.map((p, i) => {
            const at = q ? p.name.toLowerCase().indexOf(q) : -1;
            return (
              <div
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                className={s.result}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(p)}
              >
                <span className={s.single}>
                  <Face person={p} size={30} />
                  {showExternal && p.external && <ExternalCorner />}
                </span>
                <span className={s.resultName}>
                  {at === 0 ? (
                    <>
                      <span className={s.hit}>{p.name.slice(0, q.length)}</span>
                      <span className={s.rest}>{p.name.slice(q.length)}</span>
                    </>
                  ) : (
                    p.name
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
