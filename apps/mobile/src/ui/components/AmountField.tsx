import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Unit } from '../../db/types';
import { t } from '../../lib/i18n';
import { useFocusRing } from '../hooks/useFocusRing';
import { useFontScale } from '../hooks/useFontScale';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { TextField } from './TextField';
import { UnitPicker, unitName, unitShort } from './UnitPicker';

export interface AmountFieldProps {
  label: string;
  /** The typed amount as text; the screen parses it. */
  value: string;
  onChangeValue: (text: string) => void;
  onBlur?: () => void;
  unit: Unit;
  onChangeUnit: (unit: Unit) => void;
  units?: readonly Unit[];
  /** "about 4 cups · 17.6 oz". Part of the field's accessibility hint. */
  secondary?: string;
  /** Inline informational state, such as a missing grams-per-cup. */
  info?: string;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  testID?: string;
}

export function AmountField({
  label,
  value,
  onChangeValue,
  onBlur,
  unit,
  onChangeUnit,
  units,
  secondary,
  info,
  error,
  disabled,
  maxLength,
  testID,
}: AmountFieldProps) {
  const { color, space, radius, size } = useTheme();
  const { stacked } = useFontScale();
  const focus = useFocusRing();
  const [open, setOpen] = useState(false);

  const unitButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('amount.unit', { unit: unitName(unit) })}
      accessibilityHint={t('amount.opensUnits')}
      accessibilityState={{ disabled: !!disabled, expanded: open }}
      disabled={disabled}
      onPress={() => setOpen(true)}
      {...focus.handlers}
      style={[
        {
          minHeight: size.touchMin,
          minWidth: size.touchMin,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.xs,
          paddingHorizontal: space.sm,
          borderRadius: radius.sm,
          borderWidth: stacked ? size.borderWidth : 0,
          borderColor: color.borderStrong,
          alignSelf: stacked ? 'flex-start' : 'auto',
        },
        focus.style,
      ]}
    >
      <Text variant="body" accessible={false}>
        {unitShort(unit)}
      </Text>
      <Icon name="chevronDown" size={size.iconSm} color="textSecondary" />
    </Pressable>
  );

  return (
    <View testID={testID} style={{ gap: space.xs }}>
      <TextField
        label={label}
        variant="number"
        value={value}
        onChangeText={onChangeValue}
        onBlur={onBlur}
        helper={secondary}
        error={error}
        disabled={disabled}
        maxLength={maxLength}
        counterFrom={maxLength}
        trailing={stacked ? undefined : unitButton}
        testID={testID ? `${testID}-input` : undefined}
      />
      {stacked ? unitButton : null}
      {info ? (
        <Text variant="footnote" color="textSecondary">
          {info}
        </Text>
      ) : null}
      <UnitPicker
        visible={open}
        value={unit}
        units={units}
        onSelect={onChangeUnit}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
