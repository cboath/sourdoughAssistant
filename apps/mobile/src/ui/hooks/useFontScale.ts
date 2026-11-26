import { useWindowDimensions } from 'react-native';
import { useTheme } from '../theme';

/** Current font scale, and whether rows should stack (components.md 1.2: scale >= 1.5). */
export function useFontScale() {
  const { fontScale } = useWindowDimensions();
  const { layout } = useTheme();
  return { fontScale, stacked: fontScale >= layout.timelineStackFontScale };
}
