import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

/**
 * Horizontal content margins (tokens.md section 4): `screenMargin`, or `screenMarginWide` from 600
 * wide, plus the left and right safe-area insets so landscape content clears the notch.
 */
export function useScreenMargin() {
  const { layout } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const base = width >= layout.wideBreakpoint ? layout.screenMarginWide : layout.screenMargin;
  return { base, left: base + insets.left, right: base + insets.right };
}
