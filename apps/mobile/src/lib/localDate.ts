/** Date-only helpers for `LocalDate` strings ("YYYY-MM-DD"), with no time zone involved. */

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseLocalDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export function formatLocalDate({ year, month, day }: DateParts): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Keeps the day valid after a month or year change (31 Jan -> Feb gives 28/29). */
export function clampDay(parts: DateParts): DateParts {
  return { ...parts, day: Math.min(parts.day, daysInMonth(parts.year, parts.month)) };
}

/** Today in the device's zone as a `LocalDate`. */
export function todayLocalDate(now: Date = new Date()): string {
  return formatLocalDate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}

/** Display text in the locale, for example "Nov 26, 2026". */
export function displayLocalDate(value: string, locale: string): string {
  const parts = parseLocalDate(value);
  if (!parts) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day)),
  );
}
