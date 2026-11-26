import { err, ok, type Cents, type Result } from '../types';

/** ISO 4217 minor digits via Intl (USD 2, JPY 0, KWD 3). */
export function currencyMinorDigits(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits as number;
}

export function formatMoney(cents: Cents, currency: string, locale: string): string {
  const digits = currencyMinorDigits(currency);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    cents / 10 ** digits,
  );
}

export type MoneyParseError = {
  code: 'empty' | 'notANumber' | 'negative' | 'tooManyDecimals';
  maxDecimals?: number;
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/** Locale-aware parse ('1,99' in de-DE). Rejects (never rounds) extra decimals (AMB-15). */
export function parseMoneyInput(
  text: string,
  currency: string,
  locale: string,
): Result<Cents, MoneyParseError> {
  const digits = currencyMinorDigits(currency);
  const numParts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  const decimal = numParts.find((p) => p.type === 'decimal')?.value ?? '.';
  const group = numParts.find((p) => p.type === 'group')?.value ?? ',';

  // Remove currency decorations: the locale's symbols, the ISO code, and common symbols.
  const decorations = new Set<string>(['$', '€', '£', '¥', '￥', currency.toUpperCase()]);
  for (const display of ['symbol', 'narrowSymbol', 'code'] as const) {
    try {
      const parts = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: display,
      }).formatToParts(1);
      for (const p of parts) if (p.type === 'currency') decorations.add(p.value);
    } catch {
      /* unsupported display style: ignore */
    }
  }
  let s = text;
  for (const d of [...decorations].sort((a, b) => b.length - a.length)) s = s.split(d).join('');
  s = s.replace(/[\s\u00a0\u202f]/g, '');
  if (s === '') return err({ code: 'empty' });

  let negative = false;
  if (/^[-−]/.test(s)) {
    negative = true;
    s = s.slice(1);
  } else if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  const g = escapeRe(group.replace(/[\s\u00a0\u202f]/g, ''));
  const d = escapeRe(decimal);
  const intPart = g ? `(?:\\d+|\\d{1,3}(?:${g}\\d{3})+)` : '\\d+';
  const re = new RegExp(`^(${intPart})?(?:${d}(\\d+))?$`);
  const m = re.exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) return err({ code: 'notANumber' });
  if (negative) return err({ code: 'negative' });

  const frac = m[2] ?? '';
  if (frac.length > digits) return err({ code: 'tooManyDecimals', maxDecimals: digits });
  const intDigits = (m[1] ?? '0').replace(new RegExp(g || '(?!)', 'g'), '');
  const cents = Number(intDigits) * 10 ** digits + Number(frac.padEnd(digits, '0') || '0');
  if (!Number.isSafeInteger(cents)) return err({ code: 'notANumber' });
  return ok(cents);
}
