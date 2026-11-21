import { describe, expect, it } from 'vitest';
import { MAX_CHARS, MAX_SEGMENTS, parseRequest, parseResponse } from './translate.ts';

describe('translate request', () => {
  it('accepts segments with en or ja', () => {
    expect(parseRequest({ segments: ['Hi ⟦0⟧', ''], to: 'ja' })).toEqual({ segments: ['Hi ⟦0⟧', ''], to: 'ja' });
    expect(parseRequest({ segments: Array(MAX_SEGMENTS).fill('x'.repeat(MAX_CHARS / MAX_SEGMENTS)), to: 'en' })).not.toBeNull();
  });

  it('refuses bad bodies and anything over the limits', () => {
    for (const body of [
      {},
      { segments: ['a'] },
      { segments: ['a'], to: 'sv' },
      { segments: ['a'], to: ['en'] },
      { segments: [], to: 'en' },
      { segments: 'a', to: 'en' },
      { segments: ['a', 1], to: 'en' },
      { segments: [null], to: 'en' },
      { segments: Array(MAX_SEGMENTS + 1).fill('a'), to: 'en' },
      { segments: ['x'.repeat(MAX_CHARS), 'y'], to: 'en' },
    ]) expect(parseRequest(body)).toBeNull();
  });
});

describe('translate response', () => {
  it('returns the segments when the count matches', () => {
    expect(parseResponse(JSON.stringify({ segments: ['こんにちは ⟦0⟧', ''] }), 2)).toEqual(['こんにちは ⟦0⟧', '']);
  });

  it('rejects anything else', () => {
    for (const content of [
      undefined,
      null,
      '',
      'not json',
      'null',
      '[]',
      JSON.stringify({ segments: ['one'] }),
      JSON.stringify({ segments: ['one', 'two', 'three'] }),
      JSON.stringify({ segments: ['one', 2] }),
      JSON.stringify({ segments: 'one two' }),
    ]) expect(parseResponse(content, 2)).toBeNull();
  });
});
