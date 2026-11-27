import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import {
  localToUtc,
  type EpochMs,
  type IanaZone,
  type LocalAdjustment,
  type LocalDateTime,
} from '@sourdough/core';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { t } from '../../../lib/i18n';
import { Button, Icon, Sheet, Text } from '../../../ui/components';
import { useFocusRing } from '../../../ui/hooks/useFocusRing';
import { useTheme } from '../../../ui/theme';
import { MAX_READY_DAYS_AHEAD, addDays } from '../defaults';
import {
  formatClock,
  formatMinuteOfDay,
  formatMonthDay,
  formatReadyValue,
  formatRelativeIn,
  spokenReadyValue,
} from '../time';

export interface ReadyFieldProps {
  value: LocalDateTime;
  zone: IanaZone;
  locale: string;
  now: EpochMs;
  onChange: (value: LocalDateTime) => void;
  /** The too-soon state: danger border and label. */
  error?: boolean;
  adjustment: LocalAdjustment;
  testID?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A JS Date whose local fields are the picked wall-clock time (the pickers speak local fields). */
function toDate({ date, time }: LocalDateTime): Date {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, min = 0] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

/** Back to a wall-clock value, snapped to 5 minutes (Android dialogs have no interval). */
function fromDate(d: Date): LocalDateTime {
  const total = Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5;
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (total >= 24 * 60) return { date: addDays(base, 1), time: '00:00' };
  return { date: base, time: `${pad(Math.floor(total / 60))}:${pad(total % 60)}` };
}

/**
 * Ready time field (screens-bake.md 3.2, 3.4). iOS: a sheet with an inline calendar and a time
 * wheel. Android: the date dialog, then the time dialog. DST gap and repeat are explained under
 * the field, never as errors.
 */
export function ReadyField({
  value,
  zone,
  locale,
  now,
  onChange,
  error,
  adjustment,
  testID,
}: ReadyFieldProps) {
  const { color, space, radius, size } = useTheme();
  const focus = useFocusRing();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => toDate(value));
  const resolved = localToUtc(value, zone);
  const shown = formatReadyValue(resolved.at, zone, locale);
  const relative = formatRelativeIn(resolved.at, now, locale);
  const label = error
    ? t('plan.ready.labelError')
    : t('plan.ready.label', { when: spokenReadyValue(resolved.at, zone, locale), relative });

  const today = new Date(now);
  const minimumDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const maximumDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + MAX_READY_DAYS_AHEAD,
  );

  const begin = () => {
    const start = toDate(value);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_e: DateTimePickerChangeEvent, date: Date) => {
          const picked = new Date(date);
          picked.setHours(start.getHours(), start.getMinutes());
          DateTimePickerAndroid.open({
            value: picked,
            mode: 'time',
            onValueChange: (_e2: DateTimePickerChangeEvent, time: Date) => onChange(fromDate(time)),
          });
        },
      });
      return;
    }
    setDraft(start);
    setOpen(true);
  };

  const helper =
    adjustment === 'none'
      ? null
      : t(adjustment === 'shiftedForward' ? 'plan.ready.gap' : 'plan.ready.repeat', {
          time: formatMinuteOfDay(
            toDate(value).getHours() * 60 + toDate(value).getMinutes(),
            locale,
          ),
          date: formatMonthDay(resolved.at, zone, locale),
          adjustedTime: formatClock(resolved.at, zone, locale),
        });

  return (
    <View testID={testID} style={{ gap: space.xs }}>
      <Text variant="subhead">{t('plan.ready')}</Text>
      <Pressable
        testID={testID ? `${testID}-button` : undefined}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('plan.ready.opens')}
        onPress={begin}
        {...focus.handlers}
        style={[
          {
            minHeight: size.touchMin,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.md,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            borderRadius: radius.sm,
            backgroundColor: color.surfaceSunken,
            borderWidth: error ? 2 : size.borderWidth,
            borderColor: error ? color.danger : color.borderStrong,
          },
          focus.style,
        ]}
      >
        <View style={{ flexShrink: 1 }}>
          <Text variant="title3" numeric color={error ? 'danger' : 'textPrimary'}>
            {shown}
          </Text>
          <Text variant="footnote" color={error ? 'danger' : 'textSecondary'}>
            {relative}
          </Text>
        </View>
        <Icon name={error ? 'error' : 'calendar'} color={error ? 'danger' : 'textSecondary'} />
      </Pressable>
      {helper ? (
        <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' }}>
          <Icon name="info" size={size.iconSm} color="textSecondary" />
          <Text variant="footnote" color="textSecondary" style={{ flexShrink: 1 }}>
            {helper}
          </Text>
        </View>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={t('plan.ready')}>
          <View style={{ padding: space.lg, gap: space.lg }}>
            <DateTimePicker
              testID="ready-date-picker"
              value={draft}
              mode="date"
              display="inline"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              accentColor={color.accent}
              accessibilityLabel={t('plan.ready.pickDate')}
              onValueChange={(_e: DateTimePickerChangeEvent, date: Date) => setDraft(date)}
            />
            <DateTimePicker
              testID="ready-time-picker"
              value={draft}
              mode="time"
              display="spinner"
              minuteInterval={5}
              accessibilityLabel={t('plan.ready.pickTime')}
              onValueChange={(_e: DateTimePickerChangeEvent, date: Date) => setDraft(date)}
            />
            <Button
              size="lg"
              fullWidth
              label={t('common.done')}
              onPress={() => {
                onChange(fromDate(draft));
                setOpen(false);
              }}
            />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
