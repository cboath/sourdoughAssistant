import { formatAmount, formatMoney, type UnitSystem } from '@sourdough/core';
import { useLocale } from '../hooks/useLocale';
import { Text, type TextProps } from './Text';

type FormatTextProps = Omit<TextProps, 'children' | 'numeric'>;

export interface MoneyTextProps extends FormatTextProps {
  /** Minor units (cents). Fractional values are allowed for per-unit costs with `perUnit`. */
  cents: number;
  currency?: string;
  locale?: string;
  /** Per-unit costs ("$0.0024 per g") show up to 4 fraction digits; totals show the currency's own. */
  perUnit?: string;
}

/** Pure, so screens and tests can format without rendering. */
export function formatPerUnitMoney(
  cents: number,
  currency: string,
  locale: string,
  perUnit: string,
): string {
  const digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits ?? 2,
    maximumFractionDigits: 4,
  }).format(cents / 10 ** (digits ?? 2));
  return `${formatted} per ${perUnit}`;
}

export function MoneyText({ cents, currency, locale, perUnit, ...rest }: MoneyTextProps) {
  const device = useLocale();
  const resolvedLocale = locale ?? device.locale;
  const resolvedCurrency = currency ?? device.currency;
  const text = perUnit
    ? formatPerUnitMoney(cents, resolvedCurrency, resolvedLocale, perUnit)
    : formatMoney(cents, resolvedCurrency, resolvedLocale);
  // The currency symbol stays in the label so the platform reads it as money.
  return (
    <Text numeric accessibilityLabel={text} {...rest}>
      {text}
    </Text>
  );
}

export interface QuantityTextProps extends FormatTextProps {
  grams: number;
  unitSystem: UnitSystem;
  locale?: string;
  /** Show the secondary display ("about 3¾ cups") under the grams. */
  showSecondary?: boolean;
  /** Grams per cup etc., so volume secondaries can be shown. */
  factors?: Parameters<typeof formatAmount>[1]['factors'];
}

export function QuantityText({
  grams,
  unitSystem,
  locale,
  showSecondary = false,
  factors,
  ...rest
}: QuantityTextProps) {
  const device = useLocale();
  const amount = formatAmount(grams, { unitSystem, locale: locale ?? device.locale, factors });
  const text =
    showSecondary && amount.secondary
      ? `${amount.primary} · about ${amount.secondary}`
      : amount.primary;
  return (
    <Text numeric accessibilityLabel={text} {...rest}>
      {text}
    </Text>
  );
}
