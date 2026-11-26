import { useState, type ComponentRef, type Ref } from 'react';
import { Platform, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';
import { Icon } from './Icon';
import { Text } from './Text';

export type TextFieldVariant = 'text' | 'number' | 'money' | 'multiline';

export type TextFieldRef = ComponentRef<typeof TextInput>;

export interface TextFieldProps {
  /** React 19: `ref` is a regular prop. Use it to focus the first error field on a failed save. */
  ref?: Ref<TextFieldRef>;
  /** Always visible above the input (never a placeholder-only label). */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  variant?: TextFieldVariant;
  /** Currency symbol, "g", "%" ... */
  prefix?: string;
  suffix?: string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  placeholder?: string;
  onBlur?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  testID?: string;
}

/**
 * Text and number input. `number` and `money` use the decimal keyboard and hand the raw text back:
 * parse it with core `parseMoneyInput` (money) or the locale-aware number parser the screen uses.
 */
export function TextField({
  ref,
  label,
  value,
  onChangeText,
  variant = 'text',
  prefix,
  suffix,
  helper,
  error,
  disabled = false,
  readOnly = false,
  maxLength,
  placeholder,
  onBlur,
  returnKeyType,
  onSubmitEditing,
  autoFocus,
  testID,
}: TextFieldProps) {
  const { color, space, radius, size } = useTheme();
  const [focused, setFocused] = useState(false);
  const multiline = variant === 'multiline';
  const numeric = variant === 'number' || variant === 'money';
  const ios = Platform.OS === 'ios';

  const borderColor = error ? color.danger : focused ? color.accent : color.borderStrong;
  const borderWidth = error || focused ? 2 : size.borderWidth;
  const a11yLabel = error ? `${label}, ${t('common.error', { message: error })}` : label;

  if (readOnly) {
    return (
      <View style={{ gap: space.xs }}>
        <Text variant="subhead" color="textSecondary">
          {label}
        </Text>
        <Text
          accessibilityLabel={`${label}, ${value}`}
        >{`${prefix ?? ''}${value}${suffix ?? ''}`}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: space.xs }}>
      <Text variant="subhead" color={disabled ? 'textDisabled' : 'textPrimary'}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: ios ? size.touchMin : 56,
          paddingHorizontal: space.md,
          gap: space.xs,
          borderRadius: radius.sm,
          backgroundColor: disabled ? 'transparent' : color.surfaceSunken,
          borderWidth: disabled ? 0 : borderWidth,
          borderColor,
        }}
      >
        {prefix ? <Text color="textSecondary">{prefix}</Text> : null}
        <TextInput
          ref={ref}
          testID={testID}
          accessibilityLabel={a11yLabel}
          accessibilityHint={helper}
          accessibilityState={{ disabled }}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          multiline={multiline}
          maxLength={maxLength}
          placeholder={placeholder}
          placeholderTextColor={color.textSecondary}
          keyboardType={numeric ? 'decimal-pad' : 'default'}
          inputMode={numeric ? 'decimal' : undefined}
          returnKeyType={returnKeyType ?? (multiline ? 'default' : numeric ? 'done' : 'next')}
          onSubmitEditing={onSubmitEditing}
          autoFocus={autoFocus}
          allowFontScaling
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={{
            flex: 1,
            minHeight: multiline ? 96 : size.touchMin,
            paddingVertical: space.sm,
            color: disabled ? color.textDisabled : color.textPrimary,
            fontSize: ios ? 17 : 16,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {suffix ? <Text color="textSecondary">{suffix}</Text> : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
          <Icon name="error" size={size.iconSm} color="danger" />
          <Text variant="footnote" color="danger" style={{ flexShrink: 1 }}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="footnote" color="textSecondary">
          {helper}
        </Text>
      ) : null}
      {maxLength ? (
        <Text
          variant="footnote"
          color="textSecondary"
          style={{ textAlign: 'right' }}
          accessible={false}
        >
          {`${value.length}/${maxLength}`}
        </Text>
      ) : null}
    </View>
  );
}
