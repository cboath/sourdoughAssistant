import { Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusRing } from '../hooks/useFocusRing';
import { useSnackbarClearance } from '../hooks/useSnackbarClearance';
import { useTheme } from '../theme';
import { size as tokenSize, space as tokenSpace } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface FabProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  testID?: string;
}

/** Android Extended FAB for create actions on list roots. Renders nothing on iOS (nav-bar "+"). */
export function Fab({ label, onPress, icon = 'plus', testID }: FabProps) {
  const { color, space, radius, elevation, size, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const focus = useFocusRing();
  useSnackbarClearance(Platform.OS === 'android' ? size.touchKitchen + space.lg : 0);
  if (Platform.OS !== 'android') return null;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...focus.handlers}
      style={[
        {
          position: 'absolute',
          end: layout.screenMargin + insets.right,
          bottom: space.lg,
          minHeight: size.touchKitchen,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg,
          borderRadius: radius.lg,
          backgroundColor: color.accentContainer,
          ...elevation.level3,
        },
        focus.style,
      ]}
    >
      <Icon name={icon} color="textOnAccentContainer" />
      <Text variant="headline" color="textOnAccentContainer">
        {label}
      </Text>
    </Pressable>
  );
}

/** Height to reserve under a list so the FAB never covers the last row. */
export const FAB_CLEARANCE = tokenSize.touchKitchen + tokenSpace.lg * 2;
