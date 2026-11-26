import { addDays, zonedDate } from '@/lib/call-date';
import { formatCallDate } from '@/lib/format';
import { locale } from '@/lib/locale';
import { t } from '@/lib/t';

/**
 * The expected-ready-time sentence shown at upload and while a call waits
 * (design scope): «نتایج تا ساعت ۹ صبح فردا، ۱۴۰۵/۰۷/۲۸، آماده می‌شود».
 * Relative words (امروز / فردا) are judged in the profile's time zone.
 */
export function readyTimeMessage(readyAt: string | Date, now = new Date()): string {
  const ready = new Date(readyAt);
  const readyDay = zonedDate(ready, locale.timeZone);
  const date = formatCallDate(readyDay);
  if (ready.getTime() <= now.getTime()) return t('readyAt.overdue', { date });
  const today = zonedDate(now, locale.timeZone);
  if (readyDay === today) return t('readyAt.today', { date });
  if (readyDay === addDays(today, 1)) return t('readyAt.tomorrow', { date });
  return t('readyAt.date', { date });
}
