/** Pure locale-to-defaults mapping. No native imports, so it runs in plain Node tests. */
import type { Settings } from '../db/types';

export interface LocaleInfo {
  regionCode: string | null;
  measurementSystem: 'metric' | 'us' | 'uk' | null;
  temperatureUnit: 'celsius' | 'fahrenheit' | null;
}

export type LocaleSettingsDefaults = Pick<Settings, 'unitSystem' | 'temperatureUnit'>;

/** US measurement or Fahrenheit region gives us/F; everything else metric/C (docs/data-model.md). */
export function settingsDefaultsForLocale(locale: LocaleInfo | undefined): LocaleSettingsDefaults {
  const usRegion = locale?.regionCode === 'US';
  const us = locale?.measurementSystem ? locale.measurementSystem === 'us' : usRegion;
  const fahrenheit = locale?.temperatureUnit ? locale.temperatureUnit === 'fahrenheit' : usRegion;
  return { unitSystem: us ? 'us' : 'metric', temperatureUnit: fahrenheit ? 'F' : 'C' };
}
