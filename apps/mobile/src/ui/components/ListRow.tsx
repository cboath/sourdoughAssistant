import type { ComponentRef, ReactNode, Ref } from 'react';
import { Platform, Pressable, Switch as RNSwitch, View } from 'react-native';
import { useFocusRing } from '../hooks/useFocusRing';
import { useFontScale } from '../hooks/useFontScale';
import { useScreenMargin } from '../hooks/useScreenMargin';
import { useTheme } from '../theme';
import { withAlpha } from '../theme/color';
import { Icon } from './Icon';
import { Text } from './Text';

export type ListRowVariant =
  | 'navigation'
  | 'value'
  | 'toggle'
  | 'destructive'
  | 'selectable'
  /** A menu item or plain action: no chevron (a chevron means "opens a screen"). */
  | 'action';

export interface ListRowProps {
  /** React 19: `ref` is a regular prop (used to return screen-reader focus after a sheet). */
  ref?: Ref<ComponentRef<typeof View>>;
  title: string;
  subtitle?: string;
  /** Trailing value text (variant `value`, or any row with a value). */
  value?: string;
  variant?: ListRowVariant;
  leading?: ReactNode;
  /** Trailing element such as a StatusTag. Separate controls (overflow) belong outside the row. */
  trailing?: ReactNode;
  /** `below` always puts `trailing` under the subtitle (tags), not only at large text sizes. */
  trailingPlacement?: 'end' | 'below';
  /** Inline error under the subtitle (`footnote danger` with an icon). Include it in the label. */
  error?: string;
  onPress?: () => void;
  disabled?: boolean;
  /** `toggle`: whether the switch is on. `selectable`: whether the row is checked. */
  checked?: boolean;
  /** `selectable`: `single` makes the row a radio (one choice in a group), else a checkbox. */
  selectionMode?: 'single' | 'multiple';
  /** `toggle`: called with the new value. */
  onCheckedChange?: (next: boolean) => void;
  /** Overrides the combined label (title, subtitle, value). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Long press (context menu). Also offer the same actions through `accessibilityActions`. */
  onLongPress?: () => void;
  accessibilityActions?: ReadonlyArray<{ name: string; label: string }>;
  onAccessibilityAction?: (name: string) => void;
  /** Title in the accent color (for "Add ingredient" style rows). */
  accentTitle?: boolean;
  testID?: string;
}

/**
 * One focus stop with a combined label. At fontScale >= 1.5 the trailing value and element move
 * under the title.
 */
export function ListRow({
  ref,
  title,
  subtitle,
  value,
  variant = 'navigation',
  leading,
  trailing,
  trailingPlacement = 'end',
  error,
  onPress,
  disabled = false,
  checked = false,
  selectionMode = 'multiple',
  onCheckedChange,
  accessibilityLabel,
  accessibilityHint,
  onLongPress,
  accessibilityActions,
  onAccessibilityAction,
  accentTitle = false,
  testID,
}: ListRowProps) {
  const { color, space, layout, size } = useTheme();
  const { stacked } = useFontScale();
  const margin = useScreenMargin();
  const focus = useFocusRing();
  const ios = Platform.OS === 'ios';
  const isToggle = variant === 'toggle';
  const isSelectable = variant === 'selectable';

  const label = accessibilityLabel ?? [title, subtitle, value, error].filter(Boolean).join(', ');
  const role = isToggle
    ? 'switch'
    : isSelectable
      ? selectionMode === 'single'
        ? 'radio'
        : 'checkbox'
      : 'button';
  const pressable = !disabled && (isToggle || onPress !== undefined || isSelectable);
  const handlePress = () => {
    if (isToggle) onCheckedChange?.(!checked);
    else onPress?.();
  };
  const titleColor = disabled
    ? 'textDisabled'
    : variant === 'destructive'
      ? 'danger'
      : accentTitle
        ? 'accent'
        : 'textPrimary';
  const minHeight = subtitle ? layout.listRowTwoLineMinHeight : layout.listRowMinHeight;
  const centered = ios && (variant === 'destructive' || variant === 'action');

  const valueNode = value ? (
    <Text variant="body" color="textSecondary" numberOfLines={stacked ? undefined : 1}>
      {value}
    </Text>
  ) : null;
  const below = stacked || trailingPlacement === 'below';
  const trailingNode = trailing ? <View accessible={false}>{trailing}</View> : null;

  return (
    <Pressable
      ref={ref}
      testID={testID}
      accessibilityRole={pressable || isToggle ? role : undefined}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={isToggle || isSelectable ? { checked, disabled } : { disabled }}
      disabled={!pressable}
      onPress={handlePress}
      onLongPress={onLongPress}
      accessibilityActions={accessibilityActions ? [...accessibilityActions] : undefined}
      onAccessibilityAction={
        onAccessibilityAction
          ? (event) => onAccessibilityAction(event.nativeEvent.actionName)
          : undefined
      }
      android_ripple={
        Platform.OS === 'android' ? { color: withAlpha(color.textPrimary, 0.12) } : undefined
      }
      {...focus.handlers}
      style={({ pressed }) => [
        {
          minHeight: Math.max(minHeight, size.touchMin),
          paddingVertical: space.md,
          paddingLeft: margin.left,
          paddingRight: margin.right,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: centered ? 'center' : undefined,
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
          {checked ? <Icon name="check" size={size.iconSm} color="textOnAccent" /> : null}
        </View>
      ) : null}
      {leading ? <View accessible={false}>{leading}</View> : null}
      <View style={{ flex: centered ? undefined : 1, flexShrink: 1 }}>
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
              style={centered ? { textAlign: 'center' } : undefined}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text variant="subhead" color={disabled ? 'textDisabled' : 'textSecondary'}>
                {subtitle}
              </Text>
            ) : null}
            {error ? (
              <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
                <Icon name="error" size={size.iconSm} color="danger" />
                <Text variant="footnote" color="danger" style={{ flexShrink: 1 }}>
                  {error}
                </Text>
              </View>
            ) : null}
            {below ? trailingNode : null}
          </View>
          {valueNode}
        </View>
      </View>
      {below ? null : trailingNode}
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
