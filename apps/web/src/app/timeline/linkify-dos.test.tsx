// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../../matrix/html';
import { linksOf } from '../../matrix/map';
import { linkify } from './items';
import { PlainText } from './RichText';

// A member can send this as an m.room.message body (no formatted_body). 20k closers is
// far under the server's 53_000_000-byte request cap, and the quadratic trim already
// takes seconds here. A linear trim, or refusing to link a URL this long, finishes
// well under the budget.
const CLOSERS = 20_000;
const BUDGET_MS = 50;

const bodyWith = (closer: ')' | ']') => `http://a${closer.repeat(CLOSERS)}`;

function timed<T>(run: () => T): T {
  const start = performance.now();
  const value = run();
  expect(performance.now() - start, 'trim scanned the whole URL once per closer').toBeLessThan(BUDGET_MS);
  return value;
}

/** A link whose href still holds the closer run means the trim never happened. No link means the long run was left as text. */
function expectTrimmed(hrefs: string[]) {
  expect(hrefs.every((href) => href === 'http://a')).toBe(true);
  expect(hrefs.length).toBeLessThanOrEqual(1);
}

afterEach(cleanup);

describe('plain-text link trim stays linear', () => {
  it('still links an ordinary URL and keeps a balanced parenthesis', () => {
    expect(linkify('see https://pasodrum.work/docs.')).toEqual([
      { text: 'see ' },
      { text: 'https://pasodrum.work/docs', href: 'https://pasodrum.work/docs' },
      { text: '.' },
    ]);
    expect(linkify('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([
      { text: '(' },
      { text: 'https://en.wikipedia.org/wiki/Foo_(bar)', href: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
      { text: ')' },
    ]);
  });

  it('linkify trims a URL followed by thousands of ")" without rescanning each one', () => {
    const body = bodyWith(')');
    const parts = timed(() => linkify(body));
    expectTrimmed(parts.flatMap((part) => (part.href ? [part.href] : [])));
    expect(parts.map((part) => part.text).join('')).toBe(body);
  });

  it('PlainText, which MessageRow uses for a plain body, renders that message within the same budget', () => {
    const body = bodyWith(')');
    const { container } = timed(() => render(<PlainText text={body} />));
    expectTrimmed([...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? ''));
    expect(container.textContent).toBe(body);
  });

  it('linksOf trims the same ")" run while collecting links from an unencrypted plain body', () => {
    expectTrimmed(timed(() => linksOf(bodyWith(')'), null, false)));
  });

  it('linksOf trims a URL followed by thousands of "]" the same way', () => {
    expectTrimmed(timed(() => linksOf(bodyWith(']'), null, false)));
  });

  it('sanitizeHtml trims a ")" run in a formatted body while collecting its links', () => {
    expectTrimmed(timed(() => sanitizeHtml(bodyWith(')')).links));
  });

  it('sanitizeHtml trims a "]" run in a formatted body while collecting its links', () => {
    expectTrimmed(timed(() => sanitizeHtml(bodyWith(']')).links));
  });
});
