import { currentLanguage, type Language } from './i18n';

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions, lng: Language = currentLanguage()) {
  return new Intl.DateTimeFormat(lng, options).format(date);
}

export function formatTime(date: Date, lng: Language = currentLanguage()) {
  return formatDate(date, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, lng);
}

/** "Maja Lind, Lea Aune and Erik Kvam" / "森 真由さん、青木 玲奈さん" (names already decorated). */
export function formatList(items: string[], lng: Language = currentLanguage()) {
  return listFormat(lng).format(items);
}

/** The same list in parts, so each item can be styled on its own ("**Nordlys** and **Fjell**"). */
export function listParts(items: string[], lng: Language = currentLanguage()) {
  return listFormat(lng).formatToParts(items);
}

function listFormat(lng: Language) {
  return new Intl.ListFormat(lng === 'en' ? 'en-GB' : lng, { type: 'conjunction' });
}

/** File sizes as the canvas shows them: 86 KB, 2.4 MB. Units are not translated. */
export function formatSize(bytes: number, lng: Language = currentLanguage()) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit >= 2 && value < 100 ? 1 : 0;
  return `${new Intl.NumberFormat(lng, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** 0:42, 12:08, 1:02:03 */
export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
