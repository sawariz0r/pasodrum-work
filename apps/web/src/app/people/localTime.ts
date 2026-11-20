import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';
import { currentLanguage } from '../i18n';

// Japanese names for the cities our people are in; any other zone shows its English city name.
const cities = {
  Tokyo: 'people.city.tokyo',
  Oslo: 'people.city.oslo',
  Stockholm: 'people.city.stockholm',
  Copenhagen: 'people.city.copenhagen',
  Helsinki: 'people.city.helsinki',
  London: 'people.city.london',
  Berlin: 'people.city.berlin',
  Paris: 'people.city.paris',
  Amsterdam: 'people.city.amsterdam',
  'New York': 'people.city.newYork',
} as const;

/** "Asia/Tokyo" → "Tokyo"; undefined for zones that aren't a place. */
export function cityOf(timeZone: string): string | undefined {
  const last = timeZone.split('/').pop() ?? '';
  if (!timeZone.includes('/') || /^(GMT|UTC|Etc)/i.test(last)) return undefined;
  return last.replace(/_/g, ' ');
}

/** The time now in a zone, 24-hour; undefined when the zone is unknown. */
export function timeIn(timeZone: string, now: Date, lng: Language = currentLanguage()): string | undefined {
  try {
    return new Intl.DateTimeFormat(lng, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(now);
  } catch {
    return undefined;
  }
}

/** "10:14 · Oslo" / "18:14・東京", or undefined (the line is hidden). */
export function useLocalTime(timeZone: string | undefined, now: Date): string | undefined {
  const { t } = useTranslation();
  if (!timeZone) return undefined;
  const time = timeIn(timeZone, now);
  if (!time) return undefined;
  const city = cityOf(timeZone);
  if (!city) return time;
  const key = cities[city as keyof typeof cities];
  return t('people.localTime', { time, city: key ? t(key) : city });
}
