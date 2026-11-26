import { useCallback, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/** Keyboard / switch-access focus ring (components.md 1.3 rule 4). Spread `handlers` on a Pressable. */
export function useFocusRing() {
  const { color, size } = useTheme();
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  const style: ViewStyle | undefined = focused
    ? { outlineColor: color.focusRing, outlineWidth: size.focusRingWidth, outlineOffset: 2 }
    : undefined;
  return { focused, style, handlers: { onFocus, onBlur } };
}
