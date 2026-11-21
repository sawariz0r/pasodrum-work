import { useTranslation } from 'react-i18next';
import en from './locales/en.json';
import ja from './locales/ja.json';

const ns = 'pins';

export function useT() {
  const { i18n } = useTranslation();
  if (!i18n.hasResourceBundle('en', ns)) {
    i18n.addResourceBundle('en', ns, en);
    i18n.addResourceBundle('ja', ns, ja);
  }
  return (key: keyof typeof en) => i18n.t(key as never, { ns } as never) as unknown as string;
}
