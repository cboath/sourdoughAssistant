import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';
import { Icon } from './Icon';

export interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Spoken name, e.g. "Search recipes". */
  accessibilityLabel: string;
  placeholder?: string;
  testID?: string;
}

/**
 * In-list search pill (the Android M3 search bar). On iOS the design asks for the native nav-bar
 * search (`headerSearchBarOptions`), which screens wire in their own `Stack.Screen` options.
 */
export function SearchField({
  value,
  onChangeText,
  accessibilityLabel,
  placeholder,
  testID,
}: SearchFieldProps) {
  const { color, space, radius, size } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: size.touchMin + 8,
        paddingLeft: space.lg,
        gap: space.sm,
        borderRadius: radius.full,
        backgroundColor: color.surfaceSunken,
      }}
    >
      <Icon name="search" color="textSecondary" />
      <TextInput
        testID={testID}
        accessibilityRole="search"
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('common.search')}
        placeholderTextColor={color.textSecondary}
        returnKeyType="search"
        autoCorrect={false}
        allowFontScaling
        style={{ flex: 1, minHeight: size.touchMin, color: color.textPrimary, fontSize: 16 }}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.clearSearch')}
          onPress={() => onChangeText('')}
          style={{
            width: size.touchMin,
            height: size.touchMin,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="close" color="textSecondary" />
        </Pressable>
      ) : null}
    </View>
  );
}
