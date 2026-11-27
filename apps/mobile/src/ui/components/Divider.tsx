import { View } from 'react-native';
import { useTheme } from '../theme';

/** A hairline in the `border` color. Decorative, so hidden from screen readers. */
export function Divider() {
  const { color, size } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={{ height: size.borderWidth, backgroundColor: color.border }}
    />
  );
}
