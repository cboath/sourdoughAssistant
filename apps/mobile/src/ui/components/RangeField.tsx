import { View } from 'react-native';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';
import { DurationField } from './DurationField';
import { ListRow } from './ListRow';
import { Text } from './Text';

export interface DurationRange {
  minMin: number;
  defaultMin: number;
  maxMin: number;
}

export interface RangeFieldProps {
  label: string;
  /** `null` means "No range": only the default duration applies. */
  range: DurationRange | null;
  /** Used for the default when there is no range. */
  defaultMin: number;
  onChange: (next: { range: DurationRange | null; defaultMin: number }) => void;
  testID?: string;
}

/** True when min <= default <= max. */
export function isRangeValid(range: DurationRange): boolean {
  return range.minMin <= range.defaultMin && range.defaultMin <= range.maxMin;
}

export function RangeField({ label, range, defaultMin, onChange, testID }: RangeFieldProps) {
  const { space } = useTheme();
  const invalid = range ? !isRangeValid(range) : false;
  return (
    <View testID={testID} style={{ gap: space.md }}>
      <ListRow
        variant="toggle"
        title={t('range.none')}
        checked={range === null}
        onCheckedChange={(none) =>
          onChange(
            none
              ? { range: null, defaultMin: range?.defaultMin ?? defaultMin }
              : {
                  range: { minMin: defaultMin, defaultMin, maxMin: defaultMin },
                  defaultMin,
                },
          )
        }
      />
      {range === null ? (
        <DurationField
          label={`${label}: ${t('range.default')}`}
          valueMin={defaultMin}
          onChange={(minutes) => onChange({ range: null, defaultMin: minutes })}
        />
      ) : (
        <>
          <DurationField
            label={`${label}: ${t('range.min')}`}
            valueMin={range.minMin}
            onChange={(minutes) => onChange({ range: { ...range, minMin: minutes }, defaultMin })}
          />
          <DurationField
            label={`${label}: ${t('range.default')}`}
            valueMin={range.defaultMin}
            onChange={(minutes) =>
              onChange({ range: { ...range, defaultMin: minutes }, defaultMin: minutes })
            }
          />
          <DurationField
            label={`${label}: ${t('range.max')}`}
            valueMin={range.maxMin}
            onChange={(minutes) => onChange({ range: { ...range, maxMin: minutes }, defaultMin })}
          />
          {invalid ? (
            <Text variant="footnote" color="danger" accessibilityRole="alert">
              {t('range.invalid')}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
