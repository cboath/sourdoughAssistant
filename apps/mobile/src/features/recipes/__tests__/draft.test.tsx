import type { RecipeAggregate } from '../../../db/types';
import {
  addTag,
  blankDraft,
  dependentsOf,
  draftToInput,
  duplicateDraft,
  moveById,
  validateDraft,
  type RecipeDraft,
} from '../draft';
import { applyScale, initialScale } from '../scaling';
import { toLines } from '../metrics';
import { useRecipeDraft, selectIsDirty } from '../store';

let n = 0;
const newId = () => `id-${++n}`;

const flourLine = {
  id: 'l1',
  pantryItemId: null,
  name: 'Bread flour',
  role: 'flour' as const,
  amountG: 500,
  entryAmount: null,
  entryUnit: null,
  levainHydrationPct: null,
};

describe('blank draft', () => {
  it('starts with the ten default steps, valid anchors and no ingredients', () => {
    const draft = blankDraft(newId);
    expect(draft.steps).toHaveLength(10);
    const preheat = draft.steps.find((s) => s.name.startsWith('Preheat'));
    const bake = draft.steps.find((s) => s.name === 'Bake, covered');
    expect(preheat?.anchor).toMatchObject({ type: 'alongside', stepId: bake?.id });
    expect(draft.steps.every((s) => !s.id.startsWith('5eed'))).toBe(true);
    const result = validateDraft(draft);
    expect(result.stepsValid).toBe(true);
    expect(result.ingredients).toBe('Add at least one flour ingredient.');
    expect(result.name).toBe('Enter a recipe name.');
  });
});

describe('validateDraft', () => {
  const valid = (): RecipeDraft => {
    const d = blankDraft(newId);
    return { ...d, recipe: { ...d.recipe, name: 'Rye' }, ingredients: [flourLine] };
  };
  it('passes a complete recipe', () => {
    expect(validateDraft(valid()).issues).toEqual([]);
  });
  it('checks name length, dough weight and flour', () => {
    const d = valid();
    expect(validateDraft({ ...d, recipe: { ...d.recipe, name: 'x'.repeat(81) } }).name).toBe(
      'Use 80 characters or fewer.',
    );
    expect(validateDraft({ ...d, recipe: { ...d.recipe, doughWeightG: 10 } }).doughWeight).toMatch(
      /50 and 20,000/,
    );
    expect(
      validateDraft({ ...d, recipe: { ...d.recipe, doughWeightG: Number.NaN } }).doughWeight,
    ).toBeDefined();
    expect(validateDraft({ ...d, ingredients: [] }).ingredients).toBeDefined();
  });
  it('maps step errors onto the offending step and requires steps', () => {
    const d = valid();
    expect(validateDraft({ ...d, steps: [] }).steps).toBe('Add at least one step.');
    const bulk = d.steps.find((s) => s.kind === 'bulk');
    const broken = d.steps.map((s) => (s.id === bulk?.id ? { ...s, durationMin: 999 } : s));
    const result = validateDraft({ ...d, steps: broken });
    expect(result.stepsValid).toBe(false);
    expect(result.stepErrors[bulk?.id ?? '']).toMatch(/default must be between/);
  });
  it('reports a missing anchor after the anchored step is deleted', () => {
    const d = valid();
    const bake = d.steps.find((s) => s.name === 'Bake, covered');
    const preheat = d.steps.find((s) => s.name.startsWith('Preheat'));
    expect(dependentsOf(d.steps, bake?.id ?? '').map((s) => s.id)).toEqual([preheat?.id]);
    const result = validateDraft({ ...d, steps: d.steps.filter((s) => s.id !== bake?.id) });
    expect(result.stepErrors[preheat?.id ?? '']).toBe('Pick the step this runs alongside.');
  });
});

describe('duplicate', () => {
  it('copies with new ids, remapped anchors, "(copy)" and favorite off', () => {
    const base = blankDraft(newId);
    const aggregate = {
      recipe: {
        id: 'r',
        name: 'Country loaf',
        notes: '',
        yieldLoaves: 2,
        doughWeightG: null,
        tags: ['a'],
        favorite: true,
        seedKey: 'recipe:country-loaf',
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      },
      ingredients: [
        { ...flourLine, recipeId: 'r', position: 0, createdAt: '', updatedAt: '', deletedAt: null },
      ],
      steps: base.steps.map((s, i) => ({
        ...s,
        recipeId: 'r',
        position: i,
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      })),
    } as RecipeAggregate;
    const copy = duplicateDraft(aggregate, newId);
    expect(copy.recipe).toMatchObject({
      name: 'Country loaf (copy)',
      favorite: false,
      yieldLoaves: 2,
    });
    expect(copy.ingredients[0]?.id).not.toBe('l1');
    const oldIds = new Set(base.steps.map((s) => s.id));
    expect(copy.steps.every((s) => !oldIds.has(s.id))).toBe(true);
    const newIds = new Set(copy.steps.map((s) => s.id));
    expect(
      copy.steps.every((s) => s.anchor.type === 'sequential' || newIds.has(s.anchor.stepId)),
    ).toBe(true);
    expect(validateDraft({ ...copy, ingredients: copy.ingredients }).stepsValid).toBe(true);
  });
});

describe('tags and ordering', () => {
  it('trims, de-duplicates case-insensitively and caps', () => {
    expect(addTag(['Classic'], ' rye ')).toEqual({ ok: true, tags: ['Classic', 'rye'] });
    expect(addTag(['Classic'], 'classic')).toEqual({ ok: false, error: 'Already added.' });
    expect(addTag(['a'], 'x'.repeat(41))).toEqual({
      ok: false,
      error: 'Keep tags to 40 characters.',
    });
    const twenty = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(addTag(twenty, 'more')).toEqual({ ok: false, error: 'You can add up to 20 tags.' });
    expect(addTag(['a'], '   ')).toEqual({ ok: true, tags: ['a'] });
  });
  it('moves items and stops at the ends', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveById(list, 'b', 1).map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(moveById(list, 'a', -1).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('cleans names and notes on the way out', () => {
    const d = blankDraft(newId);
    const input = draftToInput({
      ...d,
      recipe: { ...d.recipe, name: '  Rye‮ loaf ', notes: 'a\u0000b', tags: ['  x  '] },
    });
    expect(input.recipe).toMatchObject({ name: 'Rye loaf', notes: 'ab', tags: ['x'] });
  });
});

describe('draft store', () => {
  beforeEach(() => useRecipeDraft.getState().reset());
  it('tracks dirty state, removal with index, and undo by re-insert', () => {
    const store = useRecipeDraft.getState;
    store().init('new', null, { ...blankDraft(newId), ingredients: [flourLine] });
    expect(selectIsDirty(store())).toBe(false);
    store().setRecipe({ name: 'Rye' });
    expect(selectIsDirty(useRecipeDraft.getState())).toBe(true);
    const removed = store().removeIngredient('l1');
    expect(removed?.index).toBe(0);
    expect(store().draft?.ingredients).toHaveLength(0);
    store().insertIngredient(removed!.item, removed!.index);
    expect(store().draft?.ingredients[0]?.id).toBe('l1');
    store().markSaved();
    expect(selectIsDirty(useRecipeDraft.getState())).toBe(false);
  });
});

describe('scaling', () => {
  const lines = toLines([
    { ...flourLine, id: 'f', amountG: 500, role: 'flour' },
    { ...flourLine, id: 'w', name: 'Water', role: 'water', amountG: 375 },
    { ...flourLine, id: 's', name: 'Salt', role: 'salt', amountG: 2.5 },
  ]);
  const init = initialScale({ yieldLoaves: 1, doughWeightG: null, lines });
  it('shows stored amounts untouched at the recipe scale (2.5 g stays 2.5 g)', () => {
    const view = applyScale(lines, 1, init, init);
    expect(view.scaled).toBe(false);
    expect(view.lines.find((l) => l.id === 's')?.amountG).toBe(2.5);
  });
  it('scales by loaves and by dough weight, reporting the target', () => {
    const two = applyScale(lines, 1, { ...init, loaves: 2 }, init);
    expect(two.lines.find((l) => l.id === 'f')?.amountG).toBe(1000);
    const byWeight = applyScale(lines, 1, { ...init, by: 'doughWeight', perLoafG: 1000 }, init);
    expect(byWeight.targetG).toBe(1000);
    expect(byWeight.scaled).toBe(true);
  });
});
