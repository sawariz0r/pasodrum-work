// Editor document ⇄ Draft. body is the plain fallback every client can read; html carries formatting and mention pills (D-05, D-22).
import type { JSONContent } from '@tiptap/react';
import type { Draft, Message } from '../../matrix';

export const pillPrefix = 'https://matrix.to/#/';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeHref = (href: unknown) => (typeof href === 'string' && /^(https?:|mailto:)/i.test(href) ? href : null);

interface Out {
  body: string;
  html: string;
  /** Anything beyond plain paragraphs: html is worth sending. */
  rich: boolean;
}

function inline(nodes: JSONContent[] = [], mentions: string[]): Out {
  let body = '';
  let html = '';
  let rich = false;
  for (const n of nodes) {
    if (n.type === 'hardBreak') {
      body += '\n';
      html += '<br>';
    } else if (n.type === 'mention') {
      const id = String(n.attrs?.id ?? '');
      const label = String(n.attrs?.label ?? id);
      if (id && !mentions.includes(id)) mentions.push(id);
      body += label;
      html += `<a href="${esc(pillPrefix + id)}">${esc(label)}</a>`;
      rich = true;
    } else if (n.type === 'text') {
      const text = n.text ?? '';
      body += text;
      let piece = esc(text);
      for (const m of [...(n.marks ?? [])].reverse()) {
        if (m.type === 'bold') piece = `<strong>${piece}</strong>`;
        else if (m.type === 'italic') piece = `<em>${piece}</em>`;
        else if (m.type === 'strike') piece = `<del>${piece}</del>`;
        else if (m.type === 'code') piece = `<code>${piece}</code>`;
        else if (m.type === 'link') {
          const href = safeHref(m.attrs?.href);
          if (!href) continue;
          piece = `<a href="${esc(href)}">${piece}</a>`;
        } else continue;
        rich = true;
      }
      html += piece;
    }
  }
  return { body, html, rich };
}

const indent = (text: string, first: string, rest: string) =>
  text
    .split('\n')
    .map((line, i) => (i === 0 ? first : rest) + line)
    .join('\n');

function blocks(nodes: JSONContent[] = [], mentions: string[]): Out {
  const parts = nodes.map((n) => block(n, mentions));
  const rich = parts.some((p) => p.rich);
  const body = parts.map((p) => p.body).join('\n');
  const html =
    parts.length === 1 && nodes[0]?.type === 'paragraph'
      ? parts[0]!.html
      : parts.map((p, i) => (nodes[i]?.type === 'paragraph' ? `<p>${p.html}</p>` : p.html)).join('');
  return { body, html, rich };
}

function block(n: JSONContent, mentions: string[]): Out {
  switch (n.type) {
    case 'paragraph':
      return inline(n.content, mentions);
    case 'bulletList':
    case 'orderedList': {
      const ordered = n.type === 'orderedList';
      const start = Number(n.attrs?.start ?? 1);
      const items = (n.content ?? []).map((li) => blocks(li.content, mentions));
      const body = items.map((it, i) => indent(it.body, ordered ? `${start + i}. ` : '- ', '  ')).join('\n');
      const tag = ordered ? 'ol' : 'ul';
      const open = ordered && start !== 1 ? `<ol start="${start}">` : `<${tag}>`;
      return { body, html: `${open}${items.map((it) => `<li>${it.html}</li>`).join('')}</${tag}>`, rich: true };
    }
    case 'blockquote': {
      const inner = blocks(n.content, mentions);
      return { body: indent(inner.body, '> ', '> '), html: `<blockquote>${inner.html}</blockquote>`, rich: true };
    }
    case 'codeBlock': {
      const text = (n.content ?? []).map((c) => c.text ?? '').join('');
      return { body: '```\n' + text + '\n```', html: `<pre><code>${esc(text)}</code></pre>`, rich: true };
    }
    default:
      return inline(n.content, mentions);
  }
}

const isEmptyParagraph = (n: JSONContent) => n.type === 'paragraph' && !(n.content ?? []).some((c) => c.type !== 'text' || (c.text ?? '').trim());

/** Draft from the editor document; `body` is '' when there is nothing to send. replyTo is added by the caller. */
export function toDraft(doc: JSONContent): Draft {
  const nodes = [...(doc.content ?? [])];
  while (nodes.length && isEmptyParagraph(nodes[0]!)) nodes.shift();
  while (nodes.length && isEmptyParagraph(nodes.at(-1)!)) nodes.pop();
  const mentions: string[] = [];
  const out = blocks(nodes, mentions);
  const body = out.body.replace(/^\s*\n|\s+$/g, '');
  if (!body.trim()) return { body: '', mentions: [] };
  return { body, ...(out.rich ? { html: out.html } : {}), mentions };
}

/** Editor content for editing a sent message: its sanitized html, or the body as paragraphs. */
export function editableContent(m: Pick<Message, 'body' | 'html'>): string {
  if (m.html) return m.html;
  return m.body
    .split('\n')
    .map((line) => `<p>${esc(line)}</p>`)
    .join('');
}
