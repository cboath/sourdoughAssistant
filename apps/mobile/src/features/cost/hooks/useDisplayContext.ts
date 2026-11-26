import { useMemo } from 'react';
import type { UnitSystem } from '@sourdough/core';
import { useSettings } from '../../../state/settings';
import { useLocale } from '../../../ui/hooks/useLocale';

/** Everything formatting needs from the device and settings. */
export interface DisplayContext {
  locale: string;
  currency: string;
  unitSystem: UnitSystem;
}

/** Locale and currency from the device (override from Settings), unit system from Settings. */
export function useDisplayContext(): DisplayContext {
  const { locale, currency } = useLocale();
  const settings = useSettings((s) => s.settings);
  const resolvedCurrency = settings?.currencyOverride ?? currency;
  const unitSystem = settings?.unitSystem ?? 'metric';
  return useMemo(
    () => ({ locale, currency: resolvedCurrency, unitSystem }),
    [locale, resolvedCurrency, unitSystem],
  );
}
