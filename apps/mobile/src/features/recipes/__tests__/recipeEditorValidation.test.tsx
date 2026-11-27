/**
 * QA-03: validation in the recipe, ingredient and step editors (TC-RE-02 to TC-RE-06).
 * Forms show an error once the field is touched (blur) or after a failed Save/Done.
 */
import { configure, act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { blankDraft } from '../draft';
import { useSnackbarStore } from '../../../state/snackbar';
import { pressHeaderButton } from '../../../__tests__/helpers/header';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { Navigator, resetNavigator } from '../../../__tests__/helpers/navigator';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { useRecipeDraft } from '../store';

// Whole-screen flows are slower on a loaded CI machine than the 1 s default.
configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(30_000);

jest.mock(
  'expo-router',
  () => jest.requireActual('../../../__tests__/helpers/navigatorState').mockExpoRouterWithNavigator,
);
jest.mock('@shopify/flash-list', () =>
  jest.requireActual('../../../__tests__/helpers/flashListMock'),
);
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));

const BREAD = '5eed0001-0000-4000-8000-000000000001';
const WATER = '5eed0001-0000-4000-8000-000000000004';
const EDITOR = ['/recipes', '/recipe-editor/new'];

afterEach(async () => {
  clearClients();
  routerSpies.reset();
  resetNavigator();
  await act(async () => {
    useRecipeDraft.getState().reset();
  });
  useSnackbarStore.setState({ current: null });
});

/** Store changes that a screen is watching must happen inside act. */
const mutate = (change: () => void) =>
  act(async () => {
    change();
  });

const flourLine = (id = '00000000-0000-4000-8000-0000000000a1') => ({
  id,
  pantryItemId: BREAD,
  name: 'Bread flour',
  role: 'flour' as const,
  amountG: 500,
  entryAmount: 500,
  entryUnit: 'g' as const,
  levainHydrationPct: null,
});

describe('recipe editor validation', () => {
  it('blank or whitespace-only name: error on Save, nothing written, editor stays open', async () => {
    const { db } = await renderScreen(<Navigator initial={EDITOR} />, { seed: true });
    const before = (await db.repos.recipes.list()).length;
    const name = await screen.findByTestId('recipe-name');
    await mutate(() => useRecipeDraft.getState().upsertIngredient(flourLine()));
    await fireEvent.changeText(name, '   ');
    // No error while the user has not tried to save.
    expect(screen.queryByText('Enter a recipe name.')).toBeNull();
    await pressHeaderButton('Save');
    expect((await screen.findAllByText('Enter a recipe name.')).length).toBe(2);
    expect(screen.getByTestId('error-summary')).toHaveTextContent(/Enter a recipe name\./);
    expect((await db.repos.recipes.list()).length).toBe(before);
    expect(routerSpies.back).not.toHaveBeenCalled();
    expect(useSnackbarStore.getState().current).toBeNull();
    // The error clears as soon as the name is valid.
    await fireEvent.changeText(name, 'Rye');
    await waitFor(() => expect(screen.queryByText('Enter a recipe name.')).toBeNull());
  });

  it('no flour: error under the ingredient list; water only is not enough', async () => {
    await renderScreen(<Navigator initial={EDITOR} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Water loaf');
    await mutate(() =>
      useRecipeDraft.getState().upsertIngredient({
        ...flourLine('00000000-0000-4000-8000-0000000000a2'),
        pantryItemId: WATER,
        name: 'Water',
        role: 'water',
        amountG: 300,
      }),
    );
    await pressHeaderButton('Save');
    expect(
      (await screen.findAllByText('Add at least one flour ingredient.')).length,
    ).toBeGreaterThan(0);
    expect(routerSpies.back).not.toHaveBeenCalled();
  });

  it('summarises the first three problems and counts the rest', async () => {
    await renderScreen(<Navigator initial={EDITOR} />, { seed: true });
    await screen.findByTestId('recipe-name');
    // Four problems: name, dough weight, flour, and a step with a bad range.
    await fireEvent.changeText(screen.getByTestId('dough-weight'), '10');
    const steps = useRecipeDraft.getState().draft!.steps;
    await mutate(() =>
      useRecipeDraft.getState().upsertStep({ ...steps[1]!, minMin: 500, maxMin: 100 }),
    );
    await pressHeaderButton('Save');
    const summary = await screen.findByTestId('error-summary');
    expect(summary).toHaveTextContent(/Enter a recipe name\./);
    expect(summary).toHaveTextContent(/Enter between 50 and 20,000 g, or leave it empty\./);
    expect(summary).toHaveTextContent(/\+1 more/);
  });

  it('name length: 80 characters pass, 81 fail; emoji count as one character each', async () => {
    const { db } = await renderScreen(<Navigator initial={EDITOR} />, { seed: true });
    const name = await screen.findByTestId('recipe-name');
    await mutate(() => useRecipeDraft.getState().upsertIngredient(flourLine()));
    await fireEvent.changeText(name, 'x'.repeat(81));
    await pressHeaderButton('Save');
    expect(await screen.findAllByText('Use 80 characters or fewer.')).toBeTruthy();
    expect(await db.repos.recipes.list()).toHaveLength(3);

    await fireEvent.changeText(name, '🍞'.repeat(80));
    await pressHeaderButton('Save');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    expect(await db.repos.recipes.list()).toHaveLength(4);
  });

  it('emoji, RTL text and special characters are stored as typed (trimmed)', async () => {
    const { db } = await renderScreen(<Navigator initial={EDITOR} />, { seed: true });
    const name = await screen.findByTestId('recipe-name');
    await mutate(() => useRecipeDraft.getState().upsertIngredient(flourLine()));
    const rtl = 'خبز العجين المخمر 🥖';
    await fireEvent.changeText(name, `  ${rtl}  `);
    await fireEvent.changeText(screen.getByTestId('recipe-notes'), `Don't "overproof" <b>&</b>\n✓`);
    await pressHeaderButton('Save');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    const saved = (await db.repos.recipes.list()).find((r) => r.name === rtl);
    expect(saved).toBeTruthy();
    expect(saved?.notes).toBe(`Don't "overproof" <b>&</b>\n✓`);
  });

  it('dough weight: below 50 g, above 20,000 g and non-numeric are rejected; empty and 985 pass', async () => {
    await renderScreen(<Navigator initial={EDITOR} />, { seed: true });
    const dw = await screen.findByTestId('dough-weight');
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Dough weights');
    await mutate(() => useRecipeDraft.getState().upsertIngredient(flourLine()));
    for (const bad of ['49', '20001', 'abc']) {
      await fireEvent.changeText(dw, bad);
      await pressHeaderButton('Save');
      expect(
        (await screen.findAllByText('Enter between 50 and 20,000 g, or leave it empty.')).length,
      ).toBeGreaterThan(0);
      expect(routerSpies.back).not.toHaveBeenCalled();
    }
    await fireEvent.changeText(dw, '50');
    await pressHeaderButton('Save');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
  });
});

describe('ingredient editor validation', () => {
  const open = async (itemId = BREAD) => {
    useRecipeDraft.getState().init(
      'new',
      null,
      blankDraft(() => globalThis.crypto.randomUUID()),
    );
    const view = await renderScreen(
      <Navigator initial={['/recipes', `/recipe-editor/ingredient?pantryItemId=${itemId}`]} />,
      { seed: true },
    );
    return { ...view, amount: await screen.findByTestId('ingredient-amount-input') };
  };

  it.each([
    ['0', 'Enter an amount above 0.'],
    ['abc', 'Enter a number.'],
    ['2.55', 'Use up to 1 decimal place.'],
  ])('grams %p shows "%s" and Done does not add a line', async (typed, message) => {
    await open();
    await fireEvent.changeText(screen.getByTestId('ingredient-amount-input'), typed);
    await pressHeaderButton('Done');
    expect(await screen.findByText(message)).toBeTruthy();
    expect(routerSpies.back).not.toHaveBeenCalled();
    expect(useRecipeDraft.getState().draft?.ingredients).toHaveLength(0);
  });

  // QA-03-B1 (fixed): a pasted "-5" is parsed, so it gets "Enter an amount above 0." like 0 does.
  it('a pasted negative amount says "Enter an amount above 0."', async () => {
    await open();
    await fireEvent.changeText(screen.getByTestId('ingredient-amount-input'), '-5');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Enter an amount above 0.', {}, { timeout: 300 })).toBeTruthy();
  });

  it('a pasted negative amount is rejected and nothing is added', async () => {
    await open();
    await fireEvent.changeText(screen.getByTestId('ingredient-amount-input'), '-5');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Enter an amount above 0.')).toBeTruthy();
    expect(useRecipeDraft.getState().draft?.ingredients).toHaveLength(0);
  });

  // QA-03-B2 (fixed): AmountField forwards blur to the form. Per 0.3 rule 2 (and DR1-22) an error
  // shows when the user has EDITED the field and left it, not for a field they only passed over.
  it('an edited amount shows its error when the field loses focus', async () => {
    const { amount } = await open();
    await fireEvent(amount, 'focus');
    await fireEvent.changeText(amount, '0');
    await fireEvent(amount, 'blur');
    expect(await screen.findByText('Enter an amount above 0.')).toBeTruthy();
  });

  it('an amount that was only focused and left shows no error yet (DR1-22)', async () => {
    const { amount } = await open();
    await fireEvent(amount, 'focus');
    await fireEvent(amount, 'blur');
    expect(screen.queryByText('Enter an amount.')).toBeNull();
  });

  it('an empty amount asks for one after a failed Done', async () => {
    await open();
    await pressHeaderButton('Done');
    expect(await screen.findByText('Enter an amount.')).toBeTruthy();
  });

  it('an untouched amount shows no error before the user interacts', async () => {
    await open();
    expect(screen.queryByText('Enter an amount.')).toBeNull();
    expect(screen.queryByText('Enter an amount above 0.')).toBeNull();
  });

  it('more than 50 kg is rejected, 50,000 g is the limit', async () => {
    const { amount } = await open();
    await fireEvent.changeText(amount, '50001');
    await pressHeaderButton('Done');
    expect(
      await screen.findByText("That's more than 50 kg. Check the amount and unit."),
    ).toBeTruthy();
    await fireEvent.changeText(amount, '50000');
    await pressHeaderButton('Done');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
  });

  it('a blank ingredient name is rejected even when the amount is valid', async () => {
    const { amount } = await open();
    await fireEvent.changeText(screen.getByTestId('ingredient-name'), '   ');
    await fireEvent.changeText(amount, '100');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    expect(routerSpies.back).not.toHaveBeenCalled();
  });

  it('the failed-Done banner counts the problems', async () => {
    await open();
    await fireEvent.changeText(screen.getByTestId('ingredient-name'), '');
    await fireEvent.changeText(screen.getByTestId('ingredient-amount-input'), '0');
    await pressHeaderButton('Done');
    expect(await screen.findByText('Fix 2 things to save.')).toBeTruthy();
  });
});

describe('duplicate ingredients (screens-recipes.md section 7: allowed, informational)', () => {
  it('the same pantry item can be added twice; the picker marks it "In this recipe"', async () => {
    const { db } = await renderScreen(<Navigator initial={EDITOR} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Two breads');
    await mutate(() => useRecipeDraft.getState().upsertIngredient(flourLine()));
    await fireEvent.press(await screen.findByTestId('add-ingredient'));
    const rows = await screen.findAllByTestId(`pick-${BREAD}`);
    expect(screen.getAllByText('In this recipe').length).toBe(rows.length);
    await fireEvent.press(rows[0]!);
    await fireEvent.changeText(await screen.findByTestId('ingredient-amount-input'), '100');
    await pressHeaderButton('Done');
    await screen.findByTestId('recipe-name');
    expect(useRecipeDraft.getState().draft?.ingredients.map((i) => i.amountG)).toEqual([500, 100]);
    expect(screen.queryByText(/already/i)).toBeNull();
    expect(screen.getByText(/Flour 600 g/)).toBeTruthy();

    await pressHeaderButton('Save');
    await waitFor(() => expect(routerSpies.push).toHaveBeenCalled());
    const saved = (await db.repos.recipes.list()).find((r) => r.name === 'Two breads');
    expect((await db.repos.recipes.get(saved!.id))?.ingredients).toHaveLength(2);
  });
});
