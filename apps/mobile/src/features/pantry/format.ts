/** Pure formatting and status helpers for pantry items (screens-recipes.md sections 0.2, 1, 2). */
import {
  GRAMS_PER_UNIT,
  currencyMinorDigits,
  formatMoney,
  packageGrams,
  roundHalfUp,
  unitCostCentsPerGram,
  type ConversionFactors,
  type PricedPackage,
  type Unit,
  type UnitSystem,
} from '@sourdough/core';
import type { PantryItem, PriceHistoryEntry } from '../../db/types';
import { t, type MessageKey } from '../../lib/i18n';
import { formatPercent } from '../recipes/format';

export interface PriceContext {
  locale: string;
  currency: string;
  unitSystem: UnitSystem;
}

export type ItemPriceStatus = 'unpriced' | 'free' | 'priced' | 'needsDensity' | 'needsEach';

export const UNIT_SHORT: Record<Unit, string> = {
  g: 'g',
  kg: 'kg',
  oz: 'oz',
  lb: 'lb',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'cup',
  floz: 'fl oz',
  qt: 'qt',
  gal: 'gal',
  each: 'each',
};

/** The item as a core package, or null when it has no price. */
export function pricedPackage(
  item: Pick<
    PantryItem,
    'packagePriceCents' | 'packageSize' | 'packageUnit' | 'gramsPerCup' | 'gramsPerEach'
  >,
): PricedPackage | null {
  if (item.packagePriceCents === null || item.packageSize === null || item.packageUnit === null) {
    return null;
  }
  return {
    priceCents: item.packagePriceCents,
    size: item.packageSize,
    unit: item.packageUnit,
    gramsPerCup: item.gramsPerCup,
    gramsPerEach: item.gramsPerEach,
  };
}

export function itemStatus(item: Parameters<typeof pricedPackage>[0]): ItemPriceStatus {
  const pkg = pricedPackage(item);
  if (!pkg) return 'unpriced';
  const grams = packageGrams(pkg);
  if (!grams.ok) {
    if (grams.error.code === 'missingDensity') return 'needsDensity';
    if (grams.error.code === 'missingEachWeight') return 'needsEach';
    return 'unpriced';
  }
  return pkg.priceCents === 0 ? 'free' : 'priced';
}

/** Currency text for a fractional minor-unit value. `extraDigits` allows per-gram precision. */
export function formatMoneyDigits(
  cents: number,
  ctx: Pick<PriceContext, 'locale' | 'currency'>,
  extraDigits = 0,
): string {
  const digits = currencyMinorDigits(ctx.currency);
  const make = (max: number) =>
    new Intl.NumberFormat(ctx.locale, {
      style: 'currency',
      currency: ctx.currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: max,
    }).format(cents / 10 ** digits);
  const normal = make(digits + extraDigits);
  // A positive price that would show as zero reads as free, so show more digits.
  if (cents > 0 && roundHalfUp(cents * 10 ** extraDigits) === 0 && extraDigits === 0) {
    return make(digits + 2);
  }
  return normal;
}

/** "$0.24 per 100 g", "$1.09 per lb", "$0.50 each", "Free", or null when it can't be worked out. */
export function readableUnitCost(
  item: Parameters<typeof pricedPackage>[0],
  ctx: PriceContext,
): string | null {
  const status = itemStatus(item);
  if (status === 'free') return t('pantry.row.free');
  if (status !== 'priced') return null;
  const pkg = pricedPackage(item) as PricedPackage;
  if (pkg.unit === 'each') {
    return t('pantry.row.each', {
      price: formatMoneyDigits(pkg.priceCents / pkg.size, ctx),
    });
  }
  const perG = unitCostCentsPerGram(pkg);
  if (!perG.ok) return null;
  if (ctx.unitSystem === 'us') {
    return t('pantry.row.perLb', {
      price: formatMoneyDigits(perG.value * GRAMS_PER_UNIT.lb, ctx),
    });
  }
  return t('pantry.row.per100g', { price: formatMoneyDigits(perG.value * 100, ctx) });
}

/** "$0.0024 per g" for the detail card, or null. */
export function perGramText(
  item: Parameters<typeof pricedPackage>[0],
  ctx: PriceContext,
): string | null {
  const pkg = pricedPackage(item);
  if (!pkg || itemStatus(item) !== 'priced') return null;
  const perG = unitCostCentsPerGram(pkg);
  if (!perG.ok) return null;
  return t('pantry.detail.perG', {
    price: formatMoneyDigits(perG.value, ctx, 2),
  });
}

export function formatSize(size: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(size);
}

/** "5 lb" */
export function sizeText(size: number, unit: Unit, locale: string): string {
  return `${formatSize(size, locale)} ${UNIT_SHORT[unit]}`;
}

/** The size in the other measuring system for a weight package ("2.27 kg"), or null. */
export function convertedSizeText(
  size: number,
  unit: Unit,
  ctx: Pick<PriceContext, 'locale' | 'unitSystem'>,
): string | null {
  const grams =
    unit === 'g' || unit === 'kg' || unit === 'oz' || unit === 'lb'
      ? size * GRAMS_PER_UNIT[unit]
      : null;
  if (grams === null) return null;
  const imperial = unit === 'oz' || unit === 'lb';
  if (ctx.unitSystem === 'metric' && imperial) {
    return grams >= 1000
      ? sizeText(grams / 1000, 'kg', ctx.locale)
      : sizeText(roundHalfUp(grams), 'g', ctx.locale);
  }
  if (ctx.unitSystem === 'us' && !imperial) {
    const lb = grams / GRAMS_PER_UNIT.lb;
    return lb >= 1
      ? sizeText(lb, 'lb', ctx.locale)
      : sizeText(grams / GRAMS_PER_UNIT.oz, 'oz', ctx.locale);
  }
  return null;
}

/** "$2.40 for 1 kg" */
export function packageText(
  item: Pick<PantryItem, 'packagePriceCents' | 'packageSize' | 'packageUnit'>,
  ctx: PriceContext,
): string | null {
  if (item.packagePriceCents === null || item.packageSize === null || item.packageUnit === null) {
    return null;
  }
  return t('pantry.row.package', {
    price: formatMoney(item.packagePriceCents, ctx.currency, ctx.locale),
    size: sizeText(item.packageSize, item.packageUnit, ctx.locale),
  });
}

export function categoryLabel(category: PantryItem['category']): string {
  return t(`pantry.cat.${category}` as MessageKey);
}

export type PriceChange =
  { kind: 'up' | 'down'; pct: number } | { kind: 'same' | 'wasFree' | 'unknown' };

/** Cost per gram of a history row, with the item's current conversion factors. */
export function entryCostPerGram(
  entry: Pick<PriceHistoryEntry, 'packagePriceCents' | 'packageSize' | 'packageUnit'>,
  factors: ConversionFactors,
): number | null {
  const result = unitCostCentsPerGram({
    priceCents: entry.packagePriceCents,
    size: entry.packageSize,
    unit: entry.packageUnit,
    gramsPerCup: factors.gramsPerCup,
    gramsPerEach: factors.gramsPerEach,
  });
  return result.ok ? result.value : null;
}

/** Change in cost per gram versus the next older row (package-size changes compare fairly). */
export function priceChange(
  newer: PriceHistoryEntry,
  older: PriceHistoryEntry,
  factors: ConversionFactors,
): PriceChange {
  const a = entryCostPerGram(newer, factors);
  const b = entryCostPerGram(older, factors);
  if (a === null || b === null) return { kind: 'unknown' };
  if (b === 0) return a === 0 ? { kind: 'same' } : { kind: 'wasFree' };
  const pct = ((a - b) / b) * 100;
  if (Math.abs(pct) < 0.5) return { kind: 'same' };
  return { kind: pct > 0 ? 'up' : 'down', pct: Math.round(Math.abs(pct)) };
}

export function priceChangeText(change: PriceChange, locale: string): string | null {
  switch (change.kind) {
    case 'up':
      return t('pantry.detail.up', { pct: formatPercent(change.pct, locale, 0) });
    case 'down':
      return t('pantry.detail.down', { pct: formatPercent(change.pct, locale, 0) });
    case 'same':
      return t('pantry.detail.same');
    case 'wasFree':
      return t('pantry.detail.wasFree');
    default:
      return null;
  }
}
