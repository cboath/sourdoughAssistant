/** Test-only builders. */
import type {
  BakeStepInput,
  NewBakeAggregate,
  NewRecipeAggregate,
  RecipeSnapshotV1,
  StepInput,
} from './types';

export const step = (overrides: Partial<StepInput> = {}): StepInput => ({
  name: 'Bulk ferment',
  kind: 'bulk',
  durationMin: 360,
  minMin: 300,
  maxMin: 480,
  tempSensitive: true,
  anchor: { type: 'sequential' },
  folds: null,
  notify: true,
  ...overrides,
});

export const recipeInput = (overrides: Partial<NewRecipeAggregate> = {}): NewRecipeAggregate => ({
  recipe: { name: 'Country loaf', yieldLoaves: 1, tags: ['Classic'] },
  ingredients: [
    { name: 'Bread flour', role: 'flour', amountG: 500 },
    { name: 'Water', role: 'water', amountG: 375 },
    { name: 'Levain', role: 'levain', amountG: 100, levainHydrationPct: 100 },
  ],
  steps: [
    step({ id: 'bake', name: 'Bake', kind: 'bake', durationMin: 30, minMin: 25, maxMin: 35 }),
    step({
      id: 'preheat',
      name: 'Preheat',
      kind: 'preheat',
      durationMin: 30,
      minMin: 20,
      maxMin: 45,
      anchor: { type: 'alongside', stepId: 'bake', align: 'endsAtStart', offsetMin: 0 },
    }),
  ],
  ...overrides,
});

export const snapshot = (): RecipeSnapshotV1 => ({
  snapshotVersion: 1,
  recipe: { id: 'r', name: 'Country loaf', yieldLoaves: 1, doughWeightG: null, notes: '' },
  ingredients: [
    {
      id: 'i',
      name: 'Flour',
      role: 'flour',
      amountG: 500,
      levainHydrationPct: null,
      pantry: null,
    },
  ],
  steps: [],
});

export const bakeStep = (overrides: Partial<BakeStepInput> = {}): BakeStepInput => ({
  stepKey: 'item1:bulk',
  name: 'Bulk ferment',
  kind: 'bulk',
  durationMin: 360,
  durationSource: 'default',
  minMin: 300,
  maxMin: 480,
  originalPlannedStartAt: '2026-11-27T10:00:00.000Z',
  plannedStartAt: '2026-11-27T10:00:00.000Z',
  plannedEndAt: '2026-11-27T16:00:00.000Z',
  ...overrides,
});

export const bakeInput = (overrides: Partial<NewBakeAggregate> = {}): NewBakeAggregate => ({
  bake: {
    status: 'scheduled',
    mode: 'backward',
    requestedReadyAt: '2026-11-28T15:00:00.000Z',
    originalReadyAt: '2026-11-28T15:00:00.000Z',
    plannedReadyAt: '2026-11-28T15:00:00.000Z',
    timeZone: 'America/New_York',
    ovenCapacity: 2,
    headsUpMin: 10,
    currencyCode: 'USD',
  },
  items: [{ id: 'item1', loaves: 2, scaleFactor: 2, recipeSnapshot: snapshot() }],
  steps: [
    bakeStep({ id: 's1', bakeItemId: 'item1' }),
    bakeStep({
      id: 's2',
      stepKey: 'bake:preheat',
      name: 'Preheat',
      kind: 'preheat',
      bakeItemId: null,
      isAlongside: true,
      durationSource: 'derived',
      originalPlannedStartAt: '2026-11-28T13:00:00.000Z',
      plannedStartAt: '2026-11-28T13:00:00.000Z',
      plannedEndAt: '2026-11-28T14:00:00.000Z',
    }),
  ],
  ...overrides,
});
