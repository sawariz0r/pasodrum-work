// Other people's carets and selections on a page (D-37, DB-04; DocsPage, rules "Together" and "Motion"). The awareness
// travels over the presence relay (matrix/docsBoards.ts bridges it). y-tiptap places a zero-width anchor where each
// caret is; the visible caret and its name flag live in an overlay, so they can glide (120 ms) instead of jumping.
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Extension, type AnyExtension } from '@tiptap/react';
import { yCursorPluginKey } from '@tiptap/y-tiptap';
import type { PageSession, Person } from '../../matrix';
import { avatarColor } from '../../ui';
import s from './Carets.module.css';

/** The name flag fades after this long without the caret moving. */
const STILL_MS = 3000;

/** `name`, `userId` and `id` are stamped by the bridge from the relay's own record of who sent it, never the peer's word. */
type CaretUser = { name: string; userId: string; id: string };

const colorOf = (user: Record<string, unknown>) => (typeof user.userId === 'string' && user.userId ? avatarColor(user.userId) : 'transparent');

function anchor(user: Record<string, unknown>): HTMLElement {
  const el = document.createElement('span');
  el.className = s.anchor!;
  el.dataset.caret = String(user.id ?? user.name);
  el.dataset.name = String(user.name);
  el.dataset.color = colorOf(user);
  el.textContent = '⁠';
  return el;
}

type Awareness = PageSession['awareness'];

/** Someone still on the page with a caret: their tab hasn't left and hasn't cleared it. */
const hasCaret = (awareness: Awareness, id: string) => awareness.getStates().get(Number(id))?.cursor != null;

const caretCount = (state: EditorState) => yCursorPluginKey.getState(state)?.find(undefined, undefined, (spec) => spec.key != null).length ?? 0;

function overlay(view: EditorView, awareness: Awareness) {
  const host = view.dom.parentElement;
  if (!host) return {};
  host.classList.add(s.host!);
  const layer = document.createElement('div');
  layer.className = s.layer!;
  layer.setAttribute('aria-hidden', 'true');
  host.appendChild(layer);
  const carets = new Map<string, { el: HTMLElement; flag: HTMLElement; at: string; timer?: ReturnType<typeof setTimeout> }>();
  let frame = 0;
  let redraw: ReturnType<typeof setTimeout> | undefined;

  const measure = () => {
    frame = 0;
    const base = host.getBoundingClientRect();
    const seen = new Set<string>();
    for (const a of view.dom.querySelectorAll<HTMLElement>(`.${s.anchor}`)) {
      const id = a.dataset.caret!;
      const r = a.getBoundingClientRect();
      seen.add(id);
      let c = carets.get(id);
      // Inside a block that's hidden (a translation shown instead): keep it, out of sight.
      c?.el.classList.toggle(s.hidden!, !r.height);
      if (!r.height) continue;
      if (!c) {
        const el = document.createElement('div');
        el.className = s.caret!;
        const flag = document.createElement('div');
        flag.className = s.flag!;
        el.appendChild(flag);
        layer.appendChild(el);
        c = { el, flag, at: '' };
        carets.set(id, c);
      }
      c.el.style.setProperty('--caret', a.dataset.color ?? '');
      c.flag.textContent = a.dataset.name ?? '';
      const at = `translate(${Math.round(r.left - base.left)}px, ${Math.round(r.top - base.top)}px)`;
      c.el.style.height = `${r.height}px`;
      if (at === c.at) continue;
      c.at = at;
      c.el.style.transform = at;
      c.el.classList.remove(s.still!);
      clearTimeout(c.timer);
      const el = c.el;
      c.timer = setTimeout(() => el.classList.add(s.still!), STILL_MS);
    }
    // A caret whose spot I can't place yet (their text is still on its way, or my own edit just remapped it) stays where it
    // last was; it goes only when they leave the page.
    for (const [id, c] of carets) {
      if (seen.has(id) || hasCaret(awareness, id)) continue;
      clearTimeout(c.timer);
      c.el.remove();
      carets.delete(id);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(view.dom);
  schedule();
  return {
    update(_view: EditorView, prev: EditorState) {
      schedule();
      // The caret plugin drops every remote caret on a structural edit of mine until the next awareness change; ask it
      // to place them again once the edit has reached the Yjs doc.
      if (view.state.doc !== prev.doc && !caretCount(view.state) && caretCount(prev) && !redraw) {
        redraw = setTimeout(() => {
          redraw = undefined;
          if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }));
        });
      }
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearTimeout(redraw);
      resize.disconnect();
      for (const c of carets.values()) clearTimeout(c.timer);
      layer.remove();
      host.classList.remove(s.host!);
    },
  };
}

const caretOverlay = (awareness: Awareness) =>
  Extension.create({
    name: 'caretOverlay',
    addProseMirrorPlugins() {
      return [new Plugin({ key: new PluginKey('caretOverlay'), view: (view) => overlay(view, awareness) })];
    },
  });

export function carets(session: PageSession, me: Person): AnyExtension[] {
  const user: CaretUser = { name: me.name, userId: me.id, id: String(session.awareness.clientID) };
  return [
    CollaborationCaret.configure({
      provider: { awareness: session.awareness },
      user,
      render: anchor,
      selectionRender: (u: Record<string, unknown>) => ({
        class: s.selection,
        style: `--caret: ${colorOf(u)}`,
      }),
    }),
    caretOverlay(session.awareness),
  ];
}
