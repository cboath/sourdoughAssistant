import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSnackbarClearance } from '../hooks/useSnackbarClearance';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface BottomActionBarProps {
  /** Usually one `<Button size="lg" fullWidth />`. */
  children: ReactNode;
  /** Optional line above the button ("3 loaves, 2 recipes"). */
  footnote?: string;
  /** Height callback so scroll content can reserve bottom padding (components.md 1.2 rule 4). */
  onHeightChange?: (height: number) => void;
  /** The bar sits above a tab bar, which already covers the bottom safe area. */
  insideTabs?: boolean;
}

/** Pins the screen's one primary action. Hidden while the iOS keyboard is up (it has its own Done). */
export function BottomActionBar({
  children,
  footnote,
  onHeightChange,
  insideTabs = false,
}: BottomActionBarProps) {
  const { color, space, elevation, isDark, size } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [height, setHeight] = useState(0);
  useSnackbarClearance(keyboardUp ? 0 : height);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardUp) return null;
  return (
    <View
      onLayout={(e) => {
        setHeight(e.nativeEvent.layout.height);
        onHeightChange?.(e.nativeEvent.layout.height);
      }}
      style={[
        {
          backgroundColor: isDark ? color.surfaceRaised : color.surface,
          padding: space.lg,
          paddingLeft: space.lg + insets.left,
          paddingRight: space.lg + insets.right,
          paddingBottom: space.lg + (insideTabs ? 0 : insets.bottom),
          gap: space.sm,
        },
        isDark
          ? { borderTopWidth: size.borderWidth, borderTopColor: color.border }
          : { ...elevation.level2, shadowOffset: { width: 0, height: -3 } },
      ]}
    >
      {footnote ? (
        <Text variant="footnote" color="textSecondary" style={{ textAlign: 'center' }}>
          {footnote}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
