import { Platform, Pressable, View } from 'react-native';
import { useScreenMargin } from '../hooks/useScreenMargin';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** Plain trailing text ( "3 prices", "×2.03" ). */
  trailingText?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, trailingText, actionLabel, onAction }: SectionHeaderProps) {
  const { space, size } = useTheme();
  const margin = useScreenMargin();
  const ios = Platform.OS === 'ios';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: margin.left,
        paddingRight: margin.right,
        paddingTop: space.lg,
        paddingBottom: space.xs,
      }}
    >
      <Text
        accessibilityRole="header"
        variant={ios ? 'footnote' : 'subhead'}
        color={ios ? 'textSecondary' : 'accent'}
        style={ios ? undefined : { fontWeight: '500' }}
      >
        {title}
      </Text>
      {trailingText && !actionLabel ? (
        <Text variant="footnote" color="textSecondary">
          {trailingText}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={{ top: space.md, bottom: space.md, left: space.md, right: space.md }}
          style={{ minHeight: size.touchMin, justifyContent: 'center' }}
        >
          <Text variant="subhead" color="accent">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
