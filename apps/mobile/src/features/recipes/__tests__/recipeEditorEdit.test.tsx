/**
 * QA-03: edit and save, the discard guard, duplicate, and delete with Undo (TC-RE-07 to TC-RE-13),
 * driven through the real screens with the in-memory `Navigator`.
 */
import { configure, act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { useSnackbarStore } from '../../../state/snackbar';
import {
  headerButton,
  pressHeaderButton,
  pressHeaderRightByTestId,
} from '../../../__tests__/helpers/header';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import {
  Navigator,
  navigatorStack,
  navigatorTop,
  resetNavigator,
} from '../../../__tests__/helpers/navigator';
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

const COUNTRY = '5eed0003-0000-4000-8000-000000000001';
const EDIT = ['/recipes', `/recipes/${COUNTRY}`, `/recipe-editor/${COUNTRY}`];

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(async () => {
  alertSpy.mockRestore();
  clearClients();
  routerSpies.reset();
  resetNavigator();
  await act(async () => {
    useRecipeDraft.getState().reset();
  });
  useSnackbarStore.setState({ current: null });
});

/** Presses a button of the most recent Alert.alert call. */
async function pressAlert(label: string) {
  const buttons = alertSpy.mock.lastCall?.[2] as AlertButton[] | undefined;
  const button = buttons?.find((b) => b.text === label);
  if (!button) throw new Error(`No "${label}" button in ${JSON.stringify(buttons)}`);
  await act(async () => {
    button.onPress?.();
  });
}

const alertTitle = () => alertSpy.mock.lastCall?.[0] as string | undefined;
const saveDisabled = () => headerButton().disabled === true;

/** Opens a line in the editor, types a new amount in grams and presses Done. */
async function setLineAmount(label: RegExp, grams: string) {
  await fireEvent.press(await screen.findByLabelText(label));
  const amount = await screen.findByTestId('ingredient-amount-input');
  await fireEvent.changeText(amount, grams);
  await pressHeaderButton('Done');
  await screen.findByTestId('recipe-name');
}

describe('edit and save', () => {
  it('Save is off until something changes; changes are written once, ids and steps kept', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    const name = await screen.findByTestId('recipe-name');
    expect(saveDisabled()).toBe(true);
    const before = (await db.repos.recipes.get(COUNTRY))!;

    await fireEvent.changeText(name, 'Country loaf v2');
    await waitFor(() => expect(saveDisabled()).toBe(false));
    await setLineAmount(/^Bread flour, flour, 450 g/, '500');
    expect(screen.getByText('Flour 600 g · Water 425 g · Dough 1,035 g')).toBeTruthy();
    // Nothing is written until Save.
    expect((await db.repos.recipes.get(COUNTRY))?.recipe.name).toBe('Country loaf');

    await pressHeaderButton('Save');
    await waitFor(() => expect(navigatorTop()).toBe(`/recipes/${COUNTRY}`));
    const after = (await db.repos.recipes.get(COUNTRY))!;
    expect(after.recipe.name).toBe('Country loaf v2');
    expect(after.ingredients.find((i) => i.name === 'Bread flour')?.amountG).toBe(500);
    expect(after.ingredients.map((i) => i.id).sort()).toEqual(
      before.ingredients.map((i) => i.id).sort(),
    );
    expect(after.steps.map((s) => s.id)).toEqual(before.steps.map((s) => s.id));
    expect(useSnackbarStore.getState().current?.message).toBe('Recipe saved.');
    expect(navigatorStack()).toEqual(['/recipes', `/recipes/${COUNTRY}`]);
  });

  it("the detail screen shows the new hydration, baker's percentages and cost after saving", async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await screen.findByTestId('recipe-name');
    await setLineAmount(/^Bread flour, flour, 450 g/, '500');
    await pressHeaderButton('Save');
    // 425 water / 600 flour = 70.8%; bread flour 500 / 600 = 83.3%; bread flour costs $1.20.
    expect(await screen.findByText('70.8%')).toBeTruthy();
    expect(screen.getByText('Total dough 1,035 g')).toBeTruthy();
    expect(
      screen.getByLabelText(/^Bread flour, 500 grams.*baker's percentage 83.3 percent/),
    ).toBeTruthy();
    expect(await screen.findByText('$1.51 per loaf')).toBeTruthy();
  });

  it('putting a value back leaves the form clean, so Save is off again', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    const name = await screen.findByTestId('recipe-name');
    await fireEvent.changeText(name, 'Changed');
    await waitFor(() => expect(saveDisabled()).toBe(false));
    await fireEvent.changeText(name, 'Country loaf');
    await waitFor(() => expect(saveDisabled()).toBe(true));
  });

  it('trims the name and keeps tags, favorite and notes', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), '  Spaced  ');
    await fireEvent.press(screen.getByTestId('favorite-toggle'));
    await fireEvent.changeText(screen.getByTestId('recipe-notes'), 'Use the big Dutch oven.');
    await pressHeaderButton('Save');
    await waitFor(() => expect(navigatorTop()).toBe(`/recipes/${COUNTRY}`));
    const saved = (await db.repos.recipes.get(COUNTRY))!.recipe;
    expect(saved).toMatchObject({
      name: 'Spaced',
      favorite: true,
      notes: 'Use the big Dutch oven.',
    });
    expect(saved.tags).toContain('Classic');
  });

  // QA-03-B3 (fixed): "Save as new" gives the copy new line and step ids and never rejects unhandled.
  it('a recipe deleted on another path while editing offers Save as new', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Orphan');
    await db.repos.recipes.softDelete(COUNTRY);
    await pressHeaderButton('Save');
    await waitFor(() => expect(alertTitle()).toBe('This recipe was deleted'));
    await pressAlert('Save as new');
    await waitFor(async () =>
      expect((await db.repos.recipes.list()).some((r) => r.name === 'Orphan')).toBe(true),
    );
    expect(await db.repos.recipes.get(COUNTRY)).toBeNull();
  });

  it('BUG QA-03-B3 root cause: re-creating a soft-deleted recipe with its old line ids is rejected', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    const old = (await db.repos.recipes.get(COUNTRY))!;
    await db.repos.recipes.softDelete(COUNTRY);
    await expect(
      db.repos.recipes.create({
        recipe: { ...old.recipe, name: 'Orphan' },
        ingredients: old.ingredients,
        steps: old.steps,
      }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('a write failure keeps the editor open and offers Retry', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Will fail');
    const update = jest
      .spyOn(db.repos.recipes, 'update')
      .mockRejectedValueOnce(new Error('disk full'));
    await pressHeaderButton('Save');
    await waitFor(() => expect(useSnackbarStore.getState().current?.actionLabel).toBe('Retry'));
    expect(navigatorTop()).toBe(`/recipe-editor/${COUNTRY}`);
    expect((await db.repos.recipes.get(COUNTRY))?.recipe.name).toBe('Country loaf');
    await act(async () => {
      useSnackbarStore.getState().current?.onAction?.();
    });
    await waitFor(async () =>
      expect((await db.repos.recipes.get(COUNTRY))?.recipe.name).toBe('Will fail'),
    );
    update.mockRestore();
  });
});

describe('discard guard on a dirty form', () => {
  it('clean form: Cancel closes without asking', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await screen.findByTestId('recipe-name');
    await pressHeaderButton('Cancel', 'headerLeft');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigatorTop()).toBe(`/recipes/${COUNTRY}`);
  });

  it('dirty form: Cancel asks; Keep editing stays, Discard changes leaves and writes nothing', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Unsaved');
    await waitFor(() => expect(saveDisabled()).toBe(false));

    await pressHeaderButton('Cancel', 'headerLeft');
    expect(alertTitle()).toBe('Discard changes?');
    await pressAlert('Keep editing');
    expect(navigatorTop()).toBe(`/recipe-editor/${COUNTRY}`);
    expect(screen.getByTestId('recipe-name')).toHaveProp('value', 'Unsaved');

    await pressHeaderButton('Cancel', 'headerLeft');
    await pressAlert('Discard changes');
    expect(navigatorTop()).toBe(`/recipes/${COUNTRY}`);
    expect((await db.repos.recipes.get(COUNTRY))?.recipe.name).toBe('Country loaf');
  });

  it('Android hardware back and the iOS swipe both go through the same guard', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Unsaved');
    await act(async () => {
      routerSpies.back();
    });
    expect(alertTitle()).toBe('Discard changes?');
    expect(navigatorTop()).toBe(`/recipe-editor/${COUNTRY}`);
  });

  it('a new recipe with only a name typed is dirty; a blank one is not', async () => {
    await renderScreen(<Navigator initial={['/recipes', '/recipe-editor/new']} />, { seed: true });
    await screen.findByTestId('recipe-name');
    await act(async () => {
      routerSpies.back();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(navigatorTop()).toBe('/recipes');

    await act(async () => {
      routerSpies.push('/recipe-editor/new');
    });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'x');
    await act(async () => {
      routerSpies.back();
    });
    expect(alertTitle()).toBe('Discard changes?');
  });

  it('a saved form does not ask on the way out', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Saved');
    await pressHeaderButton('Save');
    await waitFor(() => expect(navigatorTop()).toBe(`/recipes/${COUNTRY}`));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('the ingredient editor has its own guard and the draft keeps the old amount', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.press(await screen.findByLabelText(/^Bread flour, flour, 450 g/));
    await fireEvent.changeText(await screen.findByTestId('ingredient-amount-input'), '999');
    await act(async () => {
      routerSpies.back();
    });
    expect(alertTitle()).toBe('Discard changes to this ingredient?');
    await pressAlert('Discard changes');
    await screen.findByTestId('recipe-name');
    expect(useRecipeDraft.getState().draft?.ingredients[0]?.amountG).toBe(450);
    expect(saveDisabled()).toBe(true);
  });
});

describe('duplicate (copy) a recipe', () => {
  it('from the detail menu: opens a "(copy)" draft that saves as a separate recipe', async () => {
    const { db } = await renderScreen(<Navigator initial={['/recipes', `/recipes/${COUNTRY}`]} />, {
      seed: true,
      prepare: async ({ repos }) => {
        await repos.recipes.update(COUNTRY, { recipe: { favorite: true } });
      },
    });
    await screen.findByText('77.3%');
    await pressHeaderRightByTestId('detail-more');
    await fireEvent.press(await screen.findByText('Duplicate'));
    // The menu action runs after the sheet has slid out.
    await waitFor(() => expect(navigatorTop()).toBe(`/recipe-editor/new?duplicateOf=${COUNTRY}`));
    expect(await screen.findByTestId('recipe-name')).toHaveProp('value', 'Country loaf (copy)');
    expect(useRecipeDraft.getState().draft?.recipe.favorite).toBe(false);
    expect(screen.getByText('Hydration 77.3% (includes levain)')).toBeTruthy();
    // A fresh copy is a new unsaved record, so Save is enabled before any edit (0.3 exception).
    expect(saveDisabled()).toBe(false);
    await fireEvent.changeText(screen.getByTestId('recipe-notes'), 'Copied for the market.');

    await pressHeaderButton('Save');
    await waitFor(() => expect(navigatorTop()).toMatch(/^\/recipes\/[0-9a-f-]{36}$/));
    expect(navigatorTop()).not.toBe(`/recipes/${COUNTRY}`);
    const copy = (await db.repos.recipes.list()).find((r) => r.name === 'Country loaf (copy)')!;
    const original = (await db.repos.recipes.get(COUNTRY))!;
    const copied = (await db.repos.recipes.get(copy.id))!;
    expect(copy.favorite).toBe(false);
    expect(copied.recipe.notes).toBe('Copied for the market.');
    expect(original.recipe.favorite).toBe(true);
    expect(copied.ingredients.map((i) => [i.name, i.amountG])).toEqual(
      original.ingredients.map((i) => [i.name, i.amountG]),
    );
    // New ids everywhere, alongside anchors point at the copy's own steps.
    const originalIds = new Set([...original.ingredients, ...original.steps].map((x) => x.id));
    expect([...copied.ingredients, ...copied.steps].some((x) => originalIds.has(x.id))).toBe(false);
    const copiedStepIds = new Set(copied.steps.map((s) => s.id));
    const alongside = copied.steps.filter((s) => s.anchor.type === 'alongside');
    expect(alongside.length).toBeGreaterThan(0);
    for (const step of alongside) {
      expect(step.anchor.type === 'alongside' && copiedStepIds.has(step.anchor.stepId)).toBe(true);
    }
    expect(copied.steps.map((s) => s.name)).toEqual(original.steps.map((s) => s.name));
  });

  it('editing the copy does not touch the original', async () => {
    const { db } = await renderScreen(
      <Navigator initial={['/recipes', `/recipe-editor/new?duplicateOf=${COUNTRY}`]} />,
      { seed: true },
    );
    await screen.findByTestId('recipe-name');
    await setLineAmount(/^Bread flour, flour, 450 g/, '300');
    await fireEvent.changeText(screen.getByTestId('recipe-name'), 'Smaller loaf');
    await pressHeaderButton('Save');
    await waitFor(() => expect(navigatorTop()).toMatch(/^\/recipes\/[0-9a-f-]{36}$/));
    const original = (await db.repos.recipes.get(COUNTRY))!;
    expect(original.recipe.name).toBe('Country loaf');
    expect(original.ingredients.find((i) => i.name === 'Bread flour')?.amountG).toBe(450);
  });

  it('copying a recipe that was deleted shows not-found, not a blank form', async () => {
    await renderScreen(
      <Navigator
        initial={[
          '/recipes',
          '/recipe-editor/new?duplicateOf=5eed0003-0000-4000-8000-0000000000ff',
        ]}
      />,
      { seed: true },
    );
    expect(await screen.findByText('This recipe was deleted.')).toBeTruthy();
    expect(screen.queryByTestId('recipe-name')).toBeNull();
  });
});

describe('delete, then Undo', () => {
  const undo = async () => {
    const snack = useSnackbarStore.getState().current;
    expect(snack?.actionLabel).toBe('Undo');
    await act(async () => {
      snack?.onAction?.();
    });
  };

  it('from the editor: confirm, delete, Undo restores the recipe, its ingredients and steps', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    const before = (await db.repos.recipes.get(COUNTRY))!;
    await fireEvent.press(await screen.findByTestId('delete-recipe'));
    expect(alertTitle()).toBe('Delete Country loaf?');
    await pressAlert('Delete');
    await waitFor(async () => expect(await db.repos.recipes.get(COUNTRY)).toBeNull());
    expect(navigatorStack()).toEqual(['/recipes']);
    expect(useSnackbarStore.getState().current?.message).toBe('Country loaf deleted.');
    expect(await screen.findByText('Whole wheat loaf')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Country loaf')).toBeNull());

    await undo();
    await waitFor(async () => expect(await db.repos.recipes.get(COUNTRY)).not.toBeNull());
    const after = (await db.repos.recipes.get(COUNTRY))!;
    expect(after.ingredients.map((i) => [i.id, i.amountG])).toEqual(
      before.ingredients.map((i) => [i.id, i.amountG]),
    );
    expect(after.steps.map((s) => s.id)).toEqual(before.steps.map((s) => s.id));
    expect(after.recipe.name).toBe('Country loaf');
    // Back in the list with its numbers.
    expect(await screen.findByText('77.3% hydration · 1 loaf · $1.39 per loaf')).toBeTruthy();
  });

  it('Keep leaves the recipe alone', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.press(await screen.findByTestId('delete-recipe'));
    await pressAlert('Keep');
    expect(await db.repos.recipes.get(COUNTRY)).not.toBeNull();
    expect(navigatorTop()).toBe(`/recipe-editor/${COUNTRY}`);
    expect(useSnackbarStore.getState().current).toBeNull();
  });

  it('delete with unsaved edits does not ask to discard them; Undo restores the saved version', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Unsaved name');
    await fireEvent.press(screen.getByTestId('delete-recipe'));
    await pressAlert('Delete');
    await waitFor(async () => expect(await db.repos.recipes.get(COUNTRY)).toBeNull());
    expect(alertTitle()).toBe('Delete Unsaved name?');
    await undo();
    await waitFor(async () => expect(await db.repos.recipes.get(COUNTRY)).not.toBeNull());
    expect((await db.repos.recipes.get(COUNTRY))?.recipe.name).toBe('Country loaf');
  });

  it('from the detail menu: delete, Undo, and the lines are still there', async () => {
    const { db } = await renderScreen(<Navigator initial={['/recipes', `/recipes/${COUNTRY}`]} />, {
      seed: true,
    });
    await screen.findByText('77.3%');
    await pressHeaderRightByTestId('detail-more');
    await fireEvent.press(await screen.findByText('Delete'));
    // The confirm is raised after the menu sheet has slid out.
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    await pressAlert('Delete');
    await waitFor(async () => expect(await db.repos.recipes.get(COUNTRY)).toBeNull());
    expect(navigatorTop()).toBe('/recipes');
    await undo();
    await waitFor(async () =>
      expect((await db.repos.recipes.get(COUNTRY))?.steps).toHaveLength(10),
    );
    expect((await db.repos.recipes.get(COUNTRY))?.ingredients).toHaveLength(5);
  });

  it('a line deleted in an earlier edit stays deleted after delete and Undo', async () => {
    const { db } = await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await screen.findByTestId('recipe-name');
    const salt = screen.getByLabelText(/^Salt, salt, 10 g/);
    await fireEvent(salt, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    await pressHeaderButton('Save');
    await waitFor(() => expect(navigatorTop()).toBe(`/recipes/${COUNTRY}`));
    expect((await db.repos.recipes.get(COUNTRY))?.ingredients).toHaveLength(4);

    db.clock.advance(5000);
    await act(async () => {
      routerSpies.push(`/recipe-editor/${COUNTRY}`);
    });
    await fireEvent.press(await screen.findByTestId('delete-recipe'));
    await pressAlert('Delete');
    await waitFor(async () => expect(await db.repos.recipes.get(COUNTRY)).toBeNull());
    await undo();
    await waitFor(async () => expect(await db.repos.recipes.get(COUNTRY)).not.toBeNull());
    expect((await db.repos.recipes.get(COUNTRY))?.ingredients.map((i) => i.name)).not.toContain(
      'Salt',
    );
  });
});
