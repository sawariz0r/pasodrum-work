import { currentLanguage, type Language } from './i18n';

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions, lng: Language = currentLanguage()) {
  return new Intl.DateTimeFormat(lng, options).format(date);
}

export function formatTime(date: Date, lng: Language = currentLanguage()) {
  return formatDate(date, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, lng);
}
