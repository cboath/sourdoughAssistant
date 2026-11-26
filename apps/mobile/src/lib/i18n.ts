/**
 * Minimal i18n layer: every user-visible string is a key into `en` (docs/design copy keys arrive
 * with DS-02/03/04). Add locales by adding another table and selecting it in `activeTable`.
 * `{name}` placeholders are replaced from `vars`.
 */
import { enRecipes } from './i18n-recipes';

export const en = {
  ...enRecipes,
  'app.name': 'Sourdough Assistant',
  'tabs.bakes': 'Bakes',
  'tabs.recipes': 'Recipes',
  'tabs.pantry': 'Pantry',
  'tabs.settings': 'Settings',
  'placeholder.bakes': 'Your scheduled and active bakes will appear here.',
  'placeholder.recipes': 'Your recipes will appear here.',
  'placeholder.pantry': 'Your pantry items will appear here.',
  'placeholder.settings': 'Settings will appear here.',
  'placeholder.bake': 'Live bake',
  'placeholder.recipeEditor': 'Recipe editor',
  'placeholder.pantryEditor': 'Pantry item editor',
  'notFound.title': 'Page not found',
  'notFound.body': 'That page does not exist or has been removed.',
  'notFound.action': 'Go to Bakes',
  'startup.title': 'Something went wrong starting the app',
  'startup.body': 'Your data has not been changed. Try again.',
  'startup.tooNewTitle': 'Please update the app',
  'startup.tooNewBody': 'Your data was saved by a newer version of Sourdough Assistant.',
  'startup.retry': 'Try again',
  'common.loading': 'Loading',
  'common.done': 'Done',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.dismiss': 'Dismiss',
  'common.undo': 'Undo',
  'common.tryAgain': 'Try again',
  'common.moreOptions': 'More options',
  'common.clearSearch': 'Clear search',
  'common.search': 'Search',
  'common.error': 'error: {message}',
  'common.increase': 'Increase',
  'common.decrease': 'Decrease',
  'duration.hours': 'Hours',
  'duration.minutes': 'Minutes',
  'duration.hoursShort': 'h',
  'duration.minutesShort': 'min',
  'range.min': 'Minimum',
  'range.default': 'Default',
  'range.max': 'Maximum',
  'range.none': 'No range',
  'range.invalid': 'Default must be between min and max.',
  'amount.unit': 'Unit, {unit}',
  'amount.pickUnit': 'Choose a unit',
  'unit.group.weight': 'Weight',
  'unit.group.volume': 'Volume',
  'unit.group.count': 'Count',
  'unit.g': 'grams',
  'unit.kg': 'kilograms',
  'unit.oz': 'ounces',
  'unit.lb': 'pounds',
  'unit.ml': 'milliliters',
  'unit.l': 'liters',
  'unit.tsp': 'teaspoons',
  'unit.tbsp': 'tablespoons',
  'unit.cup': 'cups',
  'unit.floz': 'fluid ounces',
  'unit.qt': 'quarts',
  'unit.gal': 'gallons',
  'unit.each': 'each',
  'date.year': 'Year',
  'date.month': 'Month',
  'date.day': 'Day',
  'date.opens': 'Opens date picker',
  'date.future': 'The date cannot be in the future.',
  'status.unpriced': 'Unpriced',
  'status.done': 'Done',
  'status.quietHours': 'Quiet hours',
  'status.overtime': 'Over time',
  'status.remindersOff': 'Reminders off',
  'empty.loadFailed': 'Could not load this',
  'chip.remove': 'Remove {name}',
  'search.noResults': 'No results',
} as const;

export type MessageKey = keyof typeof en;

const activeTable: Record<MessageKey, string> = en;

type PluralBase<K extends string> = K extends `${infer B}.one` ? B : never;
/** Base names of keys that have `.one` and `.other` forms, for `tp`. */
export type PluralKey = PluralBase<MessageKey>;

/** Plural lookup (English: one / other) with `{count}` filled in. */
export function tp(key: PluralKey, count: number, vars?: Record<string, string | number>): string {
  const form = new Intl.PluralRules('en').select(count) === 'one' ? 'one' : 'other';
  return t(`${key}.${form}` as MessageKey, { count, ...vars });
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = activeTable[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
