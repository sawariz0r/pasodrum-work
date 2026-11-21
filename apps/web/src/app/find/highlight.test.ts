import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

const marked = (text: string, q: string) => highlight(text, q).filter((p) => p.hit).map((p) => p.text);

describe('highlight', () => {
  it('marks a substring inside a Japanese word', () => {
    expect(marked('キックオフのレビューは木曜です', 'レビュー')).toEqual(['レビュー']);
  });

  it('folds width and case like search does, marking the text as written', () => {
    expect(marked('ｷｯｸｵﾌ は ＴＥＳＴ です', 'キックオフ')).toEqual(['ｷｯｸｵﾌ']);
    expect(marked('ｷｯｸｵﾌ は ＴＥＳＴ です', 'test')).toEqual(['ＴＥＳＴ']);
    expect(marked('ﾃﾞｻﾞｲﾝ', 'デザ')).toEqual(['ﾃﾞｻﾞ']);
  });

  it('keeps every part of the text', () => {
    const text = 'Review: the review moved';
    expect(highlight(text, 'review').map((p) => p.text).join('')).toBe(text);
    expect(marked(text, 'review')).toEqual(['Review', 'review']);
  });
});
