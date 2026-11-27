import { Platform, Pressable, View } from 'react-native';
import { useFocusRing } from '../hooks/useFocusRing';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';
import { Icon } from './Icon';
import { Text } from './Text';

export type ChipVariant = 'filter' | 'input' | 'assist';

export interface ChipProps {
  label: string;
  variant?: ChipVariant;
  /** `filter`: whether it is applied. */
  selected?: boolean;
  onPress?: () => void;
  /** `input`: shows a trailing remove control as its own button. */
  onRemove?: () => void;
  disabled?: boolean;
  /** `filter`: one choice in a group (radio) instead of an on/off filter (checkbox). */
  single?: boolean;
  /** Spoken name when it differs from the text ("Tag Rye", "Favorites only"). */
  accessibilityLabel?: string;
  testID?: string;
}

const VISUAL_MIN_HEIGHT = 32;

export function Chip({
  label,
  variant = 'filter',
  selected = false,
  onPress,
  onRemove,
  disabled = false,
  single = false,
  accessibilityLabel,
  testID,
}: ChipProps) {
  const { color, space, radius, size } = useTheme();
  const focus = useFocusRing();
  const pillRadius = Platform.OS === 'ios' ? radius.full : radius.sm;
  const isFilter = variant === 'filter';
  const background = isFilter && selected ? color.accentContainer : 'transparent';
  const textColor = isFilter && selected ? 'textOnAccentContainer' : 'textPrimary';
  const hitExtra = Math.max(0, (size.touchMin - VISUAL_MIN_HEIGHT) / 2);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        testID={testID}
        accessibilityRole={isFilter ? (single ? 'radio' : 'checkbox') : 'button'}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={isFilter ? { checked: selected, disabled } : { disabled }}
        disabled={disabled || !onPress}
        onPress={onPress}
        hitSlop={{ top: hitExtra, bottom: hitExtra }}
        {...focus.handlers}
        style={[
          {
            minHeight: VISUAL_MIN_HEIGHT,
            paddingVertical: space.xs,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            paddingHorizontal: space.md,
            borderRadius: pillRadius,
            borderWidth: size.borderWidth,
            borderColor: isFilter && selected ? color.accentContainer : color.borderStrong,
            backgroundColor: background,
            opacity: disabled ? 0.4 : 1,
          },
          focus.style,
        ]}
      >
        {isFilter && selected ? <Icon name="check" size={size.iconSm} color={textColor} /> : null}
        <Text variant="subhead" color={textColor}>
          {label}
        </Text>
      </Pressable>
      {variant === 'input' && onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chip.remove', { name: label })}
          onPress={onRemove}
          hitSlop={{ top: hitExtra, bottom: hitExtra }}
          style={{
            width: size.touchMin,
            minHeight: VISUAL_MIN_HEIGHT,
            paddingVertical: space.xs,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="close" size={size.iconSm} color="textSecondary" />
        </Pressable>
      ) : null}
    </View>
  );
}
