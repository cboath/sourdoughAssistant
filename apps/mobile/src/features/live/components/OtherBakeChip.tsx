import { Pressable } from 'react-native';
import { Icon, Text } from '../../../ui/components';
import { useFocusRing } from '../../../ui/hooks/useFocusRing';
import { useTheme } from '../../../ui/theme';

export interface OtherBakeChipProps {
  text: string;
  accessibilityLabel: string;
  onPress: () => void;
}

/** A tonal pill under the header when another bake needs attention soon (components.md 3.32). */
export function OtherBakeChip({ text, accessibilityLabel, onPress }: OtherBakeChipProps) {
  const { color, space, radius, size } = useTheme();
  const focus = useFocusRing();
  return (
    <Pressable
      testID="other-bake-chip"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...focus.handlers}
      style={[
        {
          minHeight: size.touchKitchen,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          borderRadius: radius.lg,
          backgroundColor: color.accentContainer,
          alignSelf: 'flex-start',
        },
        focus.style,
      ]}
    >
      <Icon name="timer" color="textOnAccentContainer" />
      <Text variant="subhead" color="textOnAccentContainer" style={{ flexShrink: 1 }}>
        {text}
      </Text>
    </Pressable>
  );
}
