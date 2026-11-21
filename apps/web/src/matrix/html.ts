// D-22: received formatted_body → allow-listed HTML string. Pure; needs a DOMParser (browser, or happy-dom in tests).

const KEEP = new Set(['b', 'strong', 'i', 'em', 's', 'del', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'p']);
/** Dropped with their content; every other unknown element is unwrapped to its text. */
const DROP = new Set(['mx-reply', 'script', 'style', 'head', 'title', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'img']);
const HEADING = /^h[1-6]$/;
const SCHEMES = new Set(['http:', 'https:', 'mailto:']);
const PILL = /^https:\/\/matrix\.to\/#\/((?:@|%40)[^/?#]+)/i;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function safeHref(href: string | null): string | null {
  const raw = href?.trim();
  if (!raw) return null;
  try {
    return SCHEMES.has(new URL(raw).protocol) ? raw : null;
  } catch {
    return null;
  }
}

/** A standard pill (`https://matrix.to/#/@user:server`) → the user id. */
export function pillUser(href: string): string | null {
  const m = PILL.exec(href);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
}

export interface SanitizedHtml {
  html: string;
  /** User ids of pills outside the reply fallback. */
  mentions: string[];
  /** M7. http(s) links in order (anchors and bare URLs), outside code and the reply fallback; pills left out. */
  links: string[];
}

// ASCII URL characters only, so Japanese text right after a URL ends it.
const URL_RUN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
const TRAILING = /[.,;:!?'*]$/;
const count = (s: string, ch: string) => s.split(ch).length - 1;

const isWebUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
};

/** M7. http(s) URLs in plain text, in order; trailing punctuation and an unbalanced closing bracket aren't part of them. */
export function urlsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RUN)) {
    let url = m[0];
    for (;;) {
      if (TRAILING.test(url)) url = url.slice(0, -1);
      else if (url.endsWith(')') && count(url, ')') > count(url, '(')) url = url.slice(0, -1);
      else if (url.endsWith(']') && count(url, ']') > count(url, '[')) url = url.slice(0, -1);
      else break;
    }
    if (isWebUrl(url)) out.push(url);
  }
  return out;
}

export function sanitizeHtml(input: string): SanitizedHtml {
  const doc = new DOMParser().parseFromString(input, 'text/html');
  const out: string[] = [];
  const mentions = new Set<string>();
  const links: string[] = [];
  let inCode = 0;
  let inLink = 0;

  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3) {
        out.push(escape((node as Text).data));
        if (!inCode && !inLink) links.push(...urlsIn((node as Text).data));
        continue;
      }
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      const tag = el.localName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (tag === 'br') {
        out.push('<br>');
      } else if (HEADING.test(tag)) {
        out.push('<p><strong>');
        walk(el);
        out.push('</strong></p>');
      } else if (tag === 'a') {
        const href = safeHref(el.getAttribute('href'));
        if (!href) {
          walk(el);
          continue;
        }
        const user = pillUser(href);
        if (user) mentions.add(user);
        else if (!inCode && isWebUrl(href)) links.push(href);
        out.push(`<a href="${escape(href)}"${user ? ` data-mention="${escape(user)}"` : ''}>`);
        inLink++;
        walk(el);
        inLink--;
        out.push('</a>');
      } else if (KEEP.has(tag)) {
        const code = tag === 'code' || tag === 'pre';
        out.push(`<${tag}>`);
        if (code) inCode++;
        walk(el);
        if (code) inCode--;
        out.push(`</${tag}>`);
      } else {
        walk(el);
      }
    }
  };

  walk(doc.body);
  return { html: out.join('').trim(), mentions: [...mentions], links };
}

export function escapeHtml(text: string): string {
  return escape(text).replace(/\n/g, '<br>');
}
