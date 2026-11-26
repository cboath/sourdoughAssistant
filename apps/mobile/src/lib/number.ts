/**
 * Locale-aware parsing of typed numbers (grams, percentages, counts). Money goes through core
 * `parseMoneyInput` instead. Pure, so it runs in plain Node tests.
 */
export type NumberParse =
  { ok: true; value: number; decimals: number } | { ok: false; reason: 'empty' | 'nan' };

/** The locale's decimal separator ("." or ","). */
export function decimalSeparator(locale: string): string {
  const part = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal');
  return part?.value ?? '.';
}

/**
 * Accepts digits with one decimal separator (the locale's, or "." as a fallback). Group
 * separators and spaces are not accepted. Never rounds: `decimals` reports what was typed.
 */
export function parseNumberInput(text: string, locale: string): NumberParse {
  const trimmed = text.trim().replace(/\s+/g, '');
  if (trimmed === '') return { ok: false, reason: 'empty' };
  const sep = decimalSeparator(locale);
  const normalized = sep === ',' ? trimmed.replace(',', '.') : trimmed;
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '.') return { ok: false, reason: 'nan' };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, reason: 'nan' };
  const decimals = normalized.includes('.') ? normalized.split('.')[1].length : 0;
  return { ok: true, value, decimals };
}

/** Plain text for an editable field: no grouping, locale decimal separator, up to `maxDecimals`. */
export function formatNumberInput(value: number, locale: string, maxDecimals = 2): string {
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}
