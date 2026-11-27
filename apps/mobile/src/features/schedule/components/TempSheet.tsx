import { celsiusToFahrenheit, fahrenheitToCelsius } from '@sourdough/core';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { t } from '../../../lib/i18n';
import { Button, Sheet, Stepper, Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { formatDuration } from '../../recipes/format';
import type { TempEffect } from '../tempEffect';
import { formatTemperature, spokenTemperature } from '../time';

export interface TempSheetProps {
  visible: boolean;
  /** Celsius. */
  current: number | null;
  /** Opens at this value when nothing is set: the last bake's, else 21 C / 70 F. */
  fallbackC: number;
  unit: 'C' | 'F';
  locale: string;
  effectsFor: (tempC: number) => TempEffect[];
  onSet: (tempC: number) => void;
  onClear: () => void;
  onClose: () => void;
}

const RANGE = { C: { min: 10, max: 40 }, F: { min: 50, max: 104 } } as const;

/** TEMP-SHEET (screens-bake.md 3.4): a stepper in the Settings unit with a live effect line. */
export function TempSheet({
  visible,
  current,
  fallbackC,
  unit,
  locale,
  effectsFor,
  onSet,
  onClear,
  onClose,
}: TempSheetProps) {
  const { space } = useTheme();
  const toDisplay = (c: number) => Math.round(unit === 'F' ? celsiusToFahrenheit(c) : c);
  const [value, setValue] = useState(() => toDisplay(current ?? fallbackC));
  useEffect(() => {
    if (visible) setValue(toDisplay(current ?? fallbackC));
    // Re-seed only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const range = RANGE[unit];
  // °F values are converted and kept unrounded; display rounds (screens-bake.md 3.4).
  const tempC = unit === 'F' ? fahrenheitToCelsius(value) : value;
  const effects = effectsFor(tempC);
  const first = effects[0];
  const preview = first
    ? first.capped && first.rawMinutes !== null
      ? t('temp.previewCapped', {
          step: first.stepName,
          duration: formatDuration(first.minutes, locale),
          rawDuration: formatDuration(first.rawMinutes, locale),
        })
      : t('temp.preview', {
          step: first.stepName,
          duration: formatDuration(first.minutes, locale),
          recipeDuration: formatDuration(first.recipeMinutes, locale),
        })
    : null;

  return (
    <Sheet visible={visible} onClose={onClose} title={t('temp.title')} testID="temp-sheet">
      <View style={{ padding: space.lg, gap: space.lg }}>
        <Text variant="footnote" color="textSecondary">
          {t('temp.help')}
        </Text>
        <View style={{ alignItems: 'center' }}>
          <Stepper
            testID="temp-stepper"
            label={t('temp.title')}
            value={value}
            min={range.min}
            max={range.max}
            onChange={setValue}
            formatValue={(v) => formatTemperature(unit === 'F' ? fahrenheitToCelsius(v) : v, unit)}
          />
        </View>
        <Text
          variant="callout"
          accessibilityLabel={`${spokenTemperature(tempC, unit)}. ${preview ?? ''}`}
        >
          {preview ?? ''}
        </Text>
        <Button
          size="lg"
          fullWidth
          label={Platform.OS === 'android' ? t('temp.setAndroid') : t('temp.set')}
          onPress={() => onSet(tempC)}
          testID="temp-set"
        />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.lg }}>
          {current !== null ? (
            <Button variant="text" label={t('temp.clear')} onPress={onClear} testID="temp-clear" />
          ) : null}
          <Button variant="text" label={t('temp.cancel')} onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}
