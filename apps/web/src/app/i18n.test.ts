// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { formatDate, formatTime } from './format';
import { initI18n, resolveLanguage, setLanguage } from './i18n';

describe('resolveLanguage', () => {
  it('prefers the stored setting', () => {
    expect(resolveLanguage('ja', ['en-US'])).toBe('ja');
    expect(resolveLanguage('en', ['ja-JP'])).toBe('en');
  });

  it('falls back to the browser language', () => {
    expect(resolveLanguage(null, ['ja-JP', 'en'])).toBe('ja');
    expect(resolveLanguage(null, ['ja'])).toBe('ja');
    expect(resolveLanguage(null, ['sv-SE', 'ja'])).toBe('en');
    expect(resolveLanguage('xx', [])).toBe('en');
  });
});

describe('i18n', () => {
  const i18n = initI18n();

  it('translates, interpolates and pluralises in both languages, and sets <html lang>', async () => {
    await setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.t('shell.header.members', { count: 1 })).toBe('1 member');
    expect(i18n.t('shell.header.members', { count: 24 })).toBe('24 members');
    expect(i18n.t('composer.placeholder', { channel: 'design-studio' })).toBe('Message #design-studio');

    await setLanguage('ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(localStorage.getItem('pasodrum.language')).toBe('ja');
    expect(i18n.t('shell.header.members', { count: 1 })).toBe('メンバー 1 人');
    expect(i18n.t('signIn.cantReach', { server: 'pasodrum.work' })).toBe('pasodrum.work に接続できません');
  });

  it('formats times with the active language', async () => {
    const d = new Date(2026, 10, 20, 9, 5);
    await setLanguage('en');
    expect(formatTime(d)).toBe('09:05');
    expect(formatDate(d, { weekday: 'long' })).toBe('Friday');
    await setLanguage('ja');
    expect(formatTime(d)).toBe('09:05');
    expect(formatDate(d, { weekday: 'long' })).toBe('金曜日');
  });

  it('rejects unknown keys at compile time', () => {
    // @ts-expect-error not a key
    expect(i18n.t('shell.rail.room')).toBe('shell.rail.room');
  });
});
