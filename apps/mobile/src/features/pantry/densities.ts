/** Typical grams per cup, used as a default the user can change (screens-recipes.md section 4.1). */
import type { PantryCategory } from '../../db/types';

export const KNOWN_DENSITIES: ReadonlyArray<{ match: string; gramsPerCup: number }> = [
  { match: 'bread flour', gramsPerCup: 120 },
  { match: 'all-purpose flour', gramsPerCup: 125 },
  { match: 'all purpose flour', gramsPerCup: 125 },
  { match: 'whole wheat flour', gramsPerCup: 113 },
  { match: 'rye flour', gramsPerCup: 102 },
  { match: 'fine salt', gramsPerCup: 292 },
  { match: 'sugar', gramsPerCup: 200 },
  { match: 'honey', gramsPerCup: 340 },
  { match: 'water', gramsPerCup: 236.59 },
  { match: 'olive oil', gramsPerCup: 216 },
  { match: 'milk', gramsPerCup: 245 },
  { match: 'butter', gramsPerCup: 227 },
];

/** The first table entry whose phrase appears in the name (case-insensitive), or null. */
export function typicalDensity(name: string): number | null {
  const needle = name.trim().toLocaleLowerCase();
  if (!needle) return null;
  const hit = KNOWN_DENSITIES.find((entry) => needle.includes(entry.match));
  return hit?.gramsPerCup ?? null;
}

const CATEGORY_KEYWORDS: ReadonlyArray<{ words: readonly string[]; category: PantryCategory }> = [
  { words: ['flour'], category: 'flour' },
  { words: ['salt'], category: 'salt' },
  { words: ['water'], category: 'water' },
  { words: ['starter', 'levain'], category: 'starter' },
  { words: ['yeast'], category: 'yeast' },
  { words: ['sugar', 'honey'], category: 'sweetener' },
  { words: ['butter', 'oil'], category: 'fat' },
  { words: ['milk', 'cheese'], category: 'dairy' },
];

/** A default category from keywords in the name; `other` when nothing matches. */
export function guessCategory(name: string): PantryCategory {
  const needle = name.trim().toLocaleLowerCase();
  const hit = CATEGORY_KEYWORDS.find((entry) => entry.words.some((w) => needle.includes(w)));
  return hit?.category ?? 'other';
}
