/**
 * Time formatting for the schedule screens (screens-bake.md 0.2). Every instant is an epoch-ms
 * UTC value rendered in an explicit IANA zone, so the same code runs in tests with a fixed zone
 * (ADR 0005). Strings come from the i18n layer; Intl does the locale work.
 */
import { hourCycleOption } from '../../lib/hourCycle';
import { celsiusToFahrenheit, utcToLocal, type EpochMs, type IanaZone } from '@sourdough/core';
import { t } from '../../lib/i18n';
import { formatDuration, spokenDuration } from '../recipes/format';

export interface TimeContext {
  zone: IanaZone;
  locale: string;
  /** Reference instant for "Today" / "Tomorrow". */
  now: EpochMs;
}

const NBSP = ' ';

const dayNumber = (date: string): number => {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** The `YYYY-MM-DD` of an instant in the zone. */
export const localDateKey = (at: EpochMs, zone: IanaZone): string => utcToLocal(at, zone).date;

/** Whole calendar days from `now` to `at` in the zone (0 = same day). */
export function dayOffset(at: EpochMs, now: EpochMs, zone: IanaZone): number {
  return dayNumber(localDateKey(at, zone)) - dayNumber(localDateKey(now, zone));
}

/** "3:05 AM" / "03:05" by locale. */
export function formatClock(at: EpochMs, zone: IanaZone, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    ...hourCycleOption(),
    minute: '2-digit',
    timeZone: zone,
  }).format(at);
}

const weekday = (at: EpochMs, zone: IanaZone, locale: string, style: 'short' | 'long') =>
  new Intl.DateTimeFormat(locale, { weekday: style, timeZone: zone }).format(at);

/** "Fri, Dec 4" */
export function formatShortDate(at: EpochMs, zone: IanaZone, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: zone,
  }).format(at);
}

/**
 * "Today 3:05 AM", "Tomorrow 3:05 AM", "Fri 3:05 AM" (within 6 days), otherwise "Fri, Dec 4 3:05 AM".
 * `spoken` always uses the full weekday.
 */
export function formatDayTime(at: EpochMs, ctx: TimeContext, spoken = false): string {
  const offset = dayOffset(at, ctx.now, ctx.zone);
  const time = formatClock(at, ctx.zone, ctx.locale);
  let day: string;
  if (offset === 0) day = t('time.today');
  else if (offset === 1) day = t('time.tomorrow');
  else if (offset > 1 && offset <= 6)
    day = weekday(at, ctx.zone, ctx.locale, spoken ? 'long' : 'short');
  else if (spoken) {
    day = new Intl.DateTimeFormat(ctx.locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: ctx.zone,
    }).format(at);
  } else day = formatShortDate(at, ctx.zone, ctx.locale);
  return `${day} ${time}`;
}

/** "Friday, November 27" (with the year when it isn't the current one). */
export function formatDayHeader(at: EpochMs, ctx: TimeContext): string {
  const sameYear =
    localDateKey(at, ctx.zone).slice(0, 4) === localDateKey(ctx.now, ctx.zone).slice(0, 4);
  return new Intl.DateTimeFormat(ctx.locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: ctx.zone,
  }).format(at);
}

/** "Sat, Nov 28 · 10:00 AM" */
export function formatReadyValue(at: EpochMs, zone: IanaZone, locale: string): string {
  return `${formatShortDate(at, zone, locale)} · ${formatClock(at, zone, locale)}`;
}

/** Spoken: "Saturday, November 28, 10:00 AM". */
export function spokenReadyValue(at: EpochMs, zone: IanaZone, locale: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: zone,
  }).format(at);
  return `${date}, ${formatClock(at, zone, locale)}`;
}

/** "Nov 1" / "Sun, Nov 1" for the DST helper lines. */
export function formatMonthDay(at: EpochMs, zone: IanaZone, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: zone,
  }).format(at);
}

/** Spans keep hours up to 48 h: "30 h 55 min" (screens-bake.md 0.2). */
export function formatSpan(minutes: number, locale: string): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 48 * 60) {
    const n = (v: number) => new Intl.NumberFormat(locale).format(v);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${n(m)} min`;
    return m > 0 ? `${n(h)} h ${n(m)} min` : `${n(h)} h`;
  }
  return formatDuration(total, locale);
}

export function spokenSpan(minutes: number, locale: string): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 48 * 60) {
    const unit = (v: number, one: string) => `${v} ${one}${v === 1 ? '' : 's'}`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return [h > 0 ? unit(h, 'hour') : '', m > 0 || total === 0 ? unit(m, 'minute') : '']
      .filter(Boolean)
      .join(' ');
  }
  return spokenDuration(total, locale);
}

/** "in 1 d 13 h" */
export function formatRelativeIn(at: EpochMs, now: EpochMs, locale: string): string {
  const minutes = Math.max(0, Math.round((at - now) / 60_000));
  return t('time.inDuration', { duration: formatDuration(minutes, locale) });
}

/** Minutes after midnight as a clock string: 1320 gives "10 PM". */
export function formatMinuteOfDay(minuteOfDay: number, locale: string): string {
  const date = new Date(Date.UTC(1970, 0, 1, Math.floor(minuteOfDay / 60), minuteOfDay % 60));
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    ...hourCycleOption(),
    minute: minuteOfDay % 60 === 0 ? undefined : '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

/** "27 °C" or "81 °F" (whole degrees, no-break space). `tempC` is always stored in Celsius. */
export function formatTemperature(tempC: number, unit: 'C' | 'F'): string {
  const value = unit === 'F' ? celsiusToFahrenheit(tempC) : tempC;
  return `${Math.round(value)}${NBSP}°${unit}`;
}

export function spokenTemperature(tempC: number, unit: 'C' | 'F'): string {
  const value = unit === 'F' ? celsiusToFahrenheit(tempC) : tempC;
  return `${Math.round(value)} degrees ${unit === 'F' ? 'Fahrenheit' : 'Celsius'}`;
}

/** "12–24 h" or "5–8 h" for whole hours (even past a day, so "12–24 h"), else "30 min–2 h". */
export function formatPlanRange(minMin: number, maxMin: number, locale: string): string {
  if (minMin >= 60 && minMin % 60 === 0 && maxMin % 60 === 0) {
    const n = (v: number) => new Intl.NumberFormat(locale).format(v / 60);
    return `${n(minMin)}–${n(maxMin)} h`;
  }
  return `${formatDuration(minMin, locale)}–${formatDuration(maxMin, locale)}`;
}
