import { Pressable, View, type AccessibilityActionEvent } from 'react-native';
import { useFocusRing } from '../hooks/useFocusRing';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';
import { Icon } from './Icon';
import { Text } from './Text';

export interface StepperProps {
  /** Spoken name ("Loaves"). */
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Visible and spoken value ("2 loaves"). Defaults to the number. */
  formatValue?: (value: number) => string;
  /** Short visible unit next to the number ("loaves"). */
  unitLabel?: string;
  testID?: string;
}

function StepButton({
  icon,
  disabled,
  onPress,
}: {
  icon: 'minus' | 'plus';
  disabled: boolean;
  onPress: () => void;
}) {
  const { size, color, radius } = useTheme();
  const focus = useFocusRing();
  return (
    <Pressable
      // Hidden from screen readers: the adjustable parent exposes increment/decrement actions.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      disabled={disabled}
      onPress={onPress}
      {...focus.handlers}
      style={[
        {
          width: size.touchKitchen,
          height: size.touchKitchen,
          borderRadius: radius.full,
          borderWidth: size.borderWidth,
          borderColor: color.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        },
        focus.style,
      ]}
    >
      <Icon name={icon} color="accent" />
    </Pressable>
  );
}

/** Small integers (loaves, folds, oven capacity). One adjustable element for screen readers. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue,
  unitLabel,
  testID,
}: StepperProps) {
  const { space } = useTheme();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const text = formatValue ? formatValue(value) : String(value);
  const dec = () => onChange(clamp(value - step));
  const inc = () => onChange(clamp(value + step));

  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') inc();
    else if (event.nativeEvent.actionName === 'decrement') dec();
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text }}
      accessibilityActions={[
        { name: 'increment', label: t('common.increase') },
        { name: 'decrement', label: t('common.decrease') },
      ]}
      onAccessibilityAction={onAction}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}
    >
      <StepButton icon="minus" disabled={value <= min} onPress={dec} />
      <View style={{ minWidth: 56, alignItems: 'center' }}>
        <Text variant="title3" numeric>
          {formatValue ? text : String(value)}
        </Text>
        {unitLabel ? (
          <Text variant="footnote" color="textSecondary">
            {unitLabel}
          </Text>
        ) : null}
      </View>
      <StepButton icon="plus" disabled={value >= max} onPress={inc} />
    </View>
  );
}
