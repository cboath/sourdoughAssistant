import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { useDelayedFlag } from '../hooks/useDelayedFlag';
import { useFocusRing } from '../hooks/useFocusRing';
import { useTheme } from '../theme';
import { withAlpha } from '../theme/color';
import type { ColorTokens } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'tonal' | 'outline' | 'text' | 'destructive';
export type ButtonSize = 'md' | 'lg' | 'hero';

export interface ButtonProps {
  /** Visible label (sentence case). It is also the accessibility label unless overridden. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  leadingIcon?: IconName;
  /** Explain why a button is disabled when that is not visible. */
  accessibilityHint?: string;
  accessibilityLabel?: string;
  /** `destructive` renders as text-only (editor footer) instead of a filled danger button. */
  destructiveStyle?: 'filled' | 'text';
  testID?: string;
}

const SPINNER_DELAY_MS = 300;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  leadingIcon,
  accessibilityHint,
  accessibilityLabel,
  destructiveStyle = 'filled',
  testID,
}: ButtonProps) {
  const { color, size: sizes, radius, space, opacity } = useTheme();
  const focus = useFocusRing();
  const showSpinner = useDelayedFlag(loading, SPINNER_DELAY_MS);
  const inactive = disabled || loading;
  const android = Platform.OS === 'android';

  const minHeight =
    size === 'hero' ? sizes.touchHero : size === 'lg' ? sizes.touchKitchen : sizes.touchMin;

  let background: string = 'transparent';
  let labelColor: keyof ColorTokens = 'accent';
  let borderColor: string | undefined;
  let pressedBackground = withAlpha(color.accent, opacity.pressedOverlay);

  switch (variant) {
    case 'primary':
      background = color.accent;
      labelColor = 'textOnAccent';
      pressedBackground = color.accentPressed;
      break;
    case 'tonal':
      background = color.accentContainer;
      labelColor = 'textOnAccentContainer';
      pressedBackground = withAlpha(color.textOnAccentContainer, opacity.pressedOverlay * 2);
      break;
    case 'outline':
      borderColor = color.borderStrong;
      break;
    case 'text':
      break;
    case 'destructive':
      if (destructiveStyle === 'filled') {
        background = color.danger;
        labelColor = 'textOnDanger';
        pressedBackground = withAlpha(color.textOnDanger, 0.2);
      } else {
        labelColor = 'danger';
        pressedBackground = withAlpha(color.danger, opacity.pressedOverlay);
      }
      break;
  }

  // Disabled: iOS dims the whole button, Android uses the M3 container + disabled label.
  if (disabled) {
    if (android) {
      background = withAlpha(color.textPrimary, opacity.disabledContainer);
      labelColor = 'textDisabled';
      borderColor = undefined;
    }
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={
        android && !inactive ? { color: withAlpha(color.textPrimary, 0.12) } : undefined
      }
      {...focus.handlers}
      style={({ pressed }) => [
        {
          minHeight,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          paddingHorizontal: space.xl,
          paddingVertical: space.sm,
          borderRadius: radius.button,
          backgroundColor: pressed && !inactive ? pressedBackground : background,
          borderWidth: borderColor ? sizes.borderWidth : 0,
          borderColor,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          overflow: 'hidden',
          opacity: disabled && !android ? 0.4 : 1,
        },
        focus.style,
      ]}
    >
      {showSpinner ? (
        <ActivityIndicator accessible={false} color={color[labelColor]} />
      ) : leadingIcon ? (
        <Icon name={leadingIcon} color={labelColor} />
      ) : null}
      <View style={{ flexShrink: 1 }}>
        <Text
          variant="headline"
          color={labelColor}
          style={{ textAlign: 'center' }}
          numberOfLines={size === 'hero' ? 2 : undefined}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
