// The Assistant's conversation (spec §7): in this tab's memory only, keyed by the signed-in person. Cleared on sign-out, on
// Start over, and when the panel opens on a later local day. A running ask carries on while the panel is closed.
import { useSyncExternalStore } from 'react';
import type { ScreenContext } from '../../app/registry';
import { closeAssistant, openAssistant } from '../../app/rightPanel';
import { onSignedOut } from '../../app/signOut';
import type { Answer, AskContext, AssistantRequest, AssistantStatusLine, Can, Depth, HistoryTurn, Lang, Ref, SearchHit, Status, WorkspaceStore } from '../../matrix';
import { LIMITS } from '../../matrix/assistantWire';

export type MessageRef = Extract<Ref, { k: 'message' }>;

/** What this panel can draw (slice 1). */
export const CAN: Can = { parts: ['message', 'open'], proposals: [], views: [] };

export interface Chip {
  kind: 'channel' | 'message';
  /** The channel's name, or the message's sender. */
  name: string;
  ts?: number;
  context: AskContext;
  /** The screen under the chip: × lasts until it changes. */
  screen: string;
}

export interface Turn {
  id: number;
  ask: string;
  /** The chip's label when it was asked; a divider names it when it changes. */
  label: string | null;
  request: AssistantRequest;
  state: 'working' | 'answered' | 'stopped' | 'failed' | 'limited';
  status?: AssistantStatusLine;
  closer?: boolean;
  answer?: Answer;
  rows?: SearchHit[];
  /** While Look closer runs: the quick answer, put back if it is stopped. */
  before?: { answer: Answer; rows: SearchHit[] };
}

export interface Session {
  user: string;
  /** The local date the conversation belongs to. */
  day: string;
  turns: Turn[];
  depth: Depth;
  draft: string;
  limit?: 'day' | 'month';
  selection?: { ref: MessageRef; name: string; ts: number };
  dismissed?: string;
  /** An answer landed while the panel was closed. */
  dot: boolean;
}

export interface State {
  session: Session;
  status: { user: string; value: Status | null } | null;
  screens: ScreenContext[];
}

export const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const fresh = (user: string, now = new Date()): Session => ({ user, day: localDay(now), turns: [], depth: 'quick', draft: '', dot: false });

let state: State = { session: fresh(''), status: null, screens: [] };
const screens = new Map<string, ScreenContext>();
const listeners = new Set<() => void>();
let running: { turn: number; ctrl: AbortController } | null = null;
let visible = false;
let nextId = 1;
let fetching: string | null = null;
let returnTo: Element | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
const setSession = (session: Session) => set({ session });
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getState = () => state;
export const useAssistantState = (): State => useSyncExternalStore(subscribe, () => state);
/** A slice of the state; `pick` returns a primitive or a stable reference. */
export const useAssistant = <T>(pick: (s: State) => T): T => useSyncExternalStore(subscribe, () => pick(state));

/** This person's conversation (an empty one when the stored one belongs to someone else). */
export const sessionOf = (s: State, user: string) => (s.session.user === user ? s.session : fresh(user));
export const statusOf = (s: State, user: string) => (s.status?.user === user ? s.status.value : null);
export const isRunning = () => running !== null;

function abort() {
  const r = running;
  running = null;
  r?.ctrl.abort();
}

function edit(user: string, f: (s: Session) => Session) {
  if (state.session.user !== user) abort();
  setSession(f(sessionOf(state, user)));
}

function patch(id: number, f: (t: Turn) => Turn) {
  const s = state.session;
  setSession({ ...s, turns: s.turns.map((t) => (t.id === id ? f(t) : t)) });
}

export function reset(user: string, now = new Date()) {
  abort();
  setSession(fresh(user, now));
}

/** The panel opened: a conversation from an earlier local day starts empty, never in the middle of use. */
export function opened(user: string, now = new Date()) {
  visible = true;
  const s = state.session;
  if (s.user !== user || s.day !== localDay(now)) reset(user, now);
  else if (s.dot) setSession({ ...s, dot: false });
}

export function closed() {
  visible = false;
}

onSignedOut(() => {
  abort();
  screens.clear();
  fetching = null;
  set({ session: fresh(''), status: null, screens: [] });
});

/**
 * The last six turns, each ask with its answer's sentence and sources; a turn that used sealed text is left out.
 * The oldest turns go first when the whole would pass the server's caps (it refuses a hello over them).
 */
export function historyOf(turns: readonly Turn[]): HistoryTurn[] {
  const all = turns
    .filter((t) => t.state === 'answered' && t.answer && !t.answer.usedSealed)
    .slice(-LIMITS.historyTurns)
    .map((t) => ({ ask: t.ask, say: t.answer!.say, sources: t.answer!.parts.flatMap((p) => (p.t === 'source' ? [p.target] : [])) }));
  const size = (h: HistoryTurn[]) => h.reduce((n, t) => n + t.ask.length + t.say.length, 0);
  const refs = (h: HistoryTurn[]) => h.reduce((n, t) => n + t.sources.length, 0);
  while (all.length && (size(all) > LIMITS.historyChars || refs(all) > LIMITS.historyRefs)) all.shift();
  return all;
}

// Screens report what they show (one entry per mounted screen).
export function reportScreen(id: string, ctx: ScreenContext | null) {
  if (ctx) screens.set(id, ctx);
  else if (!screens.delete(id)) return;
  set({ screens: [...screens.values()] });
}

const roomOf = (ctx: ScreenContext) => {
  const r = ctx.refs[0];
  return r && 'room' in r ? r.room : undefined;
};

/** The chip: the selected message, else the channel on screen. Other kinds of screen come with a later task. */
export function chipOf(s: Session, list: readonly ScreenContext[]): Chip | null {
  const channel = list.findLast((c) => c.kind === 'channel' && !c.closed && c.refs.length > 0);
  if (!channel) return null;
  const screen = JSON.stringify(channel.refs);
  const base = { kind: channel.kind, layer: channel.layer, refs: channel.refs };
  const sel = s.selection;
  if (sel && sel.ref.room === roomOf(channel)) return { kind: 'message', name: sel.name, ts: sel.ts, screen, context: { ...base, selection: sel.ref } };
  if (s.dismissed === screen) return null;
  return { kind: 'channel', name: channel.label, screen, context: { ...base, ...(channel.newest ? { newest: channel.newest } : {}) } };
}

export const setDraft = (user: string, draft: string) => edit(user, (s) => ({ ...s, draft }));
export const setDepth = (user: string, depth: Depth) => edit(user, (s) => ({ ...s, depth }));
export const select = (user: string, selection: NonNullable<Session['selection']>) => edit(user, (s) => ({ ...s, selection, dismissed: undefined }));
/** × on the chip: the next ask starts from everywhere; the next screen brings a chip back. */
export const removeChip = (user: string, chip: Chip) => edit(user, (s) => ({ ...s, selection: undefined, dismissed: chip.screen }));

export function ask(store: WorkspaceStore, user: string, o: { text: string; chip: Chip | null; label: string | null; lang: Lang; thoroughOk: boolean }) {
  const text = o.text.trim().slice(0, LIMITS.ask);
  if (!text || running) return;
  const s = sessionOf(state, user);
  const request: AssistantRequest = {
    ask: text,
    lang: o.lang,
    tz: Math.min(LIMITS.tzMax, Math.max(LIMITS.tzMin, -new Date().getTimezoneOffset())),
    depth: s.depth === 'thorough' && o.thoroughOk ? 'thorough' : 'quick',
    context: o.chip?.context ?? null,
    history: historyOf(s.turns),
    can: CAN,
  };
  const turn: Turn = { id: nextId++, ask: text, label: o.label, request, state: 'working' };
  edit(user, (x) => ({ ...x, turns: [...x.turns, turn], draft: '' }));
  void run(store, user, turn.id, request);
}

/** Look closer: the same ask again, thorough, replacing the answer in place. */
export function lookCloser(store: WorkspaceStore, user: string, id: number) {
  const t = state.session.turns.find((x) => x.id === id);
  if (running || !t?.answer || state.session.user !== user) return;
  const request: AssistantRequest = { ...t.request, depth: 'thorough', closer: true };
  patch(id, (x) => ({ ...x, state: 'working', closer: true, status: undefined, request, before: { answer: x.answer!, rows: x.rows ?? [] } }));
  void run(store, user, id, request);
}

export function retry(store: WorkspaceStore, user: string, id: number) {
  const t = state.session.turns.find((x) => x.id === id);
  if (running || !t || state.session.user !== user) return;
  patch(id, (x) => ({ ...x, state: 'working', status: undefined }));
  void run(store, user, id, t.request);
}

/** Stop: a Look closer puts the quick answer back; an ask shows "Stopped." and returns to the box. */
export function stop() {
  const r = running;
  if (!r) return;
  abort();
  const t = state.session.turns.find((x) => x.id === r.turn);
  if (!t) return;
  if (t.before) {
    const { answer, rows } = t.before;
    patch(t.id, (x) => ({ ...x, state: 'answered', answer, rows, before: undefined, closer: false, status: undefined }));
  } else {
    patch(t.id, (x) => ({ ...x, state: 'stopped', status: undefined }));
    setSession({ ...state.session, draft: t.ask });
  }
}

async function run(store: WorkspaceStore, user: string, id: number, request: AssistantRequest) {
  const ctrl = new AbortController();
  running = { turn: id, ctrl };
  const alive = () => running?.ctrl === ctrl && state.session.user === user && state.session.turns.some((t) => t.id === id);
  try {
    const answer = await store.assistantAsk(request, {
      signal: ctrl.signal,
      onStatus: (status) => {
        if (alive()) patch(id, (t) => ({ ...t, status }));
      },
    });
    const refs = answer.parts.flatMap((p) => (p.t === 'source' && p.target.k === 'message' ? [p.target] : []));
    const rows = refs.length ? await store.messagesByRef(refs).catch(() => []) : [];
    if (!alive()) return;
    running = null;
    patch(id, (t) => ({ id: t.id, ask: t.ask, label: t.label, request: t.request, state: 'answered', answer, rows }));
    if (!visible) setSession({ ...state.session, dot: true });
    refreshStatus(store, user);
  } catch (e) {
    if (!alive()) return;
    running = null;
    const reason = e instanceof Error ? e.message : 'failed';
    if (reason === 'day-limit' || reason === 'month-limit') {
      patch(id, (t) =>
        t.before ? { ...t, state: 'answered', answer: t.before.answer, rows: t.before.rows, before: undefined, closer: false, status: undefined } : { ...t, state: 'limited', status: undefined },
      );
      setSession({ ...state.session, limit: reason === 'day-limit' ? 'day' : 'month' });
    } else {
      patch(id, (t) => ({ ...t, state: 'failed', status: undefined }));
      if (reason === 'not-allowed') refreshStatus(store, user);
    }
  }
}

/** Asked when the workspace mounts (the first header button) and again after each answer. */
export function ensureStatus(store: WorkspaceStore, user: string) {
  if (!user || state.status?.user === user || fetching === user) return;
  refreshStatus(store, user);
}

export function refreshStatus(store: WorkspaceStore, user: string) {
  fetching = user;
  store
    .assistantStatus()
    .catch(() => null)
    .then((value) => {
      if (fetching !== user) return;
      fetching = null;
      set({ status: { user, value } });
    });
}

/** Opening remembers where focus was, so closing from inside can put it back. */
export function open() {
  if (!visible) returnTo = document.activeElement;
  openAssistant();
}

export function toggle() {
  if (visible) closeAssistant();
  else open();
}

export function takeReturnFocus(): Element | null {
  const r = returnTo;
  returnTo = null;
  return r;
}
