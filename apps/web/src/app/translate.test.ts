// @vitest-environment happy-dom
// SIDE-01 (D-30): what breaks silently — the EN/JP check, and links/mentions/code surviving a translation untouched.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceStore } from '../matrix';
import { fits, forgetTranslations, looksForeign, readableText, translateText } from './translate';

const storeWith = (fn: (segments: string[]) => string[]) => {
  const translate = vi.fn(async (segments: string[]) => fn(segments));
  return { store: { translate } as unknown as WorkspaceStore, translate };
};

afterEach(() => forgetTranslations());

describe('looksForeign', () => {
  it('offers Japanese text to an English reader, even with Latin names inside', () => {
    expect(looksForeign('Nordlys の PR を確認しました', 'en')).toBe(true);
    expect(looksForeign('Morning! Review moved to Thursday', 'en')).toBe(false);
  });

  it('offers English text to a Japanese reader, never Japanese or symbols only', () => {
    expect(looksForeign('Thursday works for Nordlys too', 'ja')).toBe(true);
    expect(looksForeign('木曜で大丈夫です', 'ja')).toBe(false);
    expect(looksForeign('👍 10:00', 'ja')).toBe(false);
  });

  it('ignores mentions, links and code', () => {
    const html = '<a href="https://matrix.to/#/@ingrid:pasodrum.work">平野 いずみ</a> ok <code>開発</code>';
    expect(looksForeign(readableText('平野 いずみ ok 開発', html), 'en')).toBe(false);
    expect(looksForeign(readableText('@平野 ok `開発` https://例え.jp', undefined), 'en')).toBe(false);
  });
});

describe('translateText', () => {
  it('rebuilds formatted text from the original mention, link and bold nodes', async () => {
    const html = '<a href="https://matrix.to/#/@sam:pasodrum.work">Sam</a> 文言は <code>channel.empty</code> に <strong>入れました</strong>';
    const { store } = storeWith(([s]) => [s!.replace(/^(⟦0⟧) 文言は (⟦1⟧) に (⟦2⟧)入れました(⟦\/2⟧)$/, '$1 I put the copy in $2 $3done$4')]);
    const out = await translateText(store, { id: '$1', body: 'Sam 文言は channel.empty に 入れました', html }, 'en');
    expect(out.html).toBe('<a href="https://matrix.to/#/@sam:pasodrum.work">Sam</a> I put the copy in <code>channel.empty</code> <strong>done</strong>');
  });

  it('never renders markup the model returned', async () => {
    const { store } = storeWith(([s]) => [`${s} <img src=x onerror=alert(1)>`]);
    const out = await translateText(store, { id: '$2', body: 'こんにちは', html: '<p>こんにちは</p>' }, 'en');
    expect(out.html).toBe('<p>こんにちは &lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('falls back to plain text from the same answer when a token goes missing', async () => {
    const { store, translate } = storeWith((segments) => segments.map((s) => s.replace('⟦1⟧', '').replace('こんにちは', 'hello')));
    const src = { id: '$3', body: 'Sam こんにちは x', html: '<a href="https://matrix.to/#/@sam:x">Sam</a> こんにちは <code>x</code>' };
    expect(await translateText(store, src, 'en')).toEqual({ text: 'Sam hello ' });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('never sends code, links, mentions or literal token brackets in plain text', async () => {
    const body = '@sam:x 見て `npm i` https://a.example/b ⟦0⟧\n```\nコード\n```';
    const { store, translate } = storeWith((segments) => segments.map((s) => s.replace('見て', 'look')));
    const out = await translateText(store, { id: '$4', body }, 'en');
    const sent = translate.mock.calls[0]![0].join('\n');
    expect(sent).not.toMatch(/sam|npm|example|コード/);
    expect(out.text).toBe(body.replace('見て', 'look'));
  });

  it('caches per message: the same text in another message is translated again', async () => {
    const { store, translate } = storeWith((segments) => segments.map(() => 'hi'));
    await translateText(store, { id: '$5', body: 'やあ' }, 'en');
    await translateText(store, { id: '$5', body: 'やあ' }, 'en');
    await translateText(store, { id: '$6', body: 'やあ' }, 'en');
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('does not offer what the service would refuse', () => {
    expect(fits({ body: 'こんにちは' })).toBe(true);
    expect(fits({ body: 'あ\n'.repeat(41) })).toBe(false);
    expect(fits({ body: 'あ'.repeat(4001) })).toBe(false);
  });
});
