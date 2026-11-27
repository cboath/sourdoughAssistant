/** Shared number formatting for recipe, cost and pantry screens (screens-recipes.md section 0.2). */
import { formatAmount, percent, type ConversionFactors, type UnitSystem } from '@sourdough/core';
import { t, type MessageKey } from '../../lib/i18n';

/** `77.3` -> "77.3%" (de-DE "77,3 %"). `dp` decimals, default 1. */
export function formatPercent(value: number, locale: string, dp = 1): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(value / 100);
}

/** A percentage of `num / den` to one decimal, or the en dash when it can't be computed. */
export function formatRatioPercent(num: number, den: number, locale: string): string {
  const pct = percent(num, den, 1);
  return pct === null ? '–' : formatPercent(pct, locale);
}

/** "1,001 g" (whole grams; 1 decimal under 10 g when not whole). */
export function formatGrams(grams: number, locale: string): string {
  return formatAmount(grams, { unitSystem: 'metric', locale }).primary;
}

export interface AmountDisplay {
  primary: string;
  /** "about 3¾ cups" or null. */
  secondary: string | null;
}

export function amountDisplay(
  grams: number,
  ctx: { locale: string; unitSystem: UnitSystem },
  factors?: ConversionFactors,
): AmountDisplay {
  const a = formatAmount(grams, { unitSystem: ctx.unitSystem, locale: ctx.locale, factors });
  return {
    primary: a.primary,
    secondary: a.secondary ? t('amount.about', { amount: a.secondary }) : null,
  };
}

/** `45 min`, `6 h`, `6 h 30 min`, `1 d 4 h` */
export function formatDuration(minutes: number, locale: string): string {
  const total = Math.max(0, Math.round(minutes));
  const n = (v: number) => new Intl.NumberFormat(locale).format(v);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return h > 0 ? `${n(d)} d ${n(h)} h` : `${n(d)} d`;
  if (h > 0) return m > 0 ? `${n(h)} h ${n(m)} min` : `${n(h)} h`;
  return `${n(m)} min`;
}

/** `30 min–2 h`; `5–8 h` when both are whole hours. */
export function formatRange(minMin: number, maxMin: number, locale: string): string {
  const wholeHours = minMin % 60 === 0 && maxMin % 60 === 0 && minMin >= 60;
  if (wholeHours && maxMin < 1440) {
    const n = (v: number) => new Intl.NumberFormat(locale).format(v / 60);
    return `${n(minMin)}–${n(maxMin)} h`;
  }
  return `${formatDuration(minMin, locale)}–${formatDuration(maxMin, locale)}`;
}

/** Spoken form of `formatDuration`, for accessibility labels. */
export function spokenDuration(minutes: number, locale: string): string {
  const total = Math.max(0, Math.round(minutes));
  const n = (v: number) => new Intl.NumberFormat(locale).format(v);
  const unit = (v: number, one: string) => `${n(v)} ${one}${v === 1 ? '' : 's'}`;
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts = [
    d > 0 ? unit(d, 'day') : '',
    h > 0 ? unit(h, 'hour') : '',
    m > 0 || total === 0 ? unit(m, 'minute') : '',
  ].filter(Boolean);
  return parts.join(' ');
}

export const loavesText = (count: number): string => {
  // Local import avoided: tp() lives in i18n.
  return count === 1
    ? t('recipes.row.loaves.one', { count })
    : t('recipes.row.loaves.other', { count });
};

const SPOKEN_UNITS: Record<string, MessageKey> = {
  kg: 'unit.kg',
  g: 'unit.g',
  oz: 'unit.oz',
  lb: 'unit.lb',
  ml: 'unit.ml',
  tbsp: 'unit.tbsp',
  tsp: 'unit.tsp',
  cup: 'unit.cup',
  cups: 'unit.cup',
  '%': 'unit.percent',
};
const FRACTIONS: Record<string, MessageKey> = {
  '¼': 'speak.quarter',
  '½': 'speak.half',
  '¾': 'speak.threeQuarters',
};

/**
 * Turns a display string into something a screen reader says well ("450 g · about 3¾ cups" ->
 * "450 grams, about 3 and three quarters cups", "–" -> "not available"). Display text stays as is.
 */
export function speakable(text: string): string {
  if (text.trim() === '–') return t('common.notAvailable');
  return text
    .replace(/([¼½¾])/g, (_m, f: string) => ` ${t(FRACTIONS[f] as MessageKey)}`)
    .replace(
      /(\d)\s?(kg|g|oz|lb|ml|tbsp|tsp|cups?|%)(?![\p{L}])/gu,
      (_m, n: string, unit: string) => `${n} ${t(SPOKEN_UNITS[unit] as MessageKey)}`,
    )
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
