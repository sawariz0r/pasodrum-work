import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import ja from '../locales/ja.json';

export const languages = ['en', 'ja'] as const;
export type Language = (typeof languages)[number];

export const resources = {
  en: { translation: en },
  ja: { translation: ja },
} as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['en'];
  }
}

const storageKey = 'pasodrum.language';

export function resolveLanguage(stored: string | null, browser: readonly string[]): Language {
  if (stored === 'en' || stored === 'ja') return stored;
  return browser[0]?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function initI18n() {
  const lng = resolveLanguage(readStored(), navigator.languages ?? [navigator.language]);
  i18n.on('languageChanged', (l) => {
    document.documentElement.lang = l;
  });
  void i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en',
    supportedLngs: languages,
    initAsync: false,
    interpolation: { escapeValue: false },
  });
  return i18n;
}

export function setLanguage(lng: Language) {
  try {
    localStorage.setItem(storageKey, lng);
  } catch {
    // Private mode or blocked storage: the choice still applies to this session.
  }
  return i18n.changeLanguage(lng);
}

export function currentLanguage(): Language {
  return i18n.resolvedLanguage === 'ja' ? 'ja' : 'en';
}
