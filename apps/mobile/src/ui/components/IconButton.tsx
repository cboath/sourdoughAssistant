import { Platform, Pressable, View } from 'react-native';
import { useFocusRing } from '../hooks/useFocusRing';
import { useTheme } from '../theme';
import { withAlpha } from '../theme/color';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only controls have no other name ("Keep screen on", "More options"). */
  accessibilityLabel: string;
  onPress: () => void;
  variant?: 'plain' | 'toggle' | 'filled';
  /** For `toggle`: whether it is on. Exposed as a switch with `checked`. */
  selected?: boolean;
  disabled?: boolean;
  /** `kitchen` is the 56 pt tier used on the live view. */
  tier?: 'standard' | 'kitchen';
  accessibilityHint?: string;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'plain',
  selected = false,
  disabled = false,
  tier = 'standard',
  accessibilityHint,
  testID,
}: IconButtonProps) {
  const { color, size, radius, opacity } = useTheme();
  const focus = useFocusRing();
  const hit = tier === 'kitchen' ? size.touchKitchen : size.touchMin;
  const isToggle = variant === 'toggle';
  const filled = variant === 'filled';
  const circle =
    isToggle && selected ? color.accentContainer : filled ? color.accent : 'transparent';
  const iconColor = filled
    ? 'textOnAccent'
    : isToggle && selected
      ? 'textOnAccentContainer'
      : 'textPrimary';

  return (
    <Pressable
      testID={testID}
      accessibilityRole={isToggle ? 'switch' : 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={isToggle ? { checked: selected, disabled } : { disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={
        Platform.OS === 'android'
          ? { color: withAlpha(color.textPrimary, 0.12), radius: hit / 2 }
          : undefined
      }
      {...focus.handlers}
      style={({ pressed }) => [
        {
          width: hit,
          height: hit,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? withAlpha(color.textPrimary, opacity.pressedOverlay) : circle,
          opacity: disabled ? 0.4 : 1,
        },
        focus.style,
      ]}
    >
      <View>
        <Icon name={icon} size={tier === 'kitchen' ? size.iconLg : size.iconMd} color={iconColor} />
      </View>
    </Pressable>
  );
}
