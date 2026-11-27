/**
 * Cleaning and capping of user-typed text (SEC-01 M4): names, tags and stores lose control and
 * bidi-override characters and are capped; notes keep line breaks.
 */
/* eslint-disable no-control-regex -- removing control characters is the point */
const UNSAFE_INLINE = new RegExp(
  '[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\u061c\\u180e\\u2060-\\u2064\\ufeff]',
  'g',
);
const UNSAFE_NOTES = new RegExp(
  '[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\u061c\\u180e\\u2060-\\u2064\\ufeff]',
  'g',
);
/* eslint-enable no-control-regex */

export const LIMITS = {
  pantryName: 60,
  recipeName: 80,
  lineName: 60,
  stepName: 60,
  store: 60,
  nameImport: 200,
  recipeNotes: 10_000,
  stepNotes: 2_000,
  tags: 20,
  tagLength: 40,
} as const;

const cap = (value: string, max: number): string => Array.from(value).slice(0, max).join('');

/** Single-line text: unsafe characters out, whitespace collapsed, trimmed, capped. */
export function cleanName(value: string, max: number): string {
  return cap(value.replace(UNSAFE_INLINE, ' ').replace(/\s+/g, ' ').trim(), max);
}

/** Multi-line text: unsafe characters out, line breaks kept, capped. */
export function cleanNotes(value: string, max: number): string {
  return cap(value.replace(UNSAFE_NOTES, ''), max);
}
