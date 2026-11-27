import { Pressable } from 'react-native';
import { useTheme } from '../theme';
import { fontWeightSemibold } from '../theme/tokens';
import { Text } from './Text';

export interface HeaderTextButtonProps {
  label: string;
  onPress: () => void;
  bold?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** Text button for navigation headers ("Cancel", "Save", "Done", "Edit"). */
export function HeaderTextButton({
  label,
  onPress,
  bold,
  disabled,
  accessibilityHint,
  testID,
}: HeaderTextButtonProps) {
  const { size, space } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={space.sm}
      style={{
        minHeight: size.touchMin,
        minWidth: size.touchMin,
        paddingHorizontal: space.sm,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        variant="headline"
        color="accent"
        style={bold ? { fontWeight: fontWeightSemibold } : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}
