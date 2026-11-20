// Sanitized message HTML (D-22) → React elements through an allow-list walk. Never innerHTML.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyIcon } from '../icons';
import { linkify } from './items';
import s from './Rich.module.css';

const INLINE: Record<string, 'strong' | 'em' | 's'> = { b: 'strong', strong: 'strong', i: 'em', em: 'em', s: 's', del: 's' };
const SCHEMES = new Set(['http:', 'https:', 'mailto:']);

function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return SCHEMES.has(new URL(raw).protocol) ? raw : null;
  } catch {
    return null;
  }
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => {});
}

function CodeBlock({ code }: { code: string }) {
  const { t } = useTranslation();
  return (
    <div className={s.codeBlock}>
      <pre className={s.pre}>
        <code>{code}</code>
      </pre>
      <button type="button" className={s.copyCode} aria-label={t('timeline.copyCode')} onClick={() => copy(code)}>
        <CopyIcon size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

const isBlank = (n: Node) => n.nodeType === 3 && !(n as Text).data.trim();

function walkNode(node: Node, key: string): ReactNode {
  if (node.nodeType === 3) return (node as Text).data;
  if (node.nodeType !== 1) return null;
  const el = node as Element;
  const tag = el.localName;
  const inline = INLINE[tag];
  if (inline) {
    const Tag = inline;
    return <Tag key={key}>{walk(el, key)}</Tag>;
  }
  switch (tag) {
    case 'br':
      return <br key={key} />;
    case 'code':
      return <code key={key} className={s.code}>{el.textContent}</code>;
    case 'pre':
      return <CodeBlock key={key} code={(el.textContent ?? '').replace(/\n$/, '')} />;
    case 'p':
      return <p key={key} className={s.p}>{walk(el, key)}</p>;
    case 'ul':
    case 'ol': {
      const List = tag;
      return (
        <List key={key} className={s[tag]}>
          {Array.from(el.children).filter((c) => c.localName === 'li').map((li, j) => (
            <li key={j} className={s.li}>{walk(li, `${key}.${j}`)}</li>
          ))}
        </List>
      );
    }
    case 'blockquote':
      return <blockquote key={key} className={s.quote}>{walk(el, key)}</blockquote>;
    case 'a': {
      const mention = el.getAttribute('data-mention');
      if (mention) {
        const text = el.textContent ?? '';
        return <span key={key} className={s.mention} data-mention={mention}>{text.startsWith('@') ? text : `@${text}`}</span>;
      }
      const href = safeHref(el.getAttribute('href'));
      if (!href) return <span key={key}>{walk(el, key)}</span>;
      return <a key={key} className={s.link} href={href} target="_blank" rel="noopener noreferrer">{walk(el, key)}</a>;
    }
    default:
      return <span key={key}>{walk(el, key)}</span>;
  }
}

function walk(parent: Node, key: string): ReactNode[] {
  return Array.from(parent.childNodes).map((n, i) => walkNode(n, `${key}.${i}`));
}

const BLOCKS = new Set(['ul', 'ol', 'pre', 'blockquote']);

/** The last paragraph gets `tail` after its last word; after a list or code block it starts its own line. */
function render(html: string, tail: ReactNode): ReactNode[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const nodes = Array.from(body.childNodes);
  let last = nodes.length - 1;
  while (last >= 0 && isBlank(nodes[last]!)) last--;
  const out = nodes.map((n, i) => {
    if (i !== last || !tail || n.nodeType !== 1 || (n as Element).localName !== 'p') return walkNode(n, `r.${i}`);
    return <p key={`r.${i}`} className={s.p}>{walk(n, `r.${i}`)}{tail}</p>;
  });
  const lastNode = nodes[last];
  if (tail && !(lastNode?.nodeType === 1 && (lastNode as Element).localName === 'p')) {
    out.push(lastNode?.nodeType === 1 && BLOCKS.has((lastNode as Element).localName) ? <div key="tail">{tail}</div> : <span key="tail">{tail}</span>);
  }
  return out;
}

export function RichText({ html, tail }: { html: string; tail?: ReactNode }) {
  return <div className={s.rich}>{render(html, tail)}</div>;
}

export function PlainText({ text, tail }: { text: string; tail?: ReactNode }) {
  return (
    <div className={s.plain}>
      {linkify(text).map((p, i) =>
        p.href ? (
          <a key={i} className={s.link} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ) : (
          p.text
        ),
      )}
      {tail}
    </div>
  );
}
