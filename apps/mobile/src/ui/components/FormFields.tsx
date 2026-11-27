import { createContext, useContext } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import type { Unit } from '../../db/types';
import { AmountField, type AmountFieldProps } from './AmountField';
import { TextField, type TextFieldProps } from './TextField';

/**
 * Whether the form has been submitted (a failed Save counts). Screens provide
 * `formState.isSubmitted`; until then a field shows its error only after it was edited and left.
 */
export const FormSubmittedContext = createContext(false);

type TextBase = Omit<TextFieldProps, 'value' | 'onChangeText' | 'error' | 'ref'>;

/** A `TextField` bound to a react-hook-form field: value, change, blur, error and focus ref. */
export function FormTextField<V extends FieldValues>({
  control,
  name,
  onBlur,
  ...rest
}: { control: Control<V>; name: Path<V> } & TextBase) {
  const { field, fieldState } = useController({ control, name });
  const isSubmitted = useContext(FormSubmittedContext);
  // Errors show after the user has edited the field and left it, or after a failed Save (0.3).
  const showError = (fieldState.isTouched && fieldState.isDirty) || isSubmitted;
  return (
    <TextField
      {...rest}
      ref={field.ref}
      value={String(field.value ?? '')}
      onChangeText={field.onChange}
      onBlur={() => {
        field.onBlur();
        onBlur?.();
      }}
      error={showError ? fieldState.error?.message : undefined}
    />
  );
}

type AmountBase = Omit<
  AmountFieldProps,
  'value' | 'onChangeValue' | 'unit' | 'onChangeUnit' | 'error'
>;

/** An `AmountField` bound to two form fields: the typed amount and its unit. */
export function FormAmountField<V extends FieldValues>({
  control,
  name,
  unitName,
  onBlur,
  ...rest
}: { control: Control<V>; name: Path<V>; unitName: Path<V> } & AmountBase) {
  const amount = useController({ control, name });
  const unit = useController({ control, name: unitName });
  const isSubmitted = useContext(FormSubmittedContext);
  const showError = (amount.fieldState.isTouched && amount.fieldState.isDirty) || isSubmitted;
  return (
    <AmountField
      {...rest}
      value={String(amount.field.value ?? '')}
      onChangeValue={amount.field.onChange}
      onBlur={() => {
        amount.field.onBlur();
        onBlur?.();
      }}
      unit={unit.field.value as Unit}
      onChangeUnit={unit.field.onChange}
      error={showError ? amount.fieldState.error?.message : undefined}
    />
  );
}
