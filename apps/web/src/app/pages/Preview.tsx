import type { ReactNode } from 'react';
import type { Message } from '../../matrix';
import s from './Pages.module.css';

const BREAKS = new Set(['p', 'li', 'br', 'blockquote', 'pre', 'ul', 'ol', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function walk(node: Node, out: ReactNode[]) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      out.push((child as Text).data);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const mention = el.localName === 'a' ? el.getAttribute('data-mention') : null;
    if (mention) {
      const text = el.textContent ?? '';
      out.push(
        <span key={out.length} className={s.mention}>
          {text.startsWith('@') ? text : `@${text}`}
        </span>,
      );
      continue;
    }
    if (BREAKS.has(el.localName)) out.push(' ');
    walk(el, out);
    if (BREAKS.has(el.localName)) out.push(' ');
  }
}

/** A message as one line of text (clamped by the caller), with mention chips. */
export function previewParts(message: Message): ReactNode[] {
  if (message.html) {
    const out: ReactNode[] = [];
    walk(new DOMParser().parseFromString(message.html, 'text/html').body, out);
    const parts: ReactNode[] = [];
    for (const p of out) {
      const last = parts[parts.length - 1];
      if (typeof p === 'string' && typeof last === 'string') parts[parts.length - 1] = last + p;
      else parts.push(p);
    }
    const last = parts.length - 1;
    return parts.map((p, i) => {
      if (typeof p !== 'string') return p;
      let text = p.replace(/\s+/g, ' ');
      if (i === 0) text = text.trimStart();
      if (i === last) text = text.trimEnd();
      return text;
    });
  }
  return [message.body || message.media?.name || ''];
}

/** Plain text of a message, for one-line previews. */
export function previewText(message: Message): string {
  if (message.body) return message.body.replace(/\s+/g, ' ');
  return message.media?.name ?? '';
}
