import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import {
  displayLocalDate,
  formatLocalDate,
  parseLocalDate,
  type DateParts,
} from '../../lib/localDate';
import { t } from '../../lib/i18n';
import { useFocusRing } from '../hooks/useFocusRing';
import { useLocale } from '../hooks/useLocale';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Text } from './Text';

export interface DateTimeFieldProps {
  label: string;
  /** `LocalDate` ("YYYY-MM-DD"). */
  value: string;
  onChange: (value: string) => void;
  /** Only the date-only mode exists so far (screens-recipes.md section 12.1 item 13). */
  mode?: 'date';
  /** Inclusive upper bound, e.g. today for "Date priced". */
  maxDate?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

const toDate = (parts: DateParts): Date => new Date(parts.year, parts.month - 1, parts.day);
const fromDate = (d: Date): DateParts => ({
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

/**
 * Date-only field backed by the native picker: the Android dialog opens directly, iOS shows an
 * inline calendar in a sheet with a Done button. The value is a plain `LocalDate` string.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  maxDate,
  error,
  disabled,
  testID,
}: DateTimeFieldProps) {
  const { color, space, radius, size } = useTheme();
  const { locale } = useLocale();
  const focus = useFocusRing();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);
  const max = maxDate ? parseLocalDate(maxDate) : null;
  const current = parseLocalDate(value);
  const shown = current ? displayLocalDate(value, locale) : value;

  const clampToMax = (date: Date): Date => {
    if (!max) return date;
    const cap = toDate(max);
    return date.getTime() > cap.getTime() ? cap : date;
  };

  const begin = () => {
    const start = clampToMax(toDate(current ?? max ?? fromDate(new Date())));
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        maximumDate: max ? toDate(max) : undefined,
        onValueChange: (_event: DateTimePickerChangeEvent, date: Date) =>
          onChange(formatLocalDate(fromDate(clampToMax(date)))),
      });
      return;
    }
    setDraft(start);
    setOpen(true);
  };

  return (
    <View testID={testID} style={{ gap: space.xs }}>
      <Text variant="subhead">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown}`}
        accessibilityHint={t('date.opens')}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={begin}
        {...focus.handlers}
        style={[
          {
            minHeight: size.touchMin,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: space.md,
            borderRadius: radius.sm,
            backgroundColor: color.surfaceSunken,
            borderWidth: error ? 2 : size.borderWidth,
            borderColor: error ? color.danger : color.borderStrong,
          },
          focus.style,
        ]}
      >
        <Text variant="body" numeric>
          {shown}
        </Text>
        <Icon name="calendar" color="textSecondary" />
      </Pressable>
      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
          {draft ? (
            <View style={{ padding: space.lg, gap: space.lg }}>
              <DateTimePicker
                testID="date-picker"
                value={draft}
                mode="date"
                display="inline"
                maximumDate={max ? toDate(max) : undefined}
                accentColor={color.accent}
                onValueChange={(_event: DateTimePickerChangeEvent, date: Date) =>
                  setDraft(clampToMax(date))
                }
              />
              <Button
                size="lg"
                fullWidth
                label={t('common.done')}
                onPress={() => {
                  onChange(formatLocalDate(fromDate(draft)));
                  setOpen(false);
                }}
              />
            </View>
          ) : null}
        </Sheet>
      ) : null}
    </View>
  );
}
