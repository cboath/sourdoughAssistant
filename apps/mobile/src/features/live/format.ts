/**
 * Countdown and overtime text (screens-bake.md 0.2). Under an hour the hero shows `MM:SS`;
 * above it, whole hours and minutes. The same numbers have a spoken form for screen readers.
 */
import { t } from '../../lib/i18n';
import { formatDuration, spokenDuration } from '../recipes/format';

const MIN_MS = 60_000;

/** "42:10". Seconds round up, so the display reads 0:00 only at the moment the time is up. */
export function clockDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "1 d 4 h", "5 h 42 min", "42:10". */
export function formatCountdown(ms: number, locale: string): string {
  if (ms < 60 * MIN_MS) return clockDuration(ms);
  return formatDuration(Math.floor(ms / MIN_MS), locale);
}

/** "12:30" under an hour, "1 h 5 min" from an hour. */
export function formatOverrun(ms: number, locale: string): string {
  if (ms < 60 * MIN_MS) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }
  return formatDuration(Math.floor(ms / MIN_MS), locale);
}

export const overText = (ms: number, locale: string): string =>
  t('live.over', { duration: formatOverrun(ms, locale) });

/** Whole minutes, never seconds ("42 minutes", "Less than 1 minute"): refreshed once a minute (DR2-14). */
export function spokenCountdown(ms: number, locale: string): string {
  if (ms < MIN_MS) return t('live.spoken.lessThanMinute');
  return spokenDuration(Math.floor(ms / MIN_MS), locale);
}

/** Splits "5 h 42 min" into numeral runs and unit runs, so units can be set smaller (DR2-03). */
export function countdownRuns(text: string): Array<{ text: string; unit: boolean }> {
  return text
    .split(/([A-Za-z]+)/)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, unit: /[A-Za-z]/.test(part) }));
}

/** Home card: minutes only. "2 h 14 min left", "42 min left", "Less than 1 min left". */
export function cardLeft(ms: number, locale: string): string {
  if (ms < MIN_MS) return t('home.card.lessThanMin');
  return t('home.card.left', { duration: formatDuration(Math.floor(ms / MIN_MS), locale) });
}

export function cardOver(ms: number, locale: string): string {
  return t('home.card.over', {
    duration: formatDuration(Math.max(1, Math.floor(ms / MIN_MS)), locale),
  });
}

export function spokenOver(ms: number, locale: string): string {
  return spokenCountdown(ms, locale);
}

/** "40 min later" / "20 min earlier". */
export function deltaText(deltaMin: number, locale: string): string {
  const duration = formatDuration(Math.abs(deltaMin), locale);
  return t(deltaMin >= 0 ? 'live.delta.later' : 'live.delta.earlier', { duration });
}

/** "+40 min" / "−20 min" (a true minus sign), for snackbars. */
export function signedMinutes(deltaMin: number, locale: string): string {
  const duration = formatDuration(Math.abs(deltaMin), locale);
  return `${deltaMin >= 0 ? '+' : '−'}${duration}`;
}
