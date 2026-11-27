import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useScreenMargin } from '../hooks/useScreenMargin';
import { useTheme } from '../theme';

/** Centers content at `layout.maxContentWidth` with the screen margin and safe-area insets. */
export function ContentColumn({
  children,
  padded = true,
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { layout } = useTheme();
  const margin = useScreenMargin();
  return (
    <View
      style={[
        {
          width: '100%',
          maxWidth: layout.maxContentWidth,
          alignSelf: 'center',
          paddingLeft: padded ? margin.left : 0,
          paddingRight: padded ? margin.right : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
