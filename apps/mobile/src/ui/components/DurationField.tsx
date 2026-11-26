import { View } from 'react-native';
import { useFontScale } from '../hooks/useFontScale';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';
import { Text } from './Text';
import { TextField } from './TextField';

export interface DurationFieldProps {
  /** Visible label ("Duration"). Sub-fields are labelled "<label>, hours" for screen readers. */
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

/** Hours and minutes side by side (stacked at large text). Works in whole minutes. */
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
  const total = Math.max(0, Math.round(valueMin));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return (
    <View testID={testID} style={{ gap: space.xs }}>
      <Text variant="subhead" accessible={false}>
        {label}
      </Text>
      <View style={{ flexDirection: stacked ? 'column' : 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('duration.hours')}
            variant="number"
            suffix={t('duration.hoursShort')}
            value={String(hours)}
            disabled={disabled}
            onChangeText={(text) => onChange(toInt(text) * 60 + minutes)}
            testID={testID ? `${testID}-hours` : undefined}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('duration.minutes')}
            variant="number"
            suffix={t('duration.minutesShort')}
            value={String(minutes)}
            disabled={disabled}
            onChangeText={(text) => onChange(hours * 60 + toInt(text))}
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
