import type { FieldValues, Resolver } from 'react-hook-form';

/**
 * Wraps a pure validator (values -> field messages) as a react-hook-form resolver. Validators stay
 * plain functions, so they are unit-tested without rendering and can use screen context.
 */
export function makeResolver<V extends FieldValues>(
  validate: (values: V) => Partial<Record<keyof V & string, string>>,
): Resolver<V> {
  return async (values) => {
    const found = validate(values);
    const keys = Object.keys(found) as Array<keyof V & string>;
    if (keys.length === 0) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const key of keys) errors[key] = { type: 'validate', message: found[key] as string };
    return { values: {}, errors } as unknown as Awaited<ReturnType<Resolver<V>>>;
  };
}
