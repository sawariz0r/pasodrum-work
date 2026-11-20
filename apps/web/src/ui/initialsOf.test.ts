import { describe, expect, it } from 'vitest';
import { initialsOf, isCjk } from './initialsOf';

describe('initialsOf', () => {
  it('uses first and last initial for Latin names', () => {
    expect(initialsOf('Ingrid Holm')).toBe('IH');
    expect(initialsOf('Jonas Berg')).toBe('JB');
    expect(initialsOf('Anna Maria van der Berg')).toBe('AB');
  });

  it('uses one initial for a single Latin word, upper-cased', () => {
    expect(initialsOf('henrik')).toBe('H');
  });

  it('uses the first character of the family name for Japanese names', () => {
    expect(initialsOf('平野 いずみ')).toBe('平');
    expect(initialsOf('森 真由')).toBe('森');
    expect(initialsOf('いずみ')).toBe('い');
    expect(initialsOf('タナカ ユキ')).toBe('タ');
  });

  it('ignores surrounding whitespace and empty input', () => {
    expect(initialsOf('  Maja   Lind ')).toBe('ML');
    expect(initialsOf('   ')).toBe('');
  });

  it('keeps astral characters whole', () => {
    expect(initialsOf('😀 Smile')).toBe('😀S');
  });
});

describe('isCjk', () => {
  it('detects kana and kanji only', () => {
    expect(isCjk('平')).toBe(true);
    expect(isCjk('JB')).toBe(false);
  });
});
