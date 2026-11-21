import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import en from './locales/en.json';
import ja from './locales/ja.json';

const ns = 'docs';

export type DocsKey = keyof typeof en;
export type DocsT = (key: DocsKey, vars?: Record<string, string | number>) => string;

export function useT(): DocsT {
  const { i18n } = useTranslation();
  if (!i18n.hasResourceBundle('en', ns)) {
    i18n.addResourceBundle('en', ns, en);
    i18n.addResourceBundle('ja', ns, ja);
  }
  const lang = i18n.language;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable per language, so effects can depend on it
  return useCallback((key, vars) => i18n.t(key as never, { ns, ...vars } as never) as unknown as string, [i18n, lang]);
}
