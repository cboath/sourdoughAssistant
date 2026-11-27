import { Platform, Pressable, View } from 'react-native';
import { useFocusRing } from '../hooks/useFocusRing';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

export interface Segment<V extends string> {
  value: V;
  label: string;
}

export interface SegmentedControlProps<V extends string> {
  /** Spoken name of the group ("Scale by"). */
  label: string;
  segments: readonly Segment<V>[];
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  testID?: string;
}

function SegmentButton({
  label,
  selected,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { color, size, space, radius, elevation, isDark } = useTheme();
  const focus = useFocusRing();
  const ios = Platform.OS === 'ios';
  // iOS: a raised pill on a sunken track. Android (M3): a filled segment with a check icon.
  const selectedStyle = ios
    ? {
        backgroundColor: isDark ? color.surfaceRaised : color.surface,
        ...(isDark
          ? { borderWidth: size.borderWidth, borderColor: color.borderStrong }
          : elevation.level1),
      }
    : { backgroundColor: color.accentContainer };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      {...focus.handlers}
      style={[
        {
          flex: 1,
          minHeight: size.touchMin,
          flexDirection: 'row',
          gap: space.xs,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: space.md,
          borderRadius: radius.sm,
          opacity: disabled ? 0.4 : 1,
        },
        selected ? selectedStyle : null,
        focus.style,
      ]}
    >
      {selected && !ios ? (
        <Icon name="check" size={size.iconSm} color="textOnAccentContainer" />
      ) : null}
      <Text
        variant={selected ? 'headline' : 'body'}
        color={selected && !ios ? 'textOnAccentContainer' : 'textPrimary'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Two or three mutually exclusive options (Loaves | Dough weight). Exposed as a radio group. */
export function SegmentedControl<V extends string>({
  label,
  segments,
  value,
  onChange,
  disabled,
  testID,
}: SegmentedControlProps<V>) {
  const { color, size, radius, space } = useTheme();
  const ios = Platform.OS === 'ios';
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        gap: space.xs,
        padding: space.xs,
        borderRadius: radius.md,
        backgroundColor: ios ? color.surfaceSunken : 'transparent',
        borderWidth: ios ? 0 : size.borderWidth,
        borderColor: color.borderStrong,
      }}
    >
      {segments.map((segment) => (
        <SegmentButton
          key={segment.value}
          label={segment.label}
          selected={segment.value === value}
          disabled={disabled}
          onPress={() => onChange(segment.value)}
          testID={testID ? `${testID}-${segment.value}` : undefined}
        />
      ))}
    </View>
  );
}
