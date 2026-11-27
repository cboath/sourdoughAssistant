/**
 * Zod schemas for every screen's route params (SEC-01 M2, architecture section 4).
 *
 * Rules: params may only preselect, prefill or focus something, so no screen may write data on
 * mount because of one. Anything invalid (wrong shape, an array, over-long) is a not-found. A
 * valid-looking id that matches no row is also a not-found, decided by the screen's query.
 */
import { z } from 'zod';

export const uuidParam = z.uuid();
const newOrUuid = z.union([z.literal('new'), uuidParam]);

/** `?loaves=` accepts digits only, 1 to 50 (view-only scale). */
const loavesParam = z
  .string()
  .regex(/^\d{1,2}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(50));

export const MAX_PREFILL_LENGTH = 200;

// Control, bidi-override, zero-width and line-separator characters.
/* eslint-disable no-control-regex -- removing control characters is the point */
const UNSAFE_CHARS = new RegExp(
  '[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\u061c\\u180e\\u2060-\\u2064\\ufeff]',
  'g',
);
/* eslint-enable no-control-regex */

/** Strips control characters, collapses whitespace, trims, then caps at 200 characters. */
export function cleanPrefill(value: string): string {
  const stripped = value.replace(UNSAFE_CHARS, ' ');
  return Array.from(stripped.replace(/\s+/g, ' ').trim()).slice(0, MAX_PREFILL_LENGTH).join('');
}
const prefillParam = z.string().transform(cleanPrefill);

export const routeParams = {
  /** `/bake/[id]` and `/bake/[id]/timeline` */
  bake: z.object({ id: uuidParam, step: uuidParam.optional() }),
  /** `bake/schedule/plan`: prefills the draft only (screens-bake.md 0.1). Nothing is written on mount. */
  schedulePlan: z.object({ recipeId: uuidParam.optional(), loaves: loavesParam.optional() }),
  /** `bake/schedule/permission-notifications` and `permission-alarm`: the bake is already saved. */
  permissionPrimer: z.object({ bakeId: uuidParam }),
  /** `(tabs)/recipes/[id]` and `/cost` */
  recipe: z.object({ id: uuidParam, loaves: loavesParam.optional() }),
  /** `(tabs)/pantry/[id]` */
  pantryItem: z.object({ id: uuidParam }),
  /** `recipe-editor/[id]` */
  recipeEditor: z.object({ id: newOrUuid, duplicateOf: uuidParam.optional() }),
  /** `recipe-editor/ingredient` */
  ingredientEditor: z.object({
    lineId: uuidParam.optional(),
    pantryItemId: uuidParam.optional(),
    role: z.enum(['levain']).optional(),
  }),
  /** `recipe-editor/step` */
  stepEditor: z.object({ stepId: uuidParam.optional() }),
  /** `pantry-editor/[id]` */
  pantryEditor: z.object({
    id: newOrUuid,
    returnTo: z.enum(['ingredient']).optional(),
    name: prefillParam.optional(),
    /** Scroll to and focus a conversion field (from "Add grams per cup"). Focus only, never a write. */
    focus: z.enum(['gramsPerCup', 'gramsPerEach']).optional(),
  }),
  /** `import` takes no params: the file URI only comes from the in-process picker. */
  none: z.object({}),
} as const;

export type RouteParamsResult<T> = { ok: true; params: T } | { ok: false };

/** Raw values as expo-router hands them over: a string, a repeated key (array), or missing. */
export type RawParams = Record<string, string | string[] | undefined>;

/**
 * Validates raw params. Unknown keys are ignored (the router adds its own), but a repeated key
 * (an array) for a key the schema declares is rejected.
 */
export function parseRouteParams<S extends z.ZodObject>(
  schema: S,
  raw: RawParams,
): RouteParamsResult<z.output<S>> {
  const declared = Object.keys(schema.shape);
  const picked: Record<string, string | undefined> = {};
  for (const key of declared) {
    const value = raw[key];
    if (Array.isArray(value)) return { ok: false };
    if (value !== undefined) picked[key] = value;
  }
  const result = schema.safeParse(picked);
  return result.success ? { ok: true, params: result.data } : { ok: false };
}
