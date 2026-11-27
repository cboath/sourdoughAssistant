/**
 * QA-03: hydration and baker's percentages follow the amounts, and the detail screen scales a
 * recipe by loaves or by dough weight without saving (TC-RE-14 to TC-RE-19).
 */
import { configure, act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { pressHeaderButton } from '../../../__tests__/helpers/header';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { Navigator, navigatorTop, resetNavigator } from '../../../__tests__/helpers/navigator';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { flags } from '../../../lib/flags';
import { useSnackbarStore } from '../../../state/snackbar';
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
const DETAIL = ['/recipes', `/recipes/${COUNTRY}`];

afterEach(async () => {
  flags.scheduling = false;
  flags.costSettings = false;
  clearClients();
  routerSpies.reset();
  resetNavigator();
  await act(async () => {
    useRecipeDraft.getState().reset();
  });
  useSnackbarStore.setState({ current: null });
});

const increment = (el: Parameters<typeof fireEvent>[0]) =>
  fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
const decrement = (el: Parameters<typeof fireEvent>[0]) =>
  fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });

async function setLineAmount(label: RegExp, amount: string, unitTestId?: string) {
  await fireEvent.press(await screen.findByLabelText(label));
  const field = await screen.findByTestId('ingredient-amount-input');
  await fireEvent.changeText(field, amount);
  if (unitTestId) {
    await fireEvent.press(screen.getByRole('button', { name: /^Unit,/ }));
    await fireEvent.press(screen.getByTestId(unitTestId));
  }
  await pressHeaderButton('Done');
  await screen.findByTestId('recipe-name');
}

describe('editor: the summary follows the amounts', () => {
  it('starts at the PRD numbers', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    expect(await screen.findByText('Hydration 77.3% (includes levain)')).toBeTruthy();
    expect(screen.getByText('Flour 550 g · Water 425 g · Dough 985 g')).toBeTruthy();
  });

  it('more flour lowers hydration, more water raises it', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await screen.findByTestId('recipe-name');
    await setLineAmount(/^Bread flour, flour, 450 g/, '500');
    // 425 water over 600 flour.
    expect(screen.getByText('Hydration 70.8% (includes levain)')).toBeTruthy();
    expect(screen.getByText('Flour 600 g · Water 425 g · Dough 1,035 g')).toBeTruthy();
    await setLineAmount(/^Water, water, 375 g/, '450');
    // 500 water over 600 flour.
    expect(screen.getByText('Hydration 83.3% (includes levain)')).toBeTruthy();
    expect(screen.getByText('Flour 600 g · Water 500 g · Dough 1,110 g')).toBeTruthy();
  });

  it('cups convert with the pantry density (2 cups of bread flour = 240 g)', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await screen.findByTestId('recipe-name');
    await setLineAmount(/^Bread flour, flour, 450 g/, '2', 'unit-cup');
    expect(screen.getByText('Flour 340 g · Water 425 g · Dough 775 g')).toBeTruthy();
    expect(screen.getByText('Hydration 125.0% (includes levain)')).toBeTruthy();
  });

  it('the levain hydration decides how its weight splits between flour and water', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await screen.findByTestId('recipe-name');
    await fireEvent.press(await screen.findByLabelText(/^Levain, levain, 100 g/));
    await fireEvent.changeText(await screen.findByTestId('levain-hydration'), '50');
    expect(await screen.findByText('100 g levain = 67 g flour + 33 g water.')).toBeTruthy();
    await pressHeaderButton('Done');
    await screen.findByTestId('recipe-name');
    // Flour 500 + 66.7 = 566.7, water 375 + 33.3 = 408.3 (the split is shown in whole grams).
    expect(screen.getByText('Hydration 72.1% (includes levain)')).toBeTruthy();
  });

  it('removing the only flour says to add one instead of showing a number', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await screen.findByTestId('recipe-name');
    for (const label of [/^Bread flour, flour/, /^Whole wheat flour, flour/, /^Levain, levain/]) {
      await fireEvent(await screen.findByLabelText(label), 'accessibilityAction', {
        nativeEvent: { actionName: 'delete' },
      });
    }
    expect(screen.getByText('Hydration –, add a flour')).toBeTruthy();
  });

  it('loaves: the per-loaf weight appears from 2 loaves up', async () => {
    await renderScreen(<Navigator initial={EDIT} />, { seed: true });
    await screen.findByTestId('recipe-name');
    expect(screen.queryByText(/per loaf$/)).toBeNull();
    await increment(screen.getByTestId('loaves-stepper'));
    expect(screen.getByText('493 g per loaf')).toBeTruthy();
    // Hydration is a ratio, so loaves do not change it.
    expect(screen.getByText('Hydration 77.3% (includes levain)')).toBeTruthy();
  });
});

describe("detail: baker's percentages and totals", () => {
  it('every line is a percentage of the total flour (levain flour included)', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await screen.findByText('77.3%');
    expect(
      screen.getByLabelText(/^Bread flour, 450 grams.*baker's percentage 81.8 percent/),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/^Whole wheat flour, 50 grams.*baker's percentage 9.1 percent/),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/^Water, 375 grams.*baker's percentage 68.2 percent/),
    ).toBeTruthy();
    expect(screen.getByLabelText(/^Salt, 10 grams.*baker's percentage 1.8 percent/)).toBeTruthy();
    expect(
      screen.getByLabelText(/^Levain, 100 grams.*baker's percentage 18.2 percent/),
    ).toBeTruthy();
  });
});

describe('detail: scaling by loaves', () => {
  it('3 loaves triple every line, keep the ratios, and are not saved', async () => {
    const { db } = await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await screen.findByText('77.3%');
    const stepper = screen.getByTestId('scale-loaves');
    await increment(stepper);
    await increment(stepper);
    expect(screen.getByText('Total 2,955 g')).toBeTruthy();
    expect(
      screen.getByLabelText(/^Bread flour, 1,350 grams.*baker's percentage 81.8 percent/),
    ).toBeTruthy();
    expect(screen.getByLabelText(/^Water, 1,125 g/)).toBeTruthy();
    expect(screen.getByText('77.3%')).toBeTruthy();
    expect(screen.getByText('$4.16 for 3 loaves')).toBeTruthy();
    expect(screen.getByText('$1.39 per loaf')).toBeTruthy();
    expect((await db.repos.recipes.get(COUNTRY))?.recipe.yieldLoaves).toBe(1);
    await fireEvent.press(screen.getByTestId('scale-reset'));
    expect(screen.getByText('Total 985 g')).toBeTruthy();
    expect(screen.getByLabelText(/^Bread flour, 450 g/)).toBeTruthy();
  });

  it('cannot go below 1 loaf or above 50', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await screen.findByText('77.3%');
    const stepper = screen.getByTestId('scale-loaves');
    await decrement(stepper);
    expect(screen.getByText('Total 985 g')).toBeTruthy();
    for (let i = 0; i < 60; i += 1) await increment(stepper);
    expect(screen.getByText('Total 49,250 g')).toBeTruthy();
  });

  it('a ?loaves= deep link opens at that scale, and "Schedule" stays hidden until RN-06', async () => {
    await renderScreen(<Navigator initial={['/recipes', `/recipes/${COUNTRY}?loaves=2`]} />, {
      seed: true,
    });
    expect(await screen.findByText('Total 1,970 g')).toBeTruthy();
    // DR1-03: no button that leads to "Page not found".
    expect(screen.queryByTestId('schedule')).toBeNull();
  });

  it('with scheduling on, Schedule carries the loaves to the plan route', async () => {
    flags.scheduling = true;
    await renderScreen(<Navigator initial={['/recipes', `/recipes/${COUNTRY}?loaves=2`]} />, {
      seed: true,
    });
    await fireEvent.press(await screen.findByTestId('schedule'));
    expect(navigatorTop()).toBe(`/bake/schedule/plan?recipeId=${COUNTRY}&loaves=2`);
  });

  it('the saved recipe is untouched by scaling: editing it later still shows 1 loaf', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await screen.findByText('77.3%');
    await increment(screen.getByTestId('scale-loaves'));
    await act(async () => {
      routerSpies.push(`/recipe-editor/${COUNTRY}`);
    });
    expect(await screen.findByText('Flour 550 g · Water 425 g · Dough 985 g')).toBeTruthy();
  });
});

describe('detail: scaling by dough weight', () => {
  const openDoughWeight = async () => {
    await screen.findByText('77.3%');
    await fireEvent.press(screen.getByTestId('scale-mode-doughWeight'));
  };

  it('a 1,200 g loaf scales every line by the same factor and keeps 77.3%', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await openDoughWeight();
    const perLoaf = screen.getByTestId('per-loaf');
    await fireEvent.changeText(perLoaf, '1200');
    await fireEvent(perLoaf, 'blur');
    // 1,200 / 985 = 1.218: bread flour 450 -> 548 g, total 1,200 g.
    expect(await screen.findByText('Total 1,200 g')).toBeTruthy();
    expect(screen.getByLabelText(/^Bread flour, 548 grams/)).toBeTruthy();
    expect(screen.getByText('77.3%')).toBeTruthy();
    // Scheduling is hidden until RN-06, and the note lives in its bar.
    expect(screen.queryByText("Bakes use the recipe's dough weight.")).toBeNull();
  });

  it('with scheduling on, the bar says bakes use the recipe dough weight', async () => {
    flags.scheduling = true;
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await openDoughWeight();
    expect(screen.getByText("Bakes use the recipe's dough weight.")).toBeTruthy();
  });

  it('loaves and weight combine: 2 loaves of 1,000 g target 2,000 g', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await openDoughWeight();
    const perLoaf = screen.getByTestId('per-loaf');
    await fireEvent.changeText(perLoaf, '1000');
    await fireEvent(perLoaf, 'blur');
    await increment(screen.getByTestId('scale-loaves'));
    expect(await screen.findByText('Total 2,000 g')).toBeTruthy();
    // Whole-gram rounding of each scaled line moves hydration by 0.1 points at most.
    expect(screen.getByText(/^77\.[23]%$/)).toBeTruthy();
  });

  it.each(['49', '20001', 'abc'])('rejects %p g per loaf', async (typed) => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await openDoughWeight();
    const perLoaf = screen.getByTestId('per-loaf');
    await fireEvent.changeText(perLoaf, typed);
    await fireEvent(perLoaf, 'blur');
    await waitFor(() => expect(screen.getByText('Enter between 50 and 20,000 g.')).toBeTruthy());
    // The last good scale stays on screen.
    expect(screen.getByText('Total 985 g')).toBeTruthy();
  });

  it('Reset returns to the recipe weight', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await openDoughWeight();
    await fireEvent.press(screen.getByTestId('per-loaf-plus'));
    expect(screen.getByText('Total 1,036 g (target 1,035 g)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('scale-reset'));
    expect(screen.getByText('Total 985 g')).toBeTruthy();
  });
});
