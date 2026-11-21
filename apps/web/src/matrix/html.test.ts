// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pillUser, safeHref, sanitizeHtml } from './html';

const html = (input: string) => sanitizeHtml(input).html;

describe('sanitizeHtml (D-22)', () => {
  it('keeps allow-listed tags without attributes', () => {
    expect(html('<p class="x" style="color:red">a <b>b</b> <strong>c</strong> <i>d</i> <em>e</em> <s>f</s> <del>g</del></p>')).toBe(
      '<p>a <b>b</b> <strong>c</strong> <i>d</i> <em>e</em> <s>f</s> <del>g</del></p>',
    );
    expect(html('<ul><li>a</li></ul><ol><li>b</li></ol><blockquote>q</blockquote>line<br/>next')).toBe(
      '<ul><li>a</li></ul><ol><li>b</li></ol><blockquote>q</blockquote>line<br>next',
    );
    expect(html('<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre> and <code>x</code>')).toBe(
      '<pre><code>const a = 1 &lt; 2;</code></pre> and <code>x</code>',
    );
  });

  it('renders headings as bold text', () => {
    expect(html('<h1>Title</h1><h6>Small</h6>')).toBe('<p><strong>Title</strong></p><p><strong>Small</strong></p>');
  });

  it('unwraps unknown tags, keeping their text', () => {
    expect(html('<span data-mx-color="#f00">red</span> <font color="blue">blue</font> <table><tr><td>cell</td></tr></table>')).toBe('red blue cell');
    expect(html('<details><summary>s</summary>hidden</details>')).toBe('shidden');
  });

  it('drops scripts, styles, images and the reply fallback with their content', () => {
    expect(html('a<script>alert(1)</script><style>p{}</style><img src="x" onerror="alert(1)" alt="pic">b')).toBe('ab');
    expect(html('<mx-reply><blockquote><a href="https://matrix.to/#/!r/$e">In reply to</a> <a href="https://matrix.to/#/@a:s">@a:s</a><br>old</blockquote></mx-reply>new')).toBe('new');
  });

  it('keeps only http, https and mailto links', () => {
    expect(html('<a href="https://x.dev/a?b=1&amp;c=2" target="_blank" rel="x" onclick="y">x</a>')).toBe('<a href="https://x.dev/a?b=1&amp;c=2">x</a>');
    expect(html('<a href="mailto:a@b.c">mail</a> <a href="http://h">h</a>')).toBe('<a href="mailto:a@b.c">mail</a> <a href="http://h">h</a>');
    expect(html('<a href="javascript:alert(1)">bad</a> <a href="/relative">rel</a> <a>none</a> <a href=" data:text/html,x">d</a>')).toBe('bad rel none d');
  });

  it('escapes text and attributes', () => {
    expect(html('&lt;b&gt;not bold&lt;/b&gt; &amp; "q"')).toBe('&lt;b&gt;not bold&lt;/b&gt; &amp; &quot;q&quot;');
    expect(html('<a href=\'https://x.dev/"><script>\'>x</a>')).toBe('<a href="https://x.dev/&quot;&gt;&lt;script&gt;">x</a>');
  });

  it('marks pills as mentions and collects them outside the reply fallback', () => {
    const out = sanitizeHtml(
      '<mx-reply><a href="https://matrix.to/#/@old:s">Old</a></mx-reply>Hi <a href="https://matrix.to/#/%40ingrid%3Apasodrum.work">Ingrid</a> and <a href="https://matrix.to/#/@jonas:pasodrum.work?via=x">Jonas</a>, see <a href="https://matrix.to/#/!room:s/$ev">this</a>',
    );
    expect(out.html).toBe(
      'Hi <a href="https://matrix.to/#/%40ingrid%3Apasodrum.work" data-mention="@ingrid:pasodrum.work">Ingrid</a> and ' +
        '<a href="https://matrix.to/#/@jonas:pasodrum.work?via=x" data-mention="@jonas:pasodrum.work">Jonas</a>, see <a href="https://matrix.to/#/!room:s/$ev">this</a>',
    );
    expect(out.mentions).toEqual(['@ingrid:pasodrum.work', '@jonas:pasodrum.work']);
  });

  it('helpers', () => {
    expect(safeHref('ftp://x')).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(pillUser('https://matrix.to/#/@a:b')).toBe('@a:b');
    expect(pillUser('https://matrix.to/#/!r:b')).toBeNull();
    expect(pillUser('https://example.com/#/@a:b')).toBeNull();
  });

  it('collects links outside code and the reply fallback, leaving pills out (M7)', () => {
    const input =
      '<mx-reply><blockquote><a href="https://old.dev">old</a></blockquote></mx-reply>' +
      '<a href="https://matrix.to/#/@a:s">A</a> read <a href="https://x.dev/doc">the doc</a> or https://y.dev/raw. <code>https://code.dev</code><pre><code>https://pre.dev</code></pre> <a href="mailto:a@b.c">m</a>';
    expect(sanitizeHtml(input).links).toEqual(['https://x.dev/doc', 'https://y.dev/raw']);
  });
});
