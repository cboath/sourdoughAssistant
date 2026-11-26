import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Unit } from '../../db/types';
import { t } from '../../lib/i18n';
import { useFocusRing } from '../hooks/useFocusRing';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { TextField } from './TextField';
import { UnitPicker, unitName } from './UnitPicker';

export interface AmountFieldProps {
  label: string;
  /** The typed amount as text; the screen parses it. */
  value: string;
  onChangeValue: (text: string) => void;
  unit: Unit;
  onChangeUnit: (unit: Unit) => void;
  units?: readonly Unit[];
  /** "about 4 cups · 17.6 oz". Part of the field's accessibility hint. */
  secondary?: string;
  /** Inline informational state, such as a missing grams-per-cup. */
  info?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

export function AmountField({
  label,
  value,
  onChangeValue,
  unit,
  onChangeUnit,
  units,
  secondary,
  info,
  error,
  disabled,
  testID,
}: AmountFieldProps) {
  const { color, space, radius, size } = useTheme();
  const focus = useFocusRing();
  const [open, setOpen] = useState(false);
  return (
    <View testID={testID} style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={label}
            variant="number"
            value={value}
            onChangeText={onChangeValue}
            helper={secondary}
            error={error}
            disabled={disabled}
            testID={testID ? `${testID}-input` : undefined}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('amount.unit', { unit: unitName(unit) })}
          accessibilityState={{ disabled: !!disabled, expanded: open }}
          disabled={disabled}
          onPress={() => setOpen(true)}
          {...focus.handlers}
          style={[
            {
              minHeight: size.touchMin,
              minWidth: size.touchMin + space.xl,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.xs,
              paddingHorizontal: space.md,
              borderRadius: radius.sm,
              borderWidth: size.borderWidth,
              borderColor: color.borderStrong,
              // Aligns with the input when helper text sits under the field.
              marginBottom: secondary || error ? 22 : 0,
            },
            focus.style,
          ]}
        >
          <Text variant="body">{unit}</Text>
          <Icon name="chevronDown" size={size.iconSm} color="textSecondary" />
        </Pressable>
      </View>
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
