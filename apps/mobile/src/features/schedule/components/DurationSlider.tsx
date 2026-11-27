import { useRef, useState } from 'react';
import { PanResponder, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { t } from '../../../lib/i18n';
import { Button, Text } from '../../../ui/components';
import { haptic } from '../../../ui/haptics';
import { useTheme } from '../../../ui/theme';
import { formatDuration, spokenDuration } from '../../recipes/format';
import { SLIDER_NUDGE_MIN, clampMinutes, fractionOf, snapMinutes, valueAt } from '../sliderMath';
import { formatPlanRange } from '../time';
import type { SliderModel } from '../timeline';

export interface DurationSliderProps {
  model: SliderModel;
  stepName: string;
  locale: string;
  onChange: (minutes: number) => void;
  onReset: () => void;
}

/**
 * Min-to-max slider with 5-minute snaps, 15-minute buttons and a default tick (screens-bake.md
 * 3.3). Built on `PanResponder` (no gesture library is installed), exposed to screen readers as
 * one adjustable element. The value changes only when it crosses a snap, so the plan recomputes
 * at most once per step of movement.
 */
export function DurationSlider({
  model,
  stepName,
  locale,
  onChange,
  onReset,
}: DurationSliderProps) {
  const { color, space, radius, size } = useTheme();
  const { min, max, value, recipeDefault } = model;
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const last = useRef(value);
  last.current = value;
  const latest = useRef({ min, max, onChange });
  latest.current = { min, max, onChange };

  const move = (x: number) => {
    const next = valueAt(x, widthRef.current, latest.current.min, latest.current.max);
    if (next !== last.current) {
      last.current = next;
      haptic('selection');
      latest.current.onChange(next);
    }
  };
  const pan = useRef(
    PanResponder.create({
      // A vertical drag that starts on the slider scrolls the list; only a mostly horizontal move
      // takes the gesture (DR2-17).
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: (e) => move(e.nativeEvent.locationX),
      onPanResponderMove: (e) => move(e.nativeEvent.locationX),
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  const nudge = (delta: number) => {
    const next = snapMinutes(clampMinutes(value + delta, min, max), min, max);
    if (next !== value) {
      haptic('selection');
      onChange(next);
    }
  };

  const valueText = t('plan.slider.value', {
    duration: spokenDuration(value, locale),
    min: spokenDuration(min, locale),
    max: spokenDuration(max, locale),
    default: spokenDuration(recipeDefault, locale),
  });
  const thumb = size.touchMin / 2;
  const track = size.progressStroke;

  return (
    <View style={{ gap: space.md, paddingVertical: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Button
          variant="outline"
          size="lg"
          label="−15"
          accessibilityLabel={t('plan.slider.minus')}
          onPress={() => nudge(-SLIDER_NUDGE_MIN)}
          disabled={value <= min}
          testID={`slider-minus-${model.stepId}`}
        />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="title3" numeric>
            {formatDuration(value, locale)}
          </Text>
        </View>
        <Button
          variant="outline"
          size="lg"
          label="+15"
          accessibilityLabel={t('plan.slider.plus')}
          onPress={() => nudge(SLIDER_NUDGE_MIN)}
          disabled={value >= max}
          testID={`slider-plus-${model.stepId}`}
        />
      </View>
      <View
        testID={`slider-${model.stepId}`}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('plan.slider.label', { step: stepName })}
        accessibilityValue={{ min, max, now: value, text: valueText }}
        accessibilityActions={[
          { name: 'increment', label: t('common.increase') },
          { name: 'decrement', label: t('common.decrease') },
        ]}
        onAccessibilityAction={(e) =>
          nudge(e.nativeEvent.actionName === 'increment' ? SLIDER_NUDGE_MIN : -SLIDER_NUDGE_MIN)
        }
        onLayout={(e: LayoutChangeEvent) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        {...pan.panHandlers}
        style={{ height: size.touchKitchen, justifyContent: 'center' }}
      >
        <View
          pointerEvents="none"
          style={{ height: track, borderRadius: radius.full, backgroundColor: color.borderStrong }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            height: track,
            borderRadius: radius.full,
            backgroundColor: color.accent,
            width: width * fractionOf(value, min, max),
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: width * fractionOf(recipeDefault, min, max) - 1,
            height: track * 3,
            width: 2,
            backgroundColor: color.textSecondary,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: width * fractionOf(value, min, max) - thumb / 2,
            width: thumb,
            height: thumb,
            borderRadius: radius.full,
            backgroundColor: color.accent,
            borderWidth: 2,
            borderColor: color.surface,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="textSecondary">
          {formatPlanRange(min, max, locale)}
        </Text>
        <Text variant="caption" color="textSecondary">
          {t('plan.slider.default', { duration: formatDuration(recipeDefault, locale) })}
        </Text>
      </View>
      {model.isUser ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('plan.slider.reset', {
            duration: formatDuration(model.baseValue, locale),
          })}
          onPress={onReset}
          style={{ minHeight: size.touchMin, justifyContent: 'center' }}
          testID={`slider-reset-${model.stepId}`}
        >
          <Text variant="callout" color="accent">
            {t('plan.slider.reset', { duration: formatDuration(model.baseValue, locale) })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
