import type { ReactNode } from 'react';
import { Platform, Pressable, Switch as RNSwitch, View } from 'react-native';
import { useFocusRing } from '../hooks/useFocusRing';
import { useFontScale } from '../hooks/useFontScale';
import { useTheme } from '../theme';
import { withAlpha } from '../theme/color';
import { Icon } from './Icon';
import { Text } from './Text';

export type ListRowVariant = 'navigation' | 'value' | 'toggle' | 'destructive' | 'selectable';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Trailing value text (variant `value`, or any row with a value). */
  value?: string;
  variant?: ListRowVariant;
  leading?: ReactNode;
  /** Trailing element such as a StatusTag. Separate controls (overflow) belong outside the row. */
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** `toggle`: whether the switch is on. `selectable`: whether the row is checked. */
  checked?: boolean;
  /** `toggle`: called with the new value. */
  onCheckedChange?: (next: boolean) => void;
  /** Overrides the combined label (title, subtitle, value). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/** One focus stop with a combined label. At fontScale >= 1.5 the trailing value moves under the title. */
export function ListRow({
  title,
  subtitle,
  value,
  variant = 'navigation',
  leading,
  trailing,
  onPress,
  disabled = false,
  checked = false,
  onCheckedChange,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const { color, space, layout, size } = useTheme();
  const { stacked } = useFontScale();
  const focus = useFocusRing();
  const ios = Platform.OS === 'ios';
  const isToggle = variant === 'toggle';
  const isSelectable = variant === 'selectable';

  const label = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');
  const role = isToggle ? 'switch' : isSelectable ? 'checkbox' : 'button';
  const pressable = !disabled && (isToggle || onPress !== undefined || isSelectable);
  const handlePress = () => {
    if (isToggle) onCheckedChange?.(!checked);
    else onPress?.();
  };
  const titleColor = disabled
    ? 'textDisabled'
    : variant === 'destructive'
      ? 'danger'
      : 'textPrimary';
  const minHeight = subtitle ? layout.listRowTwoLineMinHeight : layout.listRowMinHeight;

  const valueNode = value ? (
    <Text variant="body" color="textSecondary" numberOfLines={stacked ? undefined : 1}>
      {value}
    </Text>
  ) : null;

  return (
    <Pressable
      testID={testID}
      accessibilityRole={pressable || isToggle ? role : undefined}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={isToggle || isSelectable ? { checked, disabled } : { disabled }}
      disabled={!pressable}
      onPress={handlePress}
      android_ripple={
        Platform.OS === 'android' ? { color: withAlpha(color.textPrimary, 0.12) } : undefined
      }
      {...focus.handlers}
      style={({ pressed }) => [
        {
          minHeight: Math.max(minHeight, size.touchMin),
          paddingVertical: space.md,
          paddingHorizontal: layout.screenMargin,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          backgroundColor: pressed && ios && pressable ? color.surfaceSunken : color.surface,
        },
        focus.style,
      ]}
    >
      {isSelectable ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{
            width: size.iconMd,
            height: size.iconMd,
            borderRadius: size.iconMd / 2,
            borderWidth: 2,
            borderColor: checked ? color.accent : color.borderStrong,
            backgroundColor: checked ? color.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked ? <Icon name="check" size={size.iconSm - 4} color="textOnAccent" /> : null}
        </View>
      ) : null}
      {leading ? <View accessible={false}>{leading}</View> : null}
      <View style={{ flex: 1, flexShrink: 1 }}>
        <View
          style={{
            flexDirection: stacked ? 'column' : 'row',
            alignItems: stacked ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: space.xs,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text
              variant={subtitle ? 'headline' : 'body'}
              color={titleColor}
              numberOfLines={2}
              style={variant === 'destructive' && ios ? { textAlign: 'center' } : undefined}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text variant="subhead" color={disabled ? 'textDisabled' : 'textSecondary'}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {valueNode}
        </View>
      </View>
      {trailing ? <View accessible={false}>{trailing}</View> : null}
      {isToggle ? (
        <RNSwitch
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          value={checked}
          disabled={disabled}
          onValueChange={onCheckedChange}
          trackColor={{ true: color.accent, false: color.borderStrong }}
          thumbColor={color.surface}
        />
      ) : null}
      {variant === 'navigation' && ios ? <Icon name="chevronRight" color="textSecondary" /> : null}
    </Pressable>
  );
}
