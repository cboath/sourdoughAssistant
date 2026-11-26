import { roundHalfUp, type Grams } from '../types';
import { fromGrams, type ConversionFactors } from './units';

export type UnitSystem = 'metric' | 'us';
export interface DisplayAmount {
  primary: string;
  secondary: string | null;
}

const FRACTIONS: Record<number, string> = { 1: '¼', 2: '½', 3: '¾' };

function nf(locale: string, maxDigits: number): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  });
}

/** Quarter-unit count (e.g. 9 for 2 1/4) -> '2 ¼'. */
function quartersText(quarters: number, locale: string): string {
  const whole = Math.floor(quarters / 4);
  const rem = quarters % 4;
  const wholeText = nf(locale, 0).format(whole);
  if (rem === 0) return wholeText;
  const frac = FRACTIONS[rem] as string;
  return whole === 0 ? frac : `${wholeText} ${frac}`;
}

function quarterAmount(
  grams: Grams,
  unit: 'cup' | 'tbsp' | 'tsp',
  factors: ConversionFactors,
  locale: string,
): string | null {
  const v = fromGrams(grams, unit, factors);
  if (!v.ok) return null;
  const quarters = roundHalfUp(v.value * 4);
  if (quarters <= 0) return null;
  const label = unit === 'cup' && quarters <= 4 ? 'cup' : unit === 'cup' ? 'cups' : unit;
  return `${quartersText(quarters, locale)} ${label}`;
}

/**
 * Grams first. Secondary is cups (nearest 1/4) when a density exists and unitSystem = 'us',
 * otherwise oz to 1 dp. Under 15 g, tsp/tbsp to the nearest 1/4 is used instead of cups.
 */
export function formatAmount(
  grams: Grams,
  opts: { unitSystem: UnitSystem; locale: string; factors?: ConversionFactors },
): DisplayAmount {
  const { unitSystem, locale, factors } = opts;
  const primaryNum = grams >= 10 ? roundHalfUp(grams) : roundHalfUp(grams * 10) / 10;
  const primary = `${nf(locale, 1).format(primaryNum)} g`;

  if (unitSystem === 'us' && factors && (factors.gramsPerCup ?? 0) > 0) {
    // Under 15 g: spoons. Otherwise cups, falling to the next smaller unit when it rounds to zero quarters.
    const order: Array<'cup' | 'tbsp' | 'tsp'> =
      grams < 15 ? ['tbsp', 'tsp'] : ['cup', 'tbsp', 'tsp'];
    for (const unit of order) {
      if (unit === 'tbsp') {
        // Prefer tsp when the amount is under one tablespoon.
        const tbsp = fromGrams(grams, 'tbsp', factors);
        if (tbsp.ok && roundHalfUp(tbsp.value * 4) < 4) continue;
      }
      const text = quarterAmount(grams, unit, factors, locale);
      if (text !== null) return { primary, secondary: text };
    }
  }

  const oz = fromGrams(grams, 'oz');
  const ozText = oz.ok ? `${nf(locale, 1).format(roundHalfUp(oz.value * 10) / 10)} oz` : null;
  return { primary, secondary: ozText };
}
