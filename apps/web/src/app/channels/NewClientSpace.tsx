// New client space (CreateClientSpace, ClientSpaceCreating, ClientSpaceNameTaken, ClientSpaceCreateError, ClientSpaceCreated).
// Owners and Admins only. Name + colour, the channels to make, the team, the client emails; nothing half-made on failure.
import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useStore, useWorkspace, type Person } from '../../matrix';
import { Button, Dialog, isImeEnter } from '../../ui';
import { ExternalIcon, HashIcon, LogoMark } from '../icons';
import { Face } from '../people/Face';
import { channelPath } from '../places';
import { SmallCloseIcon } from '../shell/icons';
import s from './Channels.module.css';
import { AlertIcon, PlusIcon } from './icons';
import { channelSlug } from './roles';
import { forgetFreshSpace, markFreshSpace, spaceColour, swatches, useWorkspaceName } from './shared';

const defaultChannels = [
  { name: 'project-updates', on: true },
  { name: 'questions', on: true },
  { name: 'design-review', on: false },
];

const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** Adds every valid address in `raw` (comma, space or newline separated) not already there, case-insensitively. */
function addEmails(list: string[], raw: string[]): string[] {
  const next = [...list];
  for (const v of raw) if (isEmail(v) && !next.some((x) => x.toLowerCase() === v.toLowerCase())) next.push(v);
  return next;
}

export function NewClientSpaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const navigate = useNavigate();
  const me = useWorkspace((x) => x.me);
  const spaces = useWorkspace((x) => x.spaces);
  const workspace = useWorkspaceName();
  const [name, setName] = useState('');
  const [colour, setColour] = useState<string>(swatches[0][1]);
  const [channels, setChannels] = useState(defaultChannels);
  const [team, setTeam] = useState<Person[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<'ready' | 'creating' | 'error'>('ready');
  const [rejected, setRejected] = useState<string[]>([]);
  const [draftChecked, setDraftChecked] = useState(false);

  const clean = name.trim();
  const lower = clean.toLowerCase();
  const taken = !!clean && (spaces.some((sp) => sp.kind === 'client' && sp.name.trim().toLowerCase() === lower) || rejected.includes(lower));
  const chosen = channels.filter((c) => c.on).map((c) => c.name);
  const creating = phase === 'creating';
  // A leftover address that isn't one keeps Create off instead of vanishing on Create.
  const badDraft = !!draft.trim() && !isEmail(draft.trim());
  const ok = !!clean && !taken && chosen.length > 0 && !badDraft && !creating;
  const initial = (Array.from(clean)[0] ?? '?').toUpperCase();
  const others = spaces.filter((sp) => sp.kind === 'client').slice(0, 1);

  /** Turns what's typed or pasted into chips; whatever isn't an address stays in the field. */
  const takeDraft = (value: string, all: boolean) => {
    const parts = value.split(/[\s,;]+/);
    const rest = all ? parts.filter((p) => p && !isEmail(p)) : [...parts.slice(0, -1).filter((p) => p && !isEmail(p)), parts.at(-1) ?? ''];
    const done = all ? parts : parts.slice(0, -1);
    setClients((list) => addEmails(list, done));
    setDraft(rest.join(' '));
  };

  const create = async () => {
    if (!ok) return;
    const emails = addEmails(clients, [draft.trim()]);
    setClients(emails);
    setDraft('');
    setPhase('creating');
    // Marked before the store resolves: the tile mounts as soon as the space is in the snapshot.
    markFreshSpace(clean);
    try {
      const made = await store.createClientSpace({ name: clean, colour, channels: chosen, team: team.map((p) => p.id), clientEmails: emails });
      onClose();
      navigate(channelPath(made.spaceId, made.channelId));
    } catch (e) {
      forgetFreshSpace(clean);
      if (e instanceof Error && e.message === 'name-taken') {
        setRejected((r) => [...r, lower]);
        setPhase('ready');
      } else setPhase('error');
    }
  };

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isImeEnter(e) || (e.key === ',' && !e.nativeEvent.isComposing)) {
      e.preventDefault();
      takeDraft(draft, true);
      setDraftChecked(true);
    } else if (e.key === 'Backspace' && !draft && clients.length) setClients(clients.slice(0, -1));
  };
  const close = () => {
    if (!creating) onClose();
  };

  const preview = { '--tile-bg': colour } as CSSProperties;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t('spaces.newClientSpace')}
      closeLabel={t('people.close')}
      width={720}
      top={88}
      busy={creating}
      bodyClassName={s.csBody}
      aside={
        <div className={s.csAside} aria-hidden="true">
          <span className={s.csTile} style={{ '--tile-bg': '#0E7C66' } as CSSProperties}>
            <LogoMark />
          </span>
          {others.map((sp) => (
            <span key={sp.id} className={`${s.csTile} ${s.csDim}`} style={{ '--tile-bg': spaceColour(sp) } as CSSProperties}>
              {(Array.from(sp.name.trim())[0] ?? '').toUpperCase()}
            </span>
          ))}
          <span className={s.csPreview} style={preview}>
            {initial}
            <span className={s.csPreviewCorner}>
              <ExternalIcon size={10} />
            </span>
          </span>
        </div>
      }
      footer={
        <>
          {phase === 'error' ? (
            <span role="alert" className={s.csFail}>
              <AlertIcon />
              <span>{t('spaces.failed', { name: clean })}</span>
            </span>
          ) : (
            <span className={s.spacer} />
          )}
          <Button variant="secondary" disabled={creating} onClick={close}>
            {t('people.cancel')}
          </Button>
          <Button
            className={creating ? s.csCreating : undefined}
            disabled={!ok && !creating}
            aria-disabled={creating || undefined}
            onClick={() => void create()}
          >
            {creating ? (
              <>
                <span className={s.dots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className={s.visuallyHidden}>{t('spaces.creating')}</span>
              </>
            ) : phase === 'error' ? (
              t('spaces.retry')
            ) : (
              t('spaces.create')
            )}
          </Button>
        </>
      }
    >
      <div className={[s.csFields, creating && s.csBusy].filter(Boolean).join(' ')}>
        <div>
          <div className={s.csNameRow}>
            <input
              className={[s.csName, taken && s.csNameTaken].filter(Boolean).join(' ')}
              autoFocus
              autoComplete="off"
              maxLength={80}
              aria-label={t('spaces.clientName')}
              aria-invalid={taken || undefined}
              placeholder={t('spaces.clientName')}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (phase === 'error') setPhase('ready');
              }}
              onKeyDown={(e) => {
                if (isImeEnter(e)) {
                  e.preventDefault();
                  void create();
                }
              }}
            />
            <Swatches label={t('spaces.color')} value={colour} onPick={setColour} size={28} />
          </div>
          {taken && (
            <p role="alert" className={s.csTaken}>
              <AlertIcon />
              {t('spaces.taken', { name: clean })}
            </p>
          )}
        </div>

        <ChannelChips channels={channels} onChange={setChannels} />

        <div role="group" aria-label={t('spaces.fromPasodrum', { workspace })} className={s.csGroup}>
          <span className={s.csGroupTile} style={{ '--tile-bg': '#0E7C66' } as CSSProperties} aria-hidden="true">
            <LogoMark size={18} />
          </span>
          <TeamPicker me={me} team={team} onChange={setTeam} workspace={workspace} />
        </div>

        <div>
        <div role="group" aria-label={t('spaces.fromClient')} className={s.csGroup}>
          <span className={s.csGroupTile} style={preview} aria-hidden="true">
            {initial}
          </span>
          <div className={[s.csBox, draftChecked && badDraft && s.csBoxBad].filter(Boolean).join(' ')}>
            {clients.map((email) => (
              <span key={email} className={s.csChip}>
                {email}
                <button type="button" className={s.csChipX} aria-label={t('spaces.remove', { name: email })} onClick={() => setClients(clients.filter((x) => x !== email))}>
                  <SmallCloseIcon />
                </button>
              </span>
            ))}
            <input
              className={s.csInput}
              type="text"
              inputMode="email"
              autoComplete="off"
              aria-label={t('spaces.clientEmail')}
              aria-invalid={(draftChecked && badDraft) || undefined}
              placeholder={t('spaces.clientEmail')}
              value={draft}
              onChange={(e) => {
                setDraftChecked(false);
                if (/[\s,;]/.test(e.target.value.trim())) takeDraft(e.target.value, false);
                else setDraft(e.target.value);
              }}
              onKeyDown={onDraftKey}
              // A text field drops line breaks, so a pasted list is split before it lands.
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (!/[\s,;]/.test(text.trim())) return;
                e.preventDefault();
                setDraftChecked(false);
                takeDraft(`${draft}${text}`, false);
              }}
              onBlur={() => {
                takeDraft(draft, true);
                setDraftChecked(true);
              }}
            />
          </div>
        </div>
        {draftChecked && badDraft && (
          <p role="alert" className={`${s.csTaken} ${s.csIndent}`}>
            <AlertIcon />
            {t('channels.notEmail', { email: draft.trim() })}
          </p>
        )}
        </div>
      </div>
    </Dialog>
  );
}

/** Five colour swatches as a radio group (CreateClientSpace, SpaceSettings). */
export function Swatches({ label, value, onPick, size, labelledBy }: { label?: string; value: string; onPick: (hex: string) => void; size: 28 | 30; labelledBy?: string }) {
  const { t } = useTranslation();
  const at = swatches.findIndex(([, hex]) => hex.toLowerCase() === value.toLowerCase());
  // A radio group: one tab stop, arrows move and pick.
  const move = (e: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (from + step + swatches.length) % swatches.length;
    onPick(swatches[next]![1]);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={s.swatches}>
      {swatches.map(([id, hex], i) => (
        <button
          key={id}
          type="button"
          role="radio"
          tabIndex={i === (at < 0 ? 0 : at) ? 0 : -1}
          onKeyDown={(e) => move(e, i)}
          aria-checked={value.toLowerCase() === hex.toLowerCase()}
          aria-label={t(`spaces.swatches.${id}`)}
          className={[s.swatch, size === 30 && s.swatchLg].filter(Boolean).join(' ')}
          style={{ '--swatch': hex } as CSSProperties}
          onClick={() => onPick(hex)}
        />
      ))}
    </div>
  );
}

function ChannelChips({ channels, onChange }: { channels: { name: string; on: boolean }[]; onChange: (next: { name: string; on: boolean }[]) => void }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<string | null>(null);
  const commit = () => {
    const name = (adding ?? '').trim().replace(/-+$/, '');
    if (name && !channels.some((c) => c.name === name)) onChange([...channels, { name, on: true }]);
    setAdding(null);
  };
  return (
    <div role="group" aria-label={t('spaces.channels')} className={s.csChannels}>
      {channels.map((c) => (
        <button
          key={c.name}
          type="button"
          aria-pressed={c.on}
          className={s.csChannel}
          onClick={() => onChange(channels.map((x) => (x.name === c.name ? { ...x, on: !x.on } : x)))}
        >
          <HashIcon size={14} strokeWidth={2.2} />
          {c.name}
        </button>
      ))}
      {adding === null ? (
        <button type="button" className={s.csAddChannel} aria-label={t('spaces.addChannel')} onClick={() => setAdding('')}>
          <PlusIcon size={15} />
        </button>
      ) : (
        <span className={`${s.csChannel} ${s.csChannelEdit}`}>
          <HashIcon size={14} strokeWidth={2.2} />
          <input
            autoFocus
            data-claims-escape=""
            className={s.csChannelInput}
            maxLength={80}
            aria-label={t('spaces.channelName')}
            value={adding}
            onChange={(e) => setAdding(channelSlug(e.target.value))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (isImeEnter(e)) {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                setAdding(null);
              }
            }}
          />
        </span>
      )}
    </div>
  );
}

function TeamPicker({ me, team, onChange, workspace }: { me: Person; team: Person[]; onChange: (next: Person[]) => void; workspace: string }) {
  const { t } = useTranslation();
  const store = useStore();
  const [query, setQuery] = useState<string | null>(null);
  const [found, setFound] = useState<Person[]>([]);
  const [hi, setHi] = useState(0);

  useEffect(() => {
    if (query === null) return;
    let live = true;
    store.searchPeople(query.trim()).then(
      (list) => live && setFound(list),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [store, query]);

  const options = query === null ? [] : found.filter((p) => !p.external && p.id !== me.id && !team.some((x) => x.id === p.id)).slice(0, 5);
  const pick = (p: Person) => {
    onChange([...team, p]);
    setQuery('');
    setHi(0);
  };

  return (
    <div className={s.csBox}>
      <span className={s.csChip}>
        <Face person={me} size={20} />
        {me.name}
      </span>
      {team.map((p) => (
        <span key={p.id} className={s.csChip}>
          <Face person={p} size={20} />
          {p.name}
        </span>
      ))}
      {query === null ? (
        <button type="button" className={s.csAddPerson} aria-label={t('spaces.addFromPasodrum', { workspace })} onClick={() => setQuery('')}>
          <PlusIcon size={15} />
        </button>
      ) : (
        <span className={s.csFind}>
          <input
            autoFocus
            data-claims-escape=""
            className={s.csInput}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={options.length > 0}
            aria-controls={options.length ? 'cs-team-options' : undefined}
            aria-activedescendant={options[hi] ? `cs-team-${hi}` : undefined}
            aria-label={t('spaces.addFromPasodrum', { workspace })}
            placeholder={t('spaces.findPerson')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHi(0);
            }}
            onBlur={() => setQuery(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (options.length) setHi((hi + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
              } else if (isImeEnter(e)) {
                e.preventDefault();
                const p = options[hi];
                if (p) pick(p);
              } else if (e.key === 'Escape') {
                setQuery(null);
              } else if (e.key === 'Backspace' && !query && team.length) onChange(team.slice(0, -1));
            }}
          />
          {options.length > 0 && (
            <ul id="cs-team-options" role="listbox" className={s.csOptions}>
              {options.map((p, i) => (
                <li
                  key={p.id}
                  id={`cs-team-${i}`}
                  role="option"
                  aria-selected={i === hi}
                  className={s.csOption}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(p)}
                >
                  <Face person={p} size={20} />
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </span>
      )}
    </div>
  );
}
