/** Wording for cost rows, shared by the cost screen and the detail card. */
import { formatMoney } from '@sourdough/core';
import { t } from '../../lib/i18n';
import { readableUnitCost, type PriceContext } from '../pantry/format';
import { formatGrams } from '../recipes/format';
import type { CostLineView } from './compute';

/** "$1.08", "<$0.01" or "Free"; null for lines without a cost. */
export function lineValueText(view: CostLineView, ctx: PriceContext): string | null {
  const { cost } = view;
  if (cost.status === 'free') return t('cost.line.free.value');
  if (cost.status !== 'priced' || cost.costCents === null) return null;
  if (cost.belowOneCent) {
    return t('cost.line.below', { money: formatMoney(1, ctx.currency, ctx.locale) });
  }
  return formatMoney(cost.costCents, ctx.currency, ctx.locale);
}

/** Spoken form of the line value ("less than $0.01"). */
export function lineValueSpoken(view: CostLineView, ctx: PriceContext): string | null {
  if (view.cost.belowOneCent) {
    return t('cost.line.belowLabel', { money: formatMoney(1, ctx.currency, ctx.locale) });
  }
  return lineValueText(view, ctx);
}

/** Second line of a cost row: "450 g at $0.24 per 100 g". */
export function lineDetailText(view: CostLineView, ctx: PriceContext): string {
  const { cost, item, source } = view;
  if (cost.status === 'unpriced' || cost.status === 'conversionError') {
    return item ? t('cost.line.unpriced', { item: item.name }) : t('cost.line.unlinked');
  }
  const billed = formatGrams(cost.billedG, ctx.locale);
  if (source.role === 'levain' && item) {
    return t('cost.line.levain', {
      flour: billed,
      amount: formatGrams(view.amountG, ctx.locale),
      item: item.name,
    });
  }
  if (cost.status === 'free') return t('cost.line.free', { grams: billed });
  const unit = item ? readableUnitCost(item, ctx) : null;
  return unit ? t('cost.line.priced', { grams: billed, unitCost: unit }) : billed;
}
