import { useTranslation } from 'react-i18next';
import { formatList } from '../../app/format';
import en from './locales/en.json';
import ja from './locales/ja.json';

const ns = 'assistant';
type Key = keyof typeof en extends infer K ? (K extends `${infer B}_${'one' | 'other'}` ? B : K) : never;
export type T = (key: Key, vars?: Record<string, string | number>) => string;

/** This feature's strings and the app language. */
export function useT() {
  const { i18n } = useTranslation();
  if (!i18n.hasResourceBundle('en', ns)) {
    i18n.addResourceBundle('en', ns, en);
    i18n.addResourceBundle('ja', ns, ja);
  }
  const lang: 'en' | 'ja' = i18n.language === 'ja' ? 'ja' : 'en';
  const t: T = (key, vars) => i18n.t(key as never, { ns, ...vars } as never) as unknown as string;
  return { lang, t };
}

/** Japanese copy puts a space between a Latin word and the kana after it ("#portal を調べました"), as the boards do. */
export const gap = (lang: 'en' | 'ja', s: string) => (lang === 'ja' && /[A-Za-z0-9]$/.test(s) ? `${s} ` : s);

/** "#portal and 2 pages" / "#portal と…"; three or more through Intl.ListFormat ("a, b and c" / "a、b、c"). */
export function joinList(t: T, lang: 'en' | 'ja', items: string[]): string {
  if (items.length === 2) return t('pair', { a: gap(lang, items[0]!), b: items[1]! });
  return formatList(items, lang);
}
