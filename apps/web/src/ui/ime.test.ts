// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isImeEnter } from './ime';

const later = () => performance.now() + 1000;

describe('isImeEnter', () => {
  it('accepts a plain Enter', () => {
    expect(isImeEnter(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(true);
    expect(isImeEnter({ nativeEvent: new KeyboardEvent('keydown', { key: 'Enter' }) })).toBe(true);
  });

  it('ignores other keys', () => {
    expect(isImeEnter(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
  });

  it('ignores Enter while composing', () => {
    expect(isImeEnter(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))).toBe(false);
  });

  it('ignores keyCode 229', () => {
    expect(isImeEnter({ key: 'Enter', keyCode: 229, isComposing: false, timeStamp: later() })).toBe(false);
  });

  it('ignores the Safari Enter right after compositionend, then accepts the next one', () => {
    document.body.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本' }));
    expect(isImeEnter(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
    expect(isImeEnter({ key: 'Enter', keyCode: 13, isComposing: false, timeStamp: later() })).toBe(true);
  });
});
