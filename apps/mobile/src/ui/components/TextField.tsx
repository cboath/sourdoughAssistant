import { useId, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { t } from '../../lib/i18n';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

export type TextFieldVariant = 'text' | 'number' | 'money' | 'multiline';

export type TextFieldRef = ComponentRef<typeof TextInput>;

export interface TextFieldProps {
  /** React 19: `ref` is a regular prop. Use it to focus the first error field on a failed save. */
  ref?: Ref<TextFieldRef>;
  /** Always visible above the input (never a placeholder-only label). */
  label: string;
  /** Spoken name when it differs from `label` (money fields add the currency name). */
  accessibilityLabel?: string;
  value: string;
  onChangeText: (text: string) => void;
  variant?: TextFieldVariant;
  /** Currency symbol, "g", "%" ... */
  prefix?: string;
  suffix?: string;
  /** A control at the end of the input box (the unit button of `AmountField`). */
  trailing?: ReactNode;
  helper?: string;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  /** Show the character counter from this length on. Default: the last 10% (at least 10). */
  counterFrom?: number;
  placeholder?: string;
  onBlur?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  /** Keep the keyboard open after submit (tag entry). */
  keepKeyboardOnSubmit?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

/** Spoken forms of the short suffixes, so "g" is read as "grams" and not as a letter. */
function spokenSuffix(suffix: string | undefined): string | undefined {
  if (!suffix) return undefined;
  if (suffix === 'g') return t('unit.g');
  if (suffix === '%') return t('unit.percent');
  if (suffix === t('duration.minutesShort')) return t('duration.minutes').toLocaleLowerCase();
  if (suffix === t('duration.hoursShort')) return t('duration.hours').toLocaleLowerCase();
  return suffix;
}

/**
 * Text and number input. `number` and `money` use the decimal keyboard (with a "Done" bar on iOS)
 * and hand the raw text back: parse it with core `parseMoneyInput` (money) or `parseNumberInput`.
 */
export function TextField({
  ref,
  label,
  accessibilityLabel,
  value,
  onChangeText,
  variant = 'text',
  prefix,
  suffix,
  trailing,
  helper,
  error,
  disabled = false,
  readOnly = false,
  maxLength,
  counterFrom,
  placeholder,
  onBlur,
  returnKeyType,
  onSubmitEditing,
  keepKeyboardOnSubmit,
  autoFocus,
  testID,
}: TextFieldProps) {
  const { color, space, radius, size, layout, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const accessoryId = `done-${useId()}`;
  const multiline = variant === 'multiline';
  const numeric = variant === 'number' || variant === 'money';
  const ios = Platform.OS === 'ios';

  const borderColor = error ? color.danger : focused ? color.accent : color.borderStrong;
  const borderWidth = error || focused ? 2 : size.borderWidth;
  const spoken = spokenSuffix(suffix);
  const baseLabel = accessibilityLabel ?? (spoken ? `${label}, ${spoken}` : label);
  const a11yLabel = error ? `${baseLabel}, ${t('common.error', { message: error })}` : baseLabel;
  const showCounter =
    maxLength !== undefined &&
    value.length >= (counterFrom ?? maxLength - Math.max(10, Math.round(maxLength * 0.1)));

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
      <Text
        variant="subhead"
        color={disabled ? 'textDisabled' : 'textPrimary'}
        accessible={false}
        importantForAccessibility="no"
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: ios ? size.touchMin : layout.textFieldMinHeightAndroid,
          paddingHorizontal: space.md,
          gap: space.xs,
          borderRadius: radius.sm,
          backgroundColor: disabled ? 'transparent' : color.surfaceSunken,
          borderWidth: disabled ? 0 : borderWidth,
          borderColor,
        }}
      >
        {prefix ? (
          <Text color="textSecondary" accessible={false} importantForAccessibility="no">
            {prefix}
          </Text>
        ) : null}
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
          submitBehavior={keepKeyboardOnSubmit ? 'submit' : undefined}
          inputAccessoryViewID={ios && numeric ? accessoryId : undefined}
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
            minHeight: multiline ? layout.multilineMinHeight : size.touchMin,
            paddingVertical: space.sm,
            color: disabled ? color.textDisabled : color.textPrimary,
            fontSize: typography.body.fontSize,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {suffix ? (
          <Text color="textSecondary" accessible={false} importantForAccessibility="no">
            {suffix}
          </Text>
        ) : null}
        {trailing}
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
      {showCounter ? (
        <Text
          variant="footnote"
          color="textSecondary"
          style={{ alignSelf: 'flex-end' }}
          accessible={false}
        >
          {`${new Intl.NumberFormat().format(value.length)}/${new Intl.NumberFormat().format(maxLength ?? 0)}`}
        </Text>
      ) : null}
      {ios && numeric ? (
        <InputAccessoryView nativeID={accessoryId}>
          <DoneBar />
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

/** The iOS number-pad "Done" bar (components.md 3.7). */
function DoneBar() {
  const { color, space, size } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'flex-end',
        backgroundColor: color.surfaceRaised,
        borderTopWidth: size.borderWidth,
        borderTopColor: color.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.done')}
        onPress={Keyboard.dismiss}
        hitSlop={space.sm}
        style={{
          minHeight: size.touchMin,
          minWidth: size.touchMin,
          paddingHorizontal: space.lg,
          justifyContent: 'center',
        }}
      >
        <Text variant="headline" color="accent">
          {t('common.done')}
        </Text>
      </Pressable>
    </View>
  );
}
