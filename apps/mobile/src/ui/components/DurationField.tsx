import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { t } from '../../lib/i18n';
import { useFontScale } from '../hooks/useFontScale';
import { useTheme } from '../theme';
import { Text } from './Text';
import { TextField } from './TextField';

export interface DurationFieldProps {
  /** Visible label ("Default"). Sub-fields are spoken as "<label>, hours" and "<label>, minutes". */
  label: string;
  /** Total minutes. */
  valueMin: number;
  onChange: (minutes: number) => void;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

const toInt = (text: string): number => {
  const n = Number.parseInt(text.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const split = (valueMin: number) => {
  const total = Math.max(0, Math.round(valueMin));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
};

/**
 * Hours and minutes side by side (stacked at large text). The value is reported on every change,
 * but the text is only normalized on blur (90 minutes becomes 1 h 30 min), so typing "90" or
 * clearing a field never fights the user.
 */
export function DurationField({
  label,
  valueMin,
  onChange,
  error,
  disabled,
  testID,
}: DurationFieldProps) {
  const { space } = useTheme();
  const { stacked } = useFontScale();
  const initial = split(valueMin);
  const [hoursText, setHoursText] = useState(String(initial.hours));
  const [minutesText, setMinutesText] = useState(String(initial.minutes));

  // Follow outside changes (a range toggle, "Use ...") without disturbing what is being typed.
  useEffect(() => {
    if (toInt(hoursText) * 60 + toInt(minutesText) === Math.round(valueMin)) return;
    const next = split(valueMin);
    setHoursText(String(next.hours));
    setMinutesText(String(next.minutes));
    // Only an external valueMin change should reset the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMin]);

  const normalize = () => {
    const next = split(toInt(hoursText) * 60 + toInt(minutesText));
    setHoursText(String(next.hours));
    setMinutesText(String(next.minutes));
  };

  return (
    <View testID={testID} style={{ gap: space.xs }}>
      <Text variant="subhead" accessible={false} importantForAccessibility="no">
        {label}
      </Text>
      <View style={{ flexDirection: stacked ? 'column' : 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('duration.hours')}
            accessibilityLabel={`${label}, ${t('duration.hours').toLocaleLowerCase()}`}
            variant="number"
            suffix={t('duration.hoursShort')}
            value={hoursText}
            disabled={disabled}
            onChangeText={(text) => {
              setHoursText(text);
              onChange(toInt(text) * 60 + toInt(minutesText));
            }}
            onBlur={normalize}
            testID={testID ? `${testID}-hours` : undefined}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('duration.minutes')}
            accessibilityLabel={`${label}, ${t('duration.minutes').toLocaleLowerCase()}`}
            variant="number"
            suffix={t('duration.minutesShort')}
            value={minutesText}
            disabled={disabled}
            onChangeText={(text) => {
              setMinutesText(text);
              onChange(toInt(hoursText) * 60 + toInt(text));
            }}
            onBlur={normalize}
            testID={testID ? `${testID}-minutes` : undefined}
          />
        </View>
      </View>
      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
