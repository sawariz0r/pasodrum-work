import { describe, expect, it } from 'vitest';
import en from 'emojibase-data/en/compact.json';
import ja from 'emojibase-data/ja/compact.json';
import github from 'emojibase-data/en/shortcodes/github.json';
import emojibase from 'emojibase-data/en/shortcodes/emojibase.json';
import { buildEmojiData, categories, searchEmoji, unsupported } from './emoji';

type Args = Parameters<typeof buildEmojiData>;
const data = buildEmojiData(en as unknown as Args[0], ja as unknown as Args[1], github as Args[2], emojibase as Args[3]);

describe('emoji', () => {
  it('finds by shortcode, English name and Japanese name', () => {
    expect(searchEmoji(data, 'thumbsup')[0]!.unicode).toBe('👍');
    expect(searchEmoji(data, ':+1:')[0]!.unicode).toBe('👍');
    expect(searchEmoji(data, 'rocket')[0]!.unicode).toBe('🚀');
    expect(searchEmoji(data, 'ロケット').map((e) => e.unicode)).toContain('🚀');
    expect(searchEmoji(data, '笑顔').length).toBeGreaterThan(0);
    expect(data.byCode.get('tada')!.unicode).toBe('🎉');
  });

  it('groups every picker category and skips skin-tone components', () => {
    for (const c of categories) expect(data.byGroup.get(c.group)!.length).toBeGreaterThan(50);
    expect(data.byGroup.has(2)).toBe(false);
  });
});

describe('unsupported', () => {
  it('drops versions newer than the newest one this device draws', () => {
    const versions = { '15': ['1FA77'], '16': ['1FAE9', '1FAE9-200D-1F525'], '17': ['1FAEA'] };
    const draws = (e: string) => e.codePointAt(0)! <= 0x1fa77;
    expect([...unsupported(versions, draws)].sort()).toEqual(['1FAE9', '1FAE9-200D-1F525', '1FAEA']);
    expect(unsupported(versions, () => true).size).toBe(0);
  });
});
