// Light multiplayer on boards (D-37; BoardsLive, BoardsLiveIssue): what other people are doing, in their avatar colour.
// One presence handle per project room, shared by the board and the issue panel; each tab sends one hint at a time.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Trans } from 'react-i18next';
import { formatList } from '../../app/format';
import { useStore, useWorkspace, type DocsBoards, type Issue, type Person, type Presence, type Project } from '../../matrix';
import { avatarColor, DropLine, isImeEnter } from '../../ui';
import { faceStyle, faceText } from './parts';
import b from './Boards.module.css';
import s from './Live.module.css';
import { useT } from './strings';

type What = 'drag' | 'edit' | 'open' | 'typing';
/** `over.before` is the card that ends up directly above (as in moveIssue); none means the top of the column. */
type Hint = { issue?: string; what: What; over?: { column: string; before?: string } };
type Other = { person: Person; hint: Hint };
type Slot = 'drag' | 'panel';
type Room = { id: string; presence: Presence; refs: number; slots: Partial<Record<Slot, Hint | null>>; closing?: ReturnType<typeof setTimeout> };

const GLOW_MS = 1600;
// A move that lands this long after the drag ended still counts as theirs (Matrix can trail the relay).
const MOVED_WITHIN_MS = 6000;
const TYPING_MS = 4000;
// The feature's i18n namespace (strings.ts loads it).
const ns = 'boards' as never;
const WHATS = new Set<string>(['drag', 'edit', 'open', 'typing']);

const rooms = new WeakMap<DocsBoards, Map<string, Room>>();

/** The room's handle, made on first use; it closes unless someone holds it (useRoom's effect) within a moment. */
function roomFor(db: DocsBoards, id: string): Room {
  let byId = rooms.get(db);
  if (!byId) rooms.set(db, (byId = new Map()));
  let r = byId.get(id);
  if (!r) {
    byId.set(id, (r = { id, presence: db.presence(id), refs: 0, slots: {} }));
    letGo(db, r);
  }
  return r;
}

// Switching issues or a remount keeps the stream.
function letGo(db: DocsBoards, r: Room) {
  clearTimeout(r.closing);
  r.closing = setTimeout(() => {
    r.presence.close();
    rooms.get(db)?.delete(r.id);
  }, 2000);
}

function hold(db: DocsBoards, r: Room) {
  clearTimeout(r.closing);
  r.refs++;
  return () => {
    if (--r.refs === 0) letGo(db, r);
  };
}

/** The drag wins over the panel: while I drag a card, that's what others see. */
function put(r: Room, slot: Slot, hint: Hint | null) {
  r.slots[slot] = hint;
  r.presence.set(r.slots.drag ?? r.slots.panel ?? null);
}

function parse(d: unknown): Hint | null {
  if (!d || typeof d !== 'object') return null;
  const { issue, what, over } = d as Record<string, unknown>;
  if (typeof what !== 'string' || !WHATS.has(what) || (issue !== undefined && typeof issue !== 'string')) return null;
  let at: Hint['over'];
  if (over && typeof over === 'object') {
    const { column, before } = over as Record<string, unknown>;
    if (typeof column === 'string') at = { column, ...(typeof before === 'string' ? { before } : {}) };
  }
  return { what: what as What, ...(issue ? { issue } : {}), ...(at ? { over: at } : {}) };
}

function useRoom(projectId: string): Room {
  const db = useStore().docsBoards;
  const room = roomFor(db, projectId);
  useEffect(() => hold(db, room), [db, room]);
  return room;
}

/** Everyone else in the room with a hint, without my own tabs. */
function useOthers(room: Room): Other[] {
  const meId = useWorkspace((x) => x.me.id);
  const subscribe = useCallback((cb: () => void) => room.presence.subscribe(cb), [room]);
  const peers = useSyncExternalStore(subscribe, () => room.presence.peers());
  return useMemo(
    () =>
      peers.flatMap((p) => {
        const hint = p.user.id === meId ? null : parse(p.data);
        return hint ? [{ person: p.user, hint }] : [];
      }),
    [peers, meId],
  );
}

const distinct = (list: Other[]) => [...new Map(list.map((o) => [o.person.id, o.person])).values()];

type Deco = { person: Person; kind: 'drag' | 'edit' | 'moved' };
type BoardLive = { cards: Map<string, Deco>; lines: { column: string; after?: string; colour: string }[] };
const BoardContext = createContext<BoardLive>({ cards: new Map(), lines: [] });

function createGlow() {
  let map = new Map<string, Person>();
  const subs = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const emit = () => subs.forEach((f) => f());
  return {
    get: () => map,
    subscribe(cb: () => void) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    add(moved: [string, Person][]) {
      map = new Map([...map, ...moved]);
      emit();
      const timer = setTimeout(() => {
        timers.delete(timer);
        map = new Map([...map].filter(([id]) => !moved.some(([m]) => m === id)));
        emit();
      }, GLOW_MS);
      timers.add(timer);
    },
    stop: () => timers.forEach(clearTimeout),
  };
}

type MyDrag = { id: string; column?: string; index?: number } | null;

/** Around the board: sends my drag, and gives the cards what others are doing. */
export function LiveBoard({ project, issues, drag, children }: { project: Project; issues: Issue[]; drag: MyDrag; children: ReactNode }) {
  const room = useRoom(project.id);
  const others = useOthers(room);

  const mine = useMemo<Hint | null>(() => {
    if (!drag) return null;
    if (!drag.column) return { issue: drag.id, what: 'drag' };
    const before = drag.index ? issues.filter((i) => i.column === drag.column && i.id !== drag.id)[drag.index - 1]?.id : undefined;
    return { issue: drag.id, what: 'drag', over: { column: drag.column, ...(before ? { before } : {}) } };
  }, [drag, issues]);
  useEffect(() => put(room, 'drag', mine), [room, mine]);
  useEffect(() => () => put(room, 'drag', null), [room]);

  // Who was last seen dragging each card: Infinity while they still are, else when they stopped.
  const draggers = useRef(new Map<string, { person: Person; at: number }>());
  useEffect(() => {
    const now = Date.now();
    const dragging = new Set<string>();
    for (const o of others) {
      if (o.hint.what !== 'drag' || !o.hint.issue) continue;
      dragging.add(o.hint.issue);
      draggers.current.set(o.hint.issue, { person: o.person, at: Infinity });
    }
    for (const [id, d] of draggers.current) if (d.at === Infinity && !dragging.has(id)) d.at = now;
  }, [others]);

  // A card that changed place right after someone dragged it glows for a moment.
  const [glow] = useState(createGlow);
  const glowing = useSyncExternalStore(glow.subscribe, glow.get);
  const placed = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const now = Date.now();
    const next = new Map(project.issues.map((i) => [i.id, `${i.column} ${i.order}`]));
    const prev = placed.current;
    placed.current = next;
    if (!prev) return;
    const moved: [string, Person][] = [];
    for (const [id, at] of next) {
      const d = draggers.current.get(id);
      if (d && prev.has(id) && prev.get(id) !== at && (d.at === Infinity || now - d.at < MOVED_WITHIN_MS)) moved.push([id, d.person]);
    }
    for (const [id] of moved) draggers.current.delete(id);
    if (moved.length) glow.add(moved);
  }, [project.issues, glow]);
  useEffect(() => glow.stop, [glow]);

  const value = useMemo<BoardLive>(() => {
    const cards = new Map<string, Deco>();
    const lines: BoardLive['lines'] = [];
    for (const { person, hint } of others) {
      if (hint.what !== 'drag' || !hint.issue) continue;
      if (!cards.has(hint.issue)) cards.set(hint.issue, { person, kind: 'drag' });
      if (hint.over) lines.push({ column: hint.over.column, after: hint.over.before, colour: avatarColor(person.id) });
    }
    for (const [id, person] of glowing) if (!cards.has(id)) cards.set(id, { person, kind: 'moved' });
    for (const { person, hint } of others) if (hint.what === 'edit' && hint.issue && !cards.has(hint.issue)) cards.set(hint.issue, { person, kind: 'edit' });
    return { cards, lines };
  }, [others, glowing]);

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

/** For a card: their outline, lift or glow (inline, so hover and selection don't override it) and their name flag. */
export function useLiveCard(issueId: string): { className: string; style?: CSSProperties; flag: ReactNode } {
  const d = useContext(BoardContext).cards.get(issueId);
  if (!d) return { className: s.card!, flag: null };
  const colour = avatarColor(d.person.id);
  const style: CSSProperties =
    d.kind === 'drag'
      ? { borderColor: colour, boxShadow: 'var(--shadow)', transform: 'translateY(-5px) rotate(-1.5deg)', zIndex: 5 }
      : d.kind === 'edit'
        ? { borderColor: colour, boxShadow: `0 0 0 1px ${colour}` }
        : { borderColor: colour, boxShadow: `0 0 0 4px ${colour}33` };
  return {
    className: [s.card, d.kind === 'drag' && s.lift, d.kind === 'moved' && s.land].filter(Boolean).join(' '),
    style,
    flag: (
      <span aria-hidden="true" className={s.flag} style={{ background: colour }}>
        {d.person.name}
      </span>
    ),
  };
}

/** Where someone else's drag would land: after the card `after`, or at the top of the column. */
export function LiveLines({ column, after }: { column: string; after?: string }) {
  const lines = useContext(BoardContext).lines.filter((l) => l.column === column && l.after === after);
  return lines.map((l, i) => <DropLine key={`${l.colour}${i}`} ring inset={4} colour={l.colour} />);
}

/**
 * For the issue panel's root: says the issue is open, being edited (focus in a field other than the comment box) or
 * that I'm typing a comment (for a few seconds after each keystroke).
 */
export function usePanelLive(projectId: string, issueId: string) {
  const room = useRoom(projectId);
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = (what: What) => {
      clearTimeout(timer);
      put(room, 'panel', { issue: issueId, what });
    };
    const inComment = (t: EventTarget | null) => t instanceof Element && !!t.closest(`.${b.commentDock}, .${b.comment}`);
    const editing = (t: EventTarget | null) =>
      t instanceof Element && !!el?.contains(t) && !inComment(t) && t.matches('textarea, input, [contenteditable="true"]');
    send(editing(document.activeElement) ? 'edit' : 'open');
    if (!el) return () => put(room, 'panel', null);
    const onFocusIn = (e: FocusEvent) => editing(e.target) && send('edit');
    const onFocusOut = (e: FocusEvent) => send(editing(e.relatedTarget) ? 'edit' : 'open');
    const onInput = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.closest(`.${b.commentDock}`) || !t.isContentEditable) return;
      if (!t.textContent?.trim()) return send('open');
      send('typing');
      timer = setTimeout(() => send('open'), TYPING_MS);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isImeEnter(e) && e.target instanceof Element && e.target.closest(`.${b.commentDock}`)) send('open');
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      el.removeEventListener('input', onInput);
      el.removeEventListener('keydown', onKeyDown);
      clearTimeout(timer);
      put(room, 'panel', null);
    };
  }, [room, el, issueId]);
  return setEl;
}

/** Who else has this issue open, in the panel header. */
export function PanelPeers({ projectId, issueId }: { projectId: string; issueId: string }) {
  const others = useOthers(useRoom(projectId));
  const people = distinct(others.filter((o) => o.hint.issue === issueId && o.hint.what !== 'drag')).slice(0, 4);
  if (!people.length) return null;
  return (
    <span className={s.peers}>
      {people.map((p) => (
        <span key={p.id} role="img" aria-label={p.name} title={p.name} className={s.face} style={faceStyle(p)}>
          {faceText(p)}
        </span>
      ))}
    </span>
  );
}

/** "Jonas Berg is typing…" above the comment box. */
export function TypingLine({ projectId, issueId }: { projectId: string; issueId: string }) {
  useT();
  const others = useOthers(useRoom(projectId));
  const people = distinct(others.filter((o) => o.hint.issue === issueId && o.hint.what === 'typing'));
  if (!people.length) return null;
  return (
    <div className={s.typing} role="status">
      <span className={s.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        {people.length === 1 ? (
          <Trans ns={ns} i18nKey={"typing" as never} values={{ name: people[0]!.name }} components={{ b: <strong /> }} />
        ) : (
          <Trans ns={ns} i18nKey={"typingMany" as never} values={{ names: formatList(people.map((p) => p.name)) }} components={{ b: <strong /> }} />
        )}
      </span>
    </div>
  );
}
