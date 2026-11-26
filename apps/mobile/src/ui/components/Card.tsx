import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusRing } from '../hooks/useFocusRing';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../theme';

export interface CardProps {
  children: ReactNode;
  /** Makes the whole card one pressable focus stop. Then `accessibilityLabel` is required. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardProps) {
  const { color, radius, space, elevation, isDark, size } = useTheme();
  const reduceMotion = useReducedMotion();
  const focus = useFocusRing();
  const base: ViewStyle = {
    backgroundColor: isDark ? color.surfaceRaised : color.surface,
    borderRadius: radius.md,
    padding: space.lg,
    ...(isDark ? { borderWidth: size.borderWidth, borderColor: color.border } : elevation.level1),
  };
  if (!onPress) {
    return (
      <View testID={testID} style={[base, style]}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      {...focus.handlers}
      style={({ pressed }) => [
        base,
        style,
        pressed && !reduceMotion ? { transform: [{ scale: 0.98 }] } : null,
        focus.style,
      ]}
    >
      {children}
    </Pressable>
  );
}
