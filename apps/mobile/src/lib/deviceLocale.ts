import { getLocales } from 'expo-localization';
import { settingsDefaultsForLocale, type LocaleSettingsDefaults } from './locale';

/** Unit defaults from the device's first preferred locale. */
export function getDeviceLocaleDefaults(): LocaleSettingsDefaults {
  const [first] = getLocales();
  return settingsDefaultsForLocale(first);
}
