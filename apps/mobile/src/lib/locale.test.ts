import { settingsDefaultsForLocale } from './locale';

describe('settingsDefaultsForLocale', () => {
  it('maps en-US to us / F', () => {
    expect(
      settingsDefaultsForLocale({
        regionCode: 'US',
        measurementSystem: 'us',
        temperatureUnit: 'fahrenheit',
      }),
    ).toEqual({ unitSystem: 'us', temperatureUnit: 'F' });
  });
  it('maps metric and uk to metric / C', () => {
    expect(
      settingsDefaultsForLocale({
        regionCode: 'GB',
        measurementSystem: 'uk',
        temperatureUnit: 'celsius',
      }),
    ).toEqual({ unitSystem: 'metric', temperatureUnit: 'C' });
  });
  it('uses the region when the device reports no system', () => {
    expect(
      settingsDefaultsForLocale({
        regionCode: 'US',
        measurementSystem: null,
        temperatureUnit: null,
      }),
    ).toEqual({ unitSystem: 'us', temperatureUnit: 'F' });
  });
  it('falls back to metric / C without a locale', () => {
    expect(settingsDefaultsForLocale(undefined)).toEqual({
      unitSystem: 'metric',
      temperatureUnit: 'C',
    });
  });
  it('allows a metric measurement system with Fahrenheit', () => {
    expect(
      settingsDefaultsForLocale({
        regionCode: 'US',
        measurementSystem: 'metric',
        temperatureUnit: 'fahrenheit',
      }),
    ).toEqual({ unitSystem: 'metric', temperatureUnit: 'F' });
  });
});
