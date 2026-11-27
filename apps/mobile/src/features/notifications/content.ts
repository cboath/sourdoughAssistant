/** Lock-screen text helpers (ADR 0011 section 4, SEC-01 L3). Pure. */
import { hourCycleOption } from '../../lib/hourCycle';
import { MAX_TEXT_LENGTH } from './constants';
import { cleanName } from '../../lib/sanitize';

/** Control and bidi-override characters out, whitespace collapsed, capped with an ellipsis. */
export function cleanText(value: string, max: number = MAX_TEXT_LENGTH): string {
  const cleaned = cleanName(value, 10_000);
  const chars = Array.from(cleaned);
  if (chars.length <= max) return cleaned;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

/** "Sat 10:00 AM" in the baker's zone, to tell two bakes of one recipe apart. */
export function formatDayTime(ms: number, zone: string, locale?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: 'numeric',
    ...hourCycleOption(),
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(ms);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(ms);
  }
}
