import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { IngredientEditorScreen } from '../../features/recipes/components/IngredientEditorScreen';
import { RecipeEditorScreen } from '../../features/recipes/components/RecipeEditorScreen';
import { RecipeListScreen } from '../../features/recipes/components/RecipeListScreen';
import { StepEditorScreen } from '../../features/recipes/components/StepEditorScreen';
import { blankDraft } from '../../features/recipes/draft';
import { useRecipeDraft } from '../../features/recipes/store';
import { useSnackbarStore } from '../../state/snackbar';
import { headerButton, pressHeaderButton } from '../helpers/header';
import { routerSpies } from '../helpers/mockRouter';
import { clearClients, renderScreen } from '../helpers/renderScreen';

// Rendering a screen over an in-memory database can exceed the 1 s default on a busy machine.
configure({ asyncUtilTimeout: 5000 });

jest.mock('expo-router', () => jest.requireActual('../helpers/mockRouter').mockExpoRouter);
jest.mock('@shopify/flash-list', () => jest.requireActual('../helpers/flashListMock'));
// expo-crypto's native UUID is not available under Jest.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));

const COUNTRY = '5eed0003-0000-4000-8000-000000000001';
const BREAD = '5eed0001-0000-4000-8000-000000000001';
const WHEAT = '5eed0001-0000-4000-8000-000000000002';
const WATER = '5eed0001-0000-4000-8000-000000000004';

afterEach(() => {
  clearClients();
  routerSpies.reset();
  useRecipeDraft.getState().reset();
  useSnackbarStore.setState({ current: null });
});

const increment = (el: Parameters<typeof fireEvent>[0]) =>
  fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

describe('RecipeListScreen', () => {
  it('lists recipes with hydration, loaves and cost per loaf', async () => {
    await renderScreen(<RecipeListScreen />, { seed: true });
    expect(
      await screen.findByLabelText(
        /^Country loaf\. 77\.3 percent hydration, 1 loaf, \$1\.39 per loaf/,
      ),
    ).toBeTruthy();
    expect(screen.getByText('77.3% hydration · 1 loaf · $1.39 per loaf')).toBeTruthy();
    expect(screen.getByText('Whole wheat loaf')).toBeTruthy();
  });

  it('toggles a favorite (persisted) and filters by tag and favorites', async () => {
    const { db } = await renderScreen(<RecipeListScreen />, { seed: true });
    await screen.findByText('Whole wheat loaf');
    await fireEvent.press(screen.getByTestId(`favorite-${COUNTRY}`));
    await waitFor(async () =>
      expect((await db.repos.recipes.get(COUNTRY))?.recipe.favorite).toBe(true),
    );

    await fireEvent.press(screen.getByTestId('chip-favorites'));
    await waitFor(() => expect(screen.queryByText('Whole wheat loaf')).toBeNull());
    expect(screen.getByText('Country loaf')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    await fireEvent.press(await screen.findByTestId('chip-tag-Whole wheat'));
    await waitFor(() => expect(screen.queryByText('Country loaf')).toBeNull());
    expect(screen.getByText('Whole wheat loaf')).toBeTruthy();
    // Tags combine with AND: Classic and Whole wheat share no recipe.
    await fireEvent.press(screen.getByTestId('chip-tag-Classic'));
    expect(await screen.findByText('No recipes have all of these tags.')).toBeTruthy();
  });

  it('Android: search matches names and tags without accents', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await renderScreen(<RecipeListScreen />, { seed: true });
    await screen.findByText('Country loaf');
    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'JALAPENO');
    await waitFor(() => expect(screen.queryByText('Country loaf')).toBeNull());
    expect(screen.getByText('Cheddar jalapeño loaf')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'zzz');
    expect(await screen.findByText('No recipes match "zzz".')).toBeTruthy();
  });

  it('empty state offers New recipe and Add starter recipes', async () => {
    const { db } = await renderScreen(<RecipeListScreen />);
    expect(await screen.findByText('No recipes yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add starter recipes' }));
    await waitFor(async () => expect(await db.repos.recipes.list()).toHaveLength(3));
    expect(await screen.findByText('Country loaf')).toBeTruthy();
  });

  it('New recipe opens the editor directly when there are no recipes', async () => {
    await renderScreen(<RecipeListScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New recipe' }));
    expect(routerSpies.push).toHaveBeenCalledWith('/recipe-editor/new');
  });

  it('New recipe offers Blank or Copy when recipes exist', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await renderScreen(<RecipeListScreen />, { seed: true });
    await screen.findByText('Country loaf');
    await fireEvent.press(screen.getByTestId('recipes-fab'));
    await fireEvent.press(await screen.findByTestId('new-blank'));
    expect(routerSpies.push).toHaveBeenCalledWith('/recipe-editor/new');
    await fireEvent.press(screen.getByTestId('recipes-fab'));
    await fireEvent.press(await screen.findByTestId('new-copy'));
    await fireEvent.press(await screen.findByTestId(`copy-${COUNTRY}`));
    expect(routerSpies.push).toHaveBeenLastCalledWith(`/recipe-editor/new?duplicateOf=${COUNTRY}`);
  });
});

describe('RecipeEditorScreen', () => {
  it('loads a recipe with its live summary and steps', async () => {
    await renderScreen(<RecipeEditorScreen id={COUNTRY} />, { seed: true });
    expect(await screen.findByTestId('recipe-name')).toHaveProp('value', 'Country loaf');
    expect(screen.getByText('Hydration 77.3% (includes levain)')).toBeTruthy();
    expect(screen.getByText('Flour 550 g · Water 425 g · Dough 985 g')).toBeTruthy();
    expect(screen.getByText('Final starter feeding')).toBeTruthy();
    expect(screen.getByText(/total/)).toBeTruthy();
    expect(screen.getByText('4 folds, every 30 min · 2 h')).toBeTruthy();
    expect(screen.getByText(/Alongside Bake, covered · ends when it starts/)).toBeTruthy();
    expect(headerButton().disabled).toBe(true);
  });

  it('reorders with the Move down accessibility action and deletes with Undo', async () => {
    await renderScreen(<RecipeEditorScreen id={COUNTRY} />, { seed: true });
    const first = await screen.findByLabelText(/^Bread flour, flour, 450 g/);
    await fireEvent(first, 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });
    expect(
      useRecipeDraft
        .getState()
        .draft?.ingredients.map((i) => i.name)
        .slice(0, 2),
    ).toEqual(['Whole wheat flour', 'Bread flour']);
    const salt = screen.getByLabelText(/^Salt, salt, 10 g/);
    await fireEvent(salt, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(useRecipeDraft.getState().draft?.ingredients.some((i) => i.name === 'Salt')).toBe(false);
    expect(useSnackbarStore.getState().current?.message).toBe('Salt removed.');
    expect(useSnackbarStore.getState().current?.actionLabel).toBe('Undo');
    useSnackbarStore.getState().current?.onAction?.();
    expect(useRecipeDraft.getState().draft?.ingredients.map((i) => i.name)).toContain('Salt');
  });

  it('Save with an empty name shows the error and a summary, and writes nothing', async () => {
    const { db } = await renderScreen(<RecipeEditorScreen id="new" />);
    const name = await screen.findByTestId('recipe-name');
    await increment(screen.getByTestId('loaves-stepper'));
    await pressHeaderButton('Save');
    expect(await screen.findAllByText('Enter a recipe name.')).toHaveLength(2);
    const summary = screen.getByTestId('error-summary');
    expect(summary).toHaveTextContent(/Add at least one flour ingredient\./);
    expect(summary).toHaveTextContent(/Enter a recipe name\./);
    expect(name).toBeTruthy();
    expect(await db.repos.recipes.list()).toHaveLength(0);
    expect(routerSpies.back).not.toHaveBeenCalled();
  });

  it('creates a recipe from the draft in one save and opens it', async () => {
    const { db } = await renderScreen(<RecipeEditorScreen id="new" />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), '  Rye loaf ');
    useRecipeDraft.getState().upsertIngredient({
      id: '00000000-0000-4000-8000-0000000000a1',
      pantryItemId: BREAD,
      name: 'Bread flour',
      role: 'flour',
      amountG: 500,
      entryAmount: 500,
      entryUnit: 'g',
      levainHydrationPct: null,
    });
    await pressHeaderButton('Save');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    const rye = (await db.repos.recipes.list()).find((r) => r.name === 'Rye loaf');
    expect(rye).toBeTruthy();
    const saved = await db.repos.recipes.get(rye!.id);
    expect(saved?.steps).toHaveLength(10);
    expect(saved?.ingredients[0]?.pantryItemId).toBe(BREAD);
    expect(routerSpies.push).toHaveBeenCalledWith(`/recipes/${rye!.id}`);
    expect(useSnackbarStore.getState().current?.message).toBe('Recipe saved.');
  });

  it('a copy starts with "(copy)" and is not a favorite', async () => {
    await renderScreen(<RecipeEditorScreen id="new" duplicateOf={COUNTRY} />, { seed: true });
    expect(await screen.findByTestId('recipe-name')).toHaveProp('value', 'Country loaf (copy)');
    expect(useRecipeDraft.getState().draft?.recipe.favorite).toBe(false);
  });

  it('adds and removes tags, rejecting duplicates', async () => {
    await renderScreen(<RecipeEditorScreen id={COUNTRY} />, { seed: true });
    const input = await screen.findByTestId('tag-input');
    await fireEvent.changeText(input, 'classic');
    await fireEvent(input, 'submitEditing');
    expect(screen.getByText('Already added.')).toBeTruthy();
    await fireEvent.changeText(input, 'sunday,');
    expect(useRecipeDraft.getState().draft?.recipe.tags).toEqual(['Classic', 'sunday']);
  });

  it('offers to use the ingredients per-loaf weight for the dough weight', async () => {
    await renderScreen(<RecipeEditorScreen id={COUNTRY} />, { seed: true });
    const dw = await screen.findByTestId('dough-weight');
    await fireEvent.changeText(dw, '900');
    await fireEvent.press(await screen.findByRole('button', { name: 'Use 985 g' }));
    expect(useRecipeDraft.getState().draft?.recipe.doughWeightG).toBe(985);
  });

  it('shows not-found for a recipe that does not exist', async () => {
    await renderScreen(<RecipeEditorScreen id="5eed0003-0000-4000-8000-0000000000ff" />, {
      seed: true,
    });
    expect(await screen.findByText('This recipe was deleted.')).toBeTruthy();
  });
});

describe('IngredientEditorScreen', () => {
  const withDraft = () => {
    const draft = blankDraft(() => Math.random().toString(16).slice(2).padEnd(12, '0'));
    useRecipeDraft.getState().init('new', null, draft);
  };

  it('adds a flour line in grams with a cost preview and writes it to the draft only', async () => {
    withDraft();
    const { db } = await renderScreen(<IngredientEditorScreen pantryItemId={BREAD} />, {
      seed: true,
    });
    const amount = await screen.findByTestId('ingredient-amount-input');
    expect(screen.getByTestId('ingredient-name')).toHaveProp('value', 'Bread flour');
    await fireEvent.changeText(amount, '450');
    expect(await screen.findByText('Costs $1.08 in this recipe')).toBeTruthy();
    await pressHeaderButton('Done');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    const line = useRecipeDraft.getState().draft?.ingredients[0];
    expect(line).toMatchObject({
      name: 'Bread flour',
      role: 'flour',
      amountG: 450,
      pantryItemId: BREAD,
    });
    expect(await db.repos.recipes.list()).toHaveLength(3);
  });

  it('validates the amount and keeps the editor open', async () => {
    withDraft();
    await renderScreen(<IngredientEditorScreen pantryItemId={BREAD} />, { seed: true });
    const amount = await screen.findByTestId('ingredient-amount-input');
    await fireEvent.changeText(amount, '0');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Enter an amount above 0.')).toBeTruthy();
    expect(routerSpies.back).not.toHaveBeenCalled();
    await fireEvent.changeText(amount, '2.55');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Use up to 1 decimal place.')).toBeTruthy();
  });

  it('converts cups with the pantry density (120 g per cup)', async () => {
    withDraft();
    await renderScreen(<IngredientEditorScreen pantryItemId={BREAD} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('ingredient-amount-input'), '2');
    await fireEvent.press(screen.getByRole('button', { name: 'Unit, grams' }));
    await fireEvent.press(screen.getByTestId('unit-cup'));
    await pressHeaderButton('Done');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    expect(useRecipeDraft.getState().draft?.ingredients[0]).toMatchObject({
      amountG: 240,
      entryAmount: 2,
      entryUnit: 'cup',
    });
  });

  it('asks for grams per cup when the item has none, and saves it to the pantry item', async () => {
    withDraft();
    const { db } = await renderScreen(<IngredientEditorScreen pantryItemId={BREAD} />, {
      seed: true,
      prepare: async ({ repos }) => {
        await repos.pantry.update(BREAD, { gramsPerCup: null });
      },
    });
    await fireEvent.changeText(await screen.findByTestId('ingredient-amount-input'), '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Unit, grams' }));
    await fireEvent.press(screen.getByTestId('unit-cup'));
    expect(
      await screen.findByText('Add grams per cup for Bread flour to use cups and spoons.'),
    ).toBeTruthy();
    await pressHeaderButton('Done');
    expect(
      await screen.findByText('Enter grams per cup so this price can be used in grams.'),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('ingredient-density'), '125');
    await pressHeaderButton('Done');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    expect((await db.repos.pantry.get(BREAD))?.gramsPerCup).toBe(125);
    expect(useRecipeDraft.getState().draft?.ingredients[0]?.amountG).toBe(125);
  });

  it('water in volume uses 1 g per ml with no density', async () => {
    withDraft();
    await renderScreen(<IngredientEditorScreen pantryItemId={WATER} />, { seed: true });
    expect(await screen.findByTestId('ingredient-name')).toHaveProp('value', 'Water');
    await fireEvent.changeText(screen.getByTestId('ingredient-amount-input'), '300');
    await fireEvent.press(screen.getByRole('button', { name: 'Unit, grams' }));
    await fireEvent.press(screen.getByTestId('unit-ml'));
    await pressHeaderButton('Done');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    expect(useRecipeDraft.getState().draft?.ingredients[0]).toMatchObject({
      role: 'water',
      amountG: 300,
    });
  });

  it('levain: defaults to 100% hydration, shows the split and bills its flour part', async () => {
    withDraft();
    await renderScreen(<IngredientEditorScreen pantryItemId={BREAD} role="levain" />, {
      seed: true,
    });
    await fireEvent.changeText(await screen.findByTestId('ingredient-amount-input'), '100');
    expect(await screen.findByText('100 g levain = 50 g flour + 50 g water.')).toBeTruthy();
    expect(screen.getByText('Its 50 g of flour costs $0.12')).toBeTruthy();
    expect(screen.getByTestId('levain-hydration')).toHaveProp('value', '100');
    await fireEvent.changeText(screen.getByTestId('levain-hydration'), '10');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Enter a hydration between 20% and 300%.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('levain-hydration'), '80');
    await pressHeaderButton('Done');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    expect(useRecipeDraft.getState().draft?.ingredients[0]).toMatchObject({
      role: 'levain',
      levainHydrationPct: 80,
      pantryItemId: BREAD,
    });
  });

  it('an unpriced item shows "No price" and offers Add a price', async () => {
    withDraft();
    await renderScreen(<IngredientEditorScreen pantryItemId={WHEAT} />, {
      seed: true,
      prepare: async ({ repos }) => {
        await repos.pantry.update(WHEAT, {
          packagePriceCents: null,
          packageSize: null,
          packageUnit: null,
        });
      },
    });
    await fireEvent.changeText(await screen.findByTestId('ingredient-amount-input'), '50');
    expect(await screen.findByText('No price for Whole wheat flour.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a price' })).toBeTruthy();
  });

  it('shows not-found without a draft (deep link)', async () => {
    await renderScreen(<IngredientEditorScreen pantryItemId={BREAD} />, { seed: true });
    expect(await screen.findByText("This ingredient isn't in the recipe anymore.")).toBeTruthy();
  });
});

describe('StepEditorScreen', () => {
  const withDraft = () => {
    let n = 0;
    useRecipeDraft.getState().init(
      'new',
      null,
      blankDraft(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`),
    );
  };

  it('adds a plain step with a range', async () => {
    withDraft();
    await renderScreen(<StepEditorScreen />);
    await fireEvent.changeText(await screen.findByTestId('step-name'), 'Autolyse');
    await pressHeaderButton('Done');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    const steps = useRecipeDraft.getState().draft?.steps ?? [];
    expect(steps).toHaveLength(11);
    expect(steps.at(-1)).toMatchObject({
      name: 'Autolyse',
      durationMin: 30,
      minMin: 30,
      maxMin: 30,
    });
  });

  it('requires a name', async () => {
    withDraft();
    await renderScreen(<StepEditorScreen />);
    await screen.findByTestId('step-name');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    expect(routerSpies.back).not.toHaveBeenCalled();
  });

  it('folds mode derives the total and disables temperature sensitivity', async () => {
    withDraft();
    await renderScreen(<StepEditorScreen />);
    await screen.findByTestId('step-name');
    await fireEvent.press(screen.getByTestId('step-timing-folds'));
    expect(
      screen.getByText(
        'Total: 2 h (4 folds × 30 min). The next step starts one interval after the last fold.',
      ),
    ).toBeTruthy();
    await increment(screen.getByTestId('fold-count'));
    expect(screen.getByText(/Total: 2 h 30 min \(5 folds × 30 min\)/)).toBeTruthy();
    expect(screen.getByText('Fold steps have a fixed length.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('fold-interval'), '3');
    await fireEvent.changeText(screen.getByTestId('step-name'), 'Folds');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Use 5 to 180 minutes between folds.')).toBeTruthy();
  });

  it('edits an existing alongside step and previews its timing', async () => {
    withDraft();
    const preheat = useRecipeDraft
      .getState()
      .draft?.steps.find((s) => s.name.startsWith('Preheat'));
    await renderScreen(<StepEditorScreen stepId={preheat?.id} />);
    expect(await screen.findByTestId('step-preview')).toHaveTextContent(
      'Preheat oven and Dutch oven ends when Bake, covered starts.',
    );
    await fireEvent.changeText(screen.getByTestId('step-offset'), '10');
    expect(screen.getByTestId('step-preview')).toHaveTextContent(
      'Preheat oven and Dutch oven ends 10 min before Bake, covered starts.',
    );
    await pressHeaderButton('Done');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    const saved = useRecipeDraft.getState().draft?.steps.find((s) => s.id === preheat?.id);
    expect(saved?.anchor).toMatchObject({
      type: 'alongside',
      offsetMin: -10,
      align: 'endsAtStart',
    });
  });

  it("can't make a step that others run alongside into an alongside step", async () => {
    withDraft();
    const bake = useRecipeDraft.getState().draft?.steps.find((s) => s.name === 'Bake, covered');
    await renderScreen(<StepEditorScreen stepId={bake?.id} />);
    const toggle = await screen.findByTestId('step-alongside');
    expect(toggle).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
    expect(
      screen.getByText(/runs alongside this step, so this one can't run alongside another/),
    ).toBeTruthy();
  });

  it('deletes a step with Undo', async () => {
    withDraft();
    const shape = useRecipeDraft.getState().draft?.steps.find((s) => s.name === 'Shape');
    await renderScreen(<StepEditorScreen stepId={shape?.id} />);
    await fireEvent.press(await screen.findByTestId('delete-step'));
    expect(useRecipeDraft.getState().draft?.steps.some((s) => s.id === shape?.id)).toBe(false);
    useSnackbarStore.getState().current?.onAction?.();
    expect(useRecipeDraft.getState().draft?.steps.some((s) => s.id === shape?.id)).toBe(true);
  });
});
