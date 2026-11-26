import { Platform, Pressable, View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const { space, layout, size } = useTheme();
  const ios = Platform.OS === 'ios';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: layout.screenMargin,
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
