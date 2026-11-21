// Section translate (DocsTranslated, DocsTranslateStates): a section is a heading and what follows it, or the title and
// the intro. Its state lives in the page; this plugin only draws it (pulse, status line, the translated copy).
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { DOMSerializer } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface Section {
  /** Index of its first block; 0 is the title section (with the intro, when the page doesn't start with a heading). */
  first: number;
  from: number;
  to: number;
  /** Position just after the heading, where the status line goes; null for the title section without a heading. */
  headingEnd: number | null;
  heading: boolean;
}

export type SectionState =
  | { status: 'translating'; source: string }
  | { status: 'failed'; source: string }
  | { status: 'translated'; source: string; html: string; title?: string };

export function sectionsOf(doc: PMNode): Section[] {
  const out: Section[] = [];
  doc.forEach((node, offset, i) => {
    const heading = node.type.name === 'heading';
    if (i === 0 || heading) out.push({ first: i, from: offset, to: offset + node.nodeSize, headingEnd: heading ? offset + node.nodeSize : null, heading });
    else out[out.length - 1]!.to = offset + node.nodeSize;
  });
  return out;
}

export function sectionSource(doc: PMNode, schema: Schema, section: Section, title: string): { body: string; html: string } {
  const slice = doc.slice(section.from, section.to).content;
  const div = document.createElement('div');
  div.append(DOMSerializer.fromSchema(schema).serializeFragment(slice));
  const texts: string[] = [];
  slice.forEach((n) => texts.push(n.textContent));
  const withTitle = section.first === 0 && !section.heading && title;
  return {
    body: [...(withTitle ? [title] : []), ...texts].filter(Boolean).join('\n\n'),
    html: (withTitle ? `<h1>${escapeHtml(title)}</h1>` : '') + div.innerHTML,
  };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Splits the translated title section into its title and the rest. */
export function splitTitle(html: string): { title?: string; html: string } {
  const div = document.createElement('div');
  div.innerHTML = html;
  const h1 = div.querySelector(':scope > h1');
  if (!h1) return { html };
  const title = h1.textContent ?? undefined;
  h1.remove();
  return { title, html: div.innerHTML };
}

export interface SectionView {
  states: () => Map<number, SectionState>;
  title: () => string;
  icon: () => HTMLElement | null;
  labels: () => { translating: string; showOriginal: string; failed: string; retry: string };
  classes: { pulse: string; hidden: string; line: string; failedLine: string; glyph: string; dots: string; link: string; translated: string; sep: string };
  onRetry: (first: number) => void;
  onShowOriginal: (first: number) => void;
}

export const sectionKey = new PluginKey('docsSections');

function el(tag: string, cls: string, attrs: Record<string, string> = {}) {
  const e = document.createElement(tag);
  e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function sectionPlugin(view: SectionView) {
  const glyph = (cls: string) => {
    const span = el('span', `${view.classes.glyph} ${cls}`);
    const icon = view.icon();
    if (icon) span.append(icon.cloneNode(true));
    return span;
  };
  const translatingLine = () => {
    const line = el('div', view.classes.line, { role: 'status', 'aria-label': view.labels().translating, contenteditable: 'false' });
    const dots = el('span', view.classes.dots);
    dots.append(el('span', ''), el('span', ''), el('span', ''));
    line.append(glyph(''), dots);
    return line;
  };
  const failedLine = (first: number) => {
    const l = view.labels();
    const line = el('div', `${view.classes.line} ${view.classes.failedLine}`, { role: 'alert', contenteditable: 'false' });
    const text = el('span', '');
    text.textContent = l.failed;
    const sep = el('span', view.classes.sep);
    sep.textContent = '·';
    const retry = el('button', view.classes.link, { type: 'button' });
    retry.textContent = l.retry;
    retry.addEventListener('click', () => view.onRetry(first));
    line.append(glyph(''), text, sep, retry);
    return line;
  };
  const originalLine = (first: number) => {
    const line = el('div', view.classes.line, { contenteditable: 'false' });
    const show = el('button', view.classes.link, { type: 'button' });
    show.textContent = view.labels().showOriginal;
    show.addEventListener('click', () => view.onShowOriginal(first));
    line.append(glyph(''), show);
    return line;
  };
  const translatedCopy = (first: number, html: string, heading: boolean) => {
    const box = el('div', view.classes.translated, { contenteditable: 'false' });
    const body = el('div', '');
    body.innerHTML = html;
    const h = heading ? body.firstElementChild : null;
    if (h) box.append(h);
    box.append(originalLine(first), ...Array.from(body.childNodes));
    box.addEventListener('mousedown', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('button')) view.onShowOriginal(first);
    });
    return box;
  };

  return new Plugin({
    key: sectionKey,
    // A section whose text changed (anyone's edit, or the title) drops its translation, so Translate is offered again.
    view: () => ({
      update(v) {
        const states = view.states();
        if (!states.size) return;
        const secs = sectionsOf(v.state.doc);
        for (const [first, st] of states) {
          const sec = secs.find((x) => x.first === first);
          const source = sec ? sectionSource(v.state.doc, v.state.schema, sec, view.title()).html : first < 0 ? `<h1>${escapeHtml(view.title())}</h1>` : null;
          if (source !== st.source) view.onShowOriginal(first);
        }
      },
    }),
    props: {
      decorations(state) {
        const states = view.states();
        if (!states.size) return DecorationSet.empty;
        const decos: Decoration[] = [];
        for (const sec of sectionsOf(state.doc)) {
          const st = states.get(sec.first);
          if (!st) continue;
          if (sectionSource(state.doc, state.schema, sec, view.title()).html !== st.source) continue;
          const blocks: { from: number; to: number; heading: boolean }[] = [];
          state.doc.nodesBetween(sec.from, sec.to, (node: PMNode, pos: number) => {
            blocks.push({ from: pos, to: pos + node.nodeSize, heading: node.type.name === 'heading' && pos === sec.from });
            return false;
          });
          const at = sec.headingEnd ?? sec.from;
          if (st.status === 'translating') {
            decos.push(Decoration.widget(at, translatingLine, { side: -1, key: `tr-${sec.first}`, ignoreSelection: true, stopEvent: () => true }));
            for (const b of blocks) if (!b.heading) decos.push(Decoration.node(b.from, b.to, { class: view.classes.pulse }));
          } else if (st.status === 'failed') {
            decos.push(Decoration.widget(at, () => failedLine(sec.first), { side: -1, key: `fail-${sec.first}`, ignoreSelection: true, stopEvent: () => true }));
          } else {
            decos.push(
              Decoration.widget(sec.from, () => translatedCopy(sec.first, st.html, sec.heading), {
                side: -1,
                key: `done-${sec.first}-${st.html.length}`,
                ignoreSelection: true,
                stopEvent: () => true,
              }),
            );
            for (const b of blocks) decos.push(Decoration.node(b.from, b.to, { class: view.classes.hidden }));
          }
        }
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}

