import { describe, expect, it } from 'vitest';
import { editableContent, toDraft } from './draft';

const p = (...content: object[]) => ({ type: 'paragraph', content });
const text = (t: string, ...marks: string[]) => ({ type: 'text', text: t, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const doc = (...content: object[]) => ({ type: 'doc', content });

describe('toDraft', () => {
  it('sends plain text without html and trims empty lines', () => {
    expect(toDraft(doc(p(), p(text('hello')), p(text('world')), p()))).toEqual({ body: 'hello\nworld', mentions: [] });
    expect(toDraft(doc(p(text('   '))))).toEqual({ body: '', mentions: [] });
  });

  it('formats marks, lists, quotes and code blocks', () => {
    const d = toDraft(
      doc(
        p(text('Agenda', 'bold'), text(' for '), text('Thu', 'italic'), text(' '), text('x', 'strike'), text(' '), text('a<b', 'code')),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('one'))] }, { type: 'listItem', content: [p(text('two'))] }] },
        { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [p(text('first'))] }] },
        { type: 'blockquote', content: [p(text('quoted'))] },
        { type: 'codeBlock', content: [text('let a = 1;\nlet b = 2;')] },
      ),
    );
    expect(d.body).toBe('Agenda for Thu x a<b\n- one\n- two\n1. first\n> quoted\n```\nlet a = 1;\nlet b = 2;\n```');
    expect(d.html).toBe(
      '<p><strong>Agenda</strong> for <em>Thu</em> <del>x</del> <code>a&lt;b</code></p><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol><blockquote>quoted</blockquote><pre><code>let a = 1;\nlet b = 2;</code></pre>',
    );
  });

  it('turns mentions into pills, display names in the body and user ids in mentions', () => {
    const d = toDraft(doc(p({ type: 'mention', attrs: { id: '@ingrid:x', label: 'Ingrid Holm' } }, text(' and '), { type: 'mention', attrs: { id: '@ingrid:x', label: 'Ingrid Holm' } })));
    expect(d.body).toBe('Ingrid Holm and Ingrid Holm');
    expect(d.html).toBe('<a href="https://matrix.to/#/@ingrid:x">Ingrid Holm</a> and <a href="https://matrix.to/#/@ingrid:x">Ingrid Holm</a>');
    expect(d.mentions).toEqual(['@ingrid:x']);
  });

  it('keeps safe links only', () => {
    const link = (href: string) => ({ type: 'text', text: 'here', marks: [{ type: 'link', attrs: { href } }] });
    expect(toDraft(doc(p(link('https://pasodrum.work/a?b=1&c')))).html).toBe('<a href="https://pasodrum.work/a?b=1&amp;c">here</a>');
    expect(toDraft(doc(p(link('javascript:alert(1)'))))).toEqual({ body: 'here', mentions: [] });
  });
});

describe('editableContent', () => {
  it('uses the html when there is one, else the body as paragraphs', () => {
    expect(editableContent({ body: 'x', html: '<strong>x</strong>' })).toBe('<strong>x</strong>');
    expect(editableContent({ body: 'a <b>\nc' })).toBe('<p>a &lt;b&gt;</p><p>c</p>');
  });
});
