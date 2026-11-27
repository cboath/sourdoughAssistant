import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { fromIso } from '@sourdough/core';
import type { BakeAggregate } from '../../../db/types';
import { t } from '../../../lib/i18n';
import { Button, Icon, Sheet, Text } from '../../../ui/components';
import { useFocusRing } from '../../../ui/hooks/useFocusRing';
import { useTheme } from '../../../ui/theme';
import { formatClock } from '../../schedule/time';
import type { ItemLive } from '../derive';
import {
  clockTimeOf,
  finishLowerBound,
  previewReadyAt,
  resolveFinishedAt,
  type ClockTime,
} from '../finishedAt';
import { labelFor } from '../panel';
import type { TimeCtx } from '../ready';

export interface FinishedAtSheetProps {
  visible: boolean;
  onClose: () => void;
  item: ItemLive | null;
  aggregate: BakeAggregate;
  ctx: TimeCtx;
  /** Resolves true when the step was marked done (the sheet then closes). */
  onConfirm: (item: ItemLive, at: number) => Promise<boolean>;
}

const toDate = ({ hour, minute }: ClockTime): Date => {
  const d = new Date(2000, 0, 1, hour, minute);
  return d;
};

/** STEP-ACTIONS, the part B9 needs: set when the current step actually finished, with a preview. */
export function FinishedAtSheet({
  visible,
  onClose,
  item,
  aggregate,
  ctx,
  onConfirm,
}: FinishedAtSheetProps) {
  const { color, space, radius, size } = useTheme();
  const focus = useFocusRing();
  const row = item?.current ?? null;
  const [time, setTime] = useState<ClockTime>({ hour: 0, minute: 0 });

  // Start from the planned end (what the baker most likely means), or now if that is still ahead.
  useEffect(() => {
    if (!visible || !row) return;
    const planned = fromIso(row.plannedEndAt);
    setTime(clockTimeOf(Math.min(planned, ctx.now), ctx.zone));
    // Only when the sheet opens: ticking `now` must not reset the baker's pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, row?.id]);

  if (!item || !row) return null;
  const at = resolveFinishedAt(time, ctx.now, ctx.zone);
  const lower = finishLowerBound(row, ctx.now);
  const error =
    lower !== null && at < lower
      ? t('val.time.beforeStart', { time: formatClock(lower, ctx.zone, ctx.locale) })
      : null;
  const preview = error ? null : previewReadyAt(aggregate, row, at, ctx.now);
  const previewText = preview
    ? t(preview.next === preview.current ? 'steps.previewSame' : 'steps.preview', {
        time: formatClock(preview.next, ctx.zone, ctx.locale),
      })
    : null;
  const shown = formatClock(at, ctx.zone, ctx.locale);

  const pick = () => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: toDate(time),
      mode: 'time',
      onValueChange: (_e: DateTimePickerChangeEvent, date: Date) =>
        setTime({ hour: date.getHours(), minute: date.getMinutes() }),
    });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('steps.finishedAt.title')}
      testID="finished-at-sheet"
    >
      <View style={{ padding: space.lg, gap: space.lg }}>
        <Text variant="headline">{labelFor(aggregate, row)}</Text>
        <View style={{ gap: space.xs }}>
          <Text variant="subhead">{t('steps.finishedAt')}</Text>
          <Pressable
            testID="finished-at-field"
            accessibilityRole="button"
            accessibilityLabel={`${t('steps.finishedAt')}, ${shown}`}
            accessibilityHint={t('steps.pickTime')}
            onPress={pick}
            {...focus.handlers}
            style={[
              {
                minHeight: size.touchKitchen,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: space.md,
                borderRadius: radius.sm,
                backgroundColor: color.surfaceSunken,
                borderWidth: error ? size.focusRingWidth : size.borderWidth,
                borderColor: error ? color.danger : color.borderStrong,
              },
              focus.style,
            ]}
          >
            <Text variant="title3" numeric color={error ? 'danger' : 'textPrimary'}>
              {shown}
            </Text>
            <Icon name={error ? 'error' : 'clock'} color={error ? 'danger' : 'textSecondary'} />
          </Pressable>
          {error ? (
            <Text variant="footnote" color="danger" testID="finished-at-error">
              {error}
            </Text>
          ) : null}
        </View>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            testID="finished-time-picker"
            value={toDate(time)}
            mode="time"
            display="spinner"
            accentColor={color.accent}
            accessibilityLabel={t('steps.pickTime')}
            onValueChange={(_e: DateTimePickerChangeEvent, date: Date) =>
              setTime({ hour: date.getHours(), minute: date.getMinutes() })
            }
          />
        ) : null}
        {previewText ? (
          <Text variant="footnote" color="textSecondary" testID="finished-at-preview">
            {previewText}
          </Text>
        ) : null}
        <Button
          size="lg"
          fullWidth
          label={t('steps.markDone')}
          disabled={error !== null}
          accessibilityHint={previewText ?? undefined}
          onPress={() => {
            void onConfirm(item, at).then((done) => {
              if (done) onClose();
            });
          }}
          testID="finished-at-confirm"
        />
      </View>
    </Sheet>
  );
}
