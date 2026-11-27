/**
 * QA-03: creating a recipe through the real screens (list, editor, picker, ingredient editor, step
 * editor, detail) over an in-memory database. Navigation is the in-memory `Navigator` helper.
 */
import { configure, act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { TestDb } from '../../../db/test-utils';
import { useSnackbarStore } from '../../../state/snackbar';
import { headerButton, pressHeaderButton } from '../../../__tests__/helpers/header';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import {
  Navigator,
  navigatorStack,
  navigatorTop,
  resetNavigator,
} from '../../../__tests__/helpers/navigator';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { usePickedItem } from '../../pantry/pickedItem';
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

afterEach(async () => {
  clearClients();
  routerSpies.reset();
  resetNavigator();
  await act(async () => {
    useRecipeDraft.getState().reset();
  });
  useSnackbarStore.setState({ current: null });
});

const pantryId = async (db: TestDb, name: string) =>
  (await db.repos.pantry.list()).find((i) => i.name === name)!.id;

/** A row can appear under "Recent" and under its category, so take the first. */
const pickRow = async (id: string) => (await screen.findAllByTestId(`pick-${id}`))[0]!;

/** Picks a pantry item in the add sheet, types the amount and presses Done. */
async function addLine(itemName: string, id: string, amount: string) {
  await fireEvent.press(await screen.findByTestId('add-ingredient'));
  await fireEvent.press(await pickRow(id));
  expect(await screen.findByTestId('ingredient-name')).toHaveProp('value', itemName);
  await fireEvent.changeText(screen.getByTestId('ingredient-amount-input'), amount);
  await pressHeaderButton('Done');
  await screen.findByTestId('recipe-name');
}

describe('create a recipe (TC-RE-01)', () => {
  it('builds the PRD loaf from the picker and shows 77.3% and $1.39 on the detail screen', async () => {
    const { db } = await renderScreen(<Navigator initial={['/recipes', '/recipe-editor/new']} />, {
      seed: true,
    });
    const bread = await pantryId(db, 'Bread flour');
    const wheat = await pantryId(db, 'Whole wheat flour');
    const salt = await pantryId(db, 'Salt');
    const water = await pantryId(db, 'Water');

    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'PRD loaf');
    // A new recipe starts with the default 10 steps and no ingredients.
    expect(screen.getByText('Hydration –, add a flour')).toBeTruthy();

    await addLine('Bread flour', bread, '450');
    expect(screen.getByLabelText(/^Bread flour, flour, 450 g/)).toBeTruthy();
    await addLine('Whole wheat flour', wheat, '50');
    await addLine('Salt', salt, '10');
    await addLine('Water', water, '375');
    // 500 g flour, 385 g water so far, no levain yet.
    expect(screen.getByText('Hydration 75.0% (includes levain)')).toBeTruthy();

    // Levain: its own picker row, then the flour it is fed with.
    await fireEvent.press(screen.getByTestId('add-ingredient'));
    await fireEvent.press(await screen.findByTestId('pick-levain'));
    await fireEvent.press(await pickRow(bread));
    await fireEvent.changeText(await screen.findByTestId('ingredient-amount-input'), '100');
    expect(await screen.findByText('100 g levain = 50 g flour + 50 g water.')).toBeTruthy();
    await pressHeaderButton('Done');
    await screen.findByTestId('recipe-name');

    expect(screen.getByText('Hydration 77.3% (includes levain)')).toBeTruthy();
    expect(screen.getByText('Flour 550 g · Water 425 g · Dough 985 g')).toBeTruthy();

    // Add an eleventh step.
    await fireEvent.press(screen.getByTestId('add-step'));
    await fireEvent.changeText(await screen.findByTestId('step-name'), 'Autolyse');
    await pressHeaderButton('Done');
    await screen.findByTestId('recipe-name');
    expect(screen.getByText('Autolyse')).toBeTruthy();

    await pressHeaderButton('Save');
    await waitFor(() => expect(navigatorTop()).toMatch(/^\/recipes\/[0-9a-f-]{36}$/));
    expect(navigatorStack()).toHaveLength(2);

    const saved = (await db.repos.recipes.list()).find((r) => r.name === 'PRD loaf');
    expect(saved).toBeTruthy();
    const aggregate = await db.repos.recipes.get(saved!.id);
    expect(aggregate?.ingredients.map((i) => [i.name, i.role, i.amountG])).toEqual([
      ['Bread flour', 'flour', 450],
      ['Whole wheat flour', 'flour', 50],
      ['Salt', 'salt', 10],
      ['Water', 'water', 375],
      ['Levain', 'levain', 100],
    ]);
    expect(aggregate?.ingredients.every((i) => i.pantryItemId !== null)).toBe(true);
    expect(aggregate?.steps).toHaveLength(11);
    expect(useSnackbarStore.getState().current?.message).toBe('Recipe saved.');

    // The detail screen of the new recipe: PRD acceptance numbers.
    expect(await screen.findByText('77.3%')).toBeTruthy();
    expect(screen.getByText('$1.39 per loaf')).toBeTruthy();
    expect(screen.getByText('Suggested price $4.17 per loaf')).toBeTruthy();
    expect(screen.getByText('Total dough 985 g')).toBeTruthy();
  });

  it('a new recipe cannot be saved from a clean form, and nothing is written', async () => {
    const { db } = await renderScreen(<Navigator initial={['/recipes', '/recipe-editor/new']} />);
    await screen.findByTestId('recipe-name');
    const recipesBefore = (await db.repos.recipes.list()).length;
    await waitFor(() => expect(routerSpies.options).toBeDefined());
    const save = (routerSpies.options?.headerRight as () => { props: { disabled?: boolean } })();
    expect(save.props.disabled).toBe(true);
    expect((await db.repos.recipes.list()).length).toBe(recipesBefore);
  });

  it('the picker lists pantry items by category with their price, searches, and offers Add to pantry', async () => {
    const { db } = await renderScreen(<Navigator initial={['/recipes', '/recipe-editor/new']} />, {
      seed: true,
    });
    await fireEvent.press(await screen.findByTestId('add-ingredient'));
    const bread = await pantryId(db, 'Bread flour');
    const row = await pickRow(bread);
    expect(within(row).getByText('Bread flour')).toBeTruthy();
    expect(screen.getByTestId('pick-levain')).toBeTruthy();

    const search = screen.getByLabelText('Search pantry');
    await fireEvent.changeText(search, 'cheddar');
    expect(await screen.findByText('Sharp cheddar')).toBeTruthy();
    expect(screen.queryByTestId('pick-levain')).toBeNull();
    // No exact match, so the sheet offers to create it.
    await fireEvent.changeText(search, 'Rye flour');
    await fireEvent.press(await screen.findByTestId('pick-add-to-pantry'));
    expect(routerSpies.push).toHaveBeenLastCalledWith(
      '/pantry-editor/new?returnTo=ingredient&name=Rye%20flour',
    );
  });

  it('an empty pantry shows the picker empty state with an Add action', async () => {
    await renderScreen(<Navigator initial={['/recipes', '/recipe-editor/new']} />);
    await fireEvent.press(await screen.findByTestId('add-ingredient'));
    expect(await screen.findByText('Your pantry is empty.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
    expect(String(routerSpies.push.mock.lastCall?.[0])).toContain('/pantry-editor/new');
  });

  it('adds a pantry item from the picker and comes back to a prefilled ingredient line', async () => {
    const { db } = await renderScreen(<Navigator initial={['/recipes', '/recipe-editor/new']} />, {
      seed: true,
    });
    await fireEvent.press(await screen.findByTestId('add-ingredient'));
    await fireEvent.changeText(await screen.findByLabelText('Search pantry'), 'Rye flour');
    await fireEvent.press(await screen.findByTestId('pick-add-to-pantry'));
    // The pantry editor is out of scope here; it hands the new id back through the pick store.
    const created = await db.repos.pantry.create({
      name: 'Rye flour',
      category: 'flour',
      packagePriceCents: 500,
      packageSize: 1000,
      packageUnit: 'g',
    });
    await act(async () => {
      usePickedItem.getState().publish(created.id);
      // The pantry editor closes itself after saving; the editor underneath remounts.
      routerSpies.back();
    });
    await waitFor(() =>
      expect(String(routerSpies.push.mock.lastCall?.[0])).toContain(
        `/recipe-editor/ingredient?pantryItemId=${created.id}`,
      ),
    );
  });
});

describe('double tap on Save', () => {
  const doubleTap = async () => {
    const shown: string[] = [];
    // One entry per snackbar: other store updates (a BottomActionBar's clearance, which the detail
    // screen mounts now that scheduling is on) must not count as a second message.
    let lastId = -1;
    const stop = useSnackbarStore.subscribe((state) => {
      if (state.current && state.current.id !== lastId) {
        lastId = state.current.id;
        shown.push(state.current.message);
      }
    });
    const { db } = await renderScreen(<Navigator initial={['/recipes', '/recipe-editor/new']} />, {
      seed: true,
    });
    const bread = await pantryId(db, 'Bread flour');
    await fireEvent.changeText(await screen.findByTestId('recipe-name'), 'Twice');
    await addLine('Bread flour', bread, '500');
    const { onPress } = headerButton();
    await act(async () => {
      onPress();
      onPress();
    });
    await waitFor(() => expect(navigatorTop()).toMatch(/^\/recipes\//));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    stop();
    return { db, shown };
  };

  it('writes exactly one recipe', async () => {
    const { db } = await doubleTap();
    expect((await db.repos.recipes.list()).filter((r) => r.name === 'Twice')).toHaveLength(1);
  });

  // QA-03-B4 (fixed): `save` has an in-flight guard and the header Save is disabled while it runs,
  // so a double tap writes once and never shows a false "Couldn't save".
  it('never shows a save error after a double tap', async () => {
    const { shown } = await doubleTap();
    expect(shown).toEqual(['Recipe saved.']);
  });
});
