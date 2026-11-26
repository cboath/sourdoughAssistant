import { getLocales } from 'expo-localization';

export interface LocaleInfoForFormatting {
  /** BCP 47 tag, e.g. "en-US". */
  locale: string;
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
}

/** Device locale and currency. `settings.currencyOverride` is applied by callers that have settings. */
export function useLocale(): LocaleInfoForFormatting {
  const first = getLocales()[0];
  return { locale: first?.languageTag ?? 'en-US', currency: first?.currencyCode ?? 'USD' };
}
