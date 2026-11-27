import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { TestDb } from '../../db/test-utils';
import { CostScreen } from '../../features/cost/components/CostScreen';
import { RecipeDetailScreen } from '../../features/recipes/components/RecipeDetailScreen';
import { flags } from '../../lib/flags';
import { useSnackbarStore } from '../../state/snackbar';
import { clearClients, renderScreen } from '../helpers/renderScreen';
import { routerSpies } from '../helpers/mockRouter';

// Rendering a screen over an in-memory database can exceed the 1 s default on a busy machine.
configure({ asyncUtilTimeout: 5000 });

jest.mock('expo-router', () => jest.requireActual('../helpers/mockRouter').mockExpoRouter);

const COUNTRY = '5eed0003-0000-4000-8000-000000000001';

/** Removes the whole wheat flour price. */
const unprice = async ({ repos }: TestDb) => {
  const ww = (await repos.pantry.list()).find((i) => i.name === 'Whole wheat flour');
  await repos.pantry.update(ww!.id, {
    packagePriceCents: null,
    packageSize: null,
    packageUnit: null,
  });
};

afterEach(() => {
  flags.scheduling = false;
  flags.costSettings = false;
  clearClients();
  routerSpies.reset();
  useSnackbarStore.setState({ current: null });
});

describe('RecipeDetailScreen: seeded Country loaf', () => {
  it('shows 77.3% hydration, $1.39 per loaf and the $4.17 suggested price', async () => {
    await renderScreen(<RecipeDetailScreen id={COUNTRY} />, { seed: true });
    expect(await screen.findByText('77.3%')).toBeTruthy();
    expect(screen.getByText('Hydration, incl. levain')).toBeTruthy();
    expect(screen.getByText('$1.39 per loaf')).toBeTruthy();
    expect(screen.getByText('Suggested price $4.17 per loaf')).toBeTruthy();
    expect(screen.getByText('$1.39 for 1 loaf')).toBeTruthy();
    // Per-line cost share on the card, largest first.
    expect(screen.getByText('Bread flour · $1.08')).toBeTruthy();
    expect(screen.getByText('77.7%')).toBeTruthy();
  });

  it("shows baker's percentages, the levain split and totals", async () => {
    await renderScreen(<RecipeDetailScreen id={COUNTRY} />, { seed: true });
    await screen.findByText('77.3%');
    expect(
      screen.getByLabelText(/^Bread flour, 450 grams.*baker's percentage 81.8 percent/),
    ).toBeTruthy();
    expect(
      screen.getByText('100.0% hydration · 50 g flour + 50 g water'.replace('100.0%', '100%')),
    ).toBeTruthy();
    expect(screen.getByText('Total flour 550 g')).toBeTruthy();
    expect(screen.getByText('Total water 425 g')).toBeTruthy();
    expect(screen.getByText('Hydration 77.3%')).toBeTruthy();
    expect(screen.getByText('Total dough 985 g')).toBeTruthy();
  });

  it('scales by loaves without saving, and Reset restores the recipe', async () => {
    const { db } = await renderScreen(<RecipeDetailScreen id={COUNTRY} />, { seed: true });
    await screen.findByText('77.3%');
    const stepper = screen.getByTestId('scale-loaves');
    await fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByText('Total 1,970 g')).toBeTruthy();
    expect(screen.getByText('$2.77 for 2 loaves')).toBeTruthy();
    expect(screen.getByText('×2.00')).toBeTruthy();
    // View-only: the stored recipe is unchanged.
    expect((await db.repos.recipes.get(COUNTRY))?.recipe.yieldLoaves).toBe(1);
    await fireEvent.press(screen.getByTestId('scale-reset'));
    expect(screen.getByText('Total 985 g')).toBeTruthy();
  });

  it('dough-weight mode shows the target and tells the baker bakes use the recipe weight', async () => {
    await renderScreen(<RecipeDetailScreen id={COUNTRY} />, { seed: true });
    await screen.findByText('77.3%');
    await fireEvent.press(screen.getByTestId('scale-mode-doughWeight'));
    await fireEvent.press(screen.getByTestId('per-loaf-plus'));
    expect(screen.getByText('Total 1,036 g (target 1,035 g)')).toBeTruthy();
    expect(screen.queryByText("Bakes use the recipe's dough weight.")).toBeNull();
    const bad = screen.getByTestId('per-loaf');
    await fireEvent.changeText(bad, '10');
    await fireEvent(bad, 'blur');
    expect(screen.getByText('Enter between 50 and 20,000 g.')).toBeTruthy();
  });

  it('opens the cost breakdown with the current loaves and the schedule route', async () => {
    await renderScreen(<RecipeDetailScreen id={COUNTRY} />, { seed: true });
    await screen.findByText('77.3%');
    await fireEvent.press(screen.getByTestId('cost-card'));
    expect(routerSpies.push).toHaveBeenCalledWith(`/recipes/${COUNTRY}/cost?loaves=1`);
    // Scheduling is hidden until RN-06 (DR1-03).
    expect(screen.queryByTestId('schedule')).toBeNull();
  });

  it('with scheduling on, the bar carries the loaves and the dough-weight note', async () => {
    flags.scheduling = true;
    await renderScreen(<RecipeDetailScreen id={COUNTRY} loaves={2} />, { seed: true });
    await screen.findByText('77.3%');
    await fireEvent.press(screen.getByTestId('scale-mode-doughWeight'));
    expect(screen.getByText("2 loaves · Bakes use the recipe's dough weight.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('schedule'));
    expect(String(routerSpies.push.mock.calls.at(-1)?.[0])).toContain(`recipeId=${COUNTRY}`);
  });

  it('shows not-found for an unknown recipe', async () => {
    await renderScreen(<RecipeDetailScreen id="5eed0003-0000-4000-8000-0000000000ff" />, {
      seed: true,
    });
    expect(await screen.findByText('This recipe was deleted.')).toBeTruthy();
  });

  it('marks the cost partial and hides the suggested price when a line has no price', async () => {
    await renderScreen(<RecipeDetailScreen id={COUNTRY} />, { seed: true, prepare: unprice });
    expect(await screen.findByText('Cost incomplete')).toBeTruthy();
    expect(screen.queryByText(/Suggested price/)).toBeNull();
    expect(screen.getByText('1 ingredient has no price.')).toBeTruthy();
  });
});

describe('CostScreen', () => {
  it('matches the PRD worked example row by row', async () => {
    await renderScreen(<CostScreen id={COUNTRY} />, { seed: true });
    expect(await screen.findByTestId('per-loaf')).toHaveTextContent('$1.39');
    expect(screen.getByTestId('batch-total')).toHaveTextContent('$1.39');
    expect(screen.getByTestId('sell-price')).toHaveTextContent('$4.17');
    expect(screen.getByText('450 g at $0.24 per 100 g')).toBeTruthy();
    expect(screen.getByText('50 g flour from 100 g levain, priced as Bread flour')).toBeTruthy();
    expect(screen.getByText('375 g · Free')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('$1.08')).toBeTruthy();
    expect(screen.getByText('77.7%')).toBeTruthy();
    expect(screen.getByText('12.9%')).toBeTruthy();
    expect(screen.getByText('8.6%')).toBeTruthy();
    expect(screen.getByText('Ingredient cost + 200% markup')).toBeTruthy();
    expect(screen.getByText(/Ingredients only/)).toBeTruthy();
  });

  it('at 2 loaves: batch $2.77, $1.39 per loaf and the rounding note', async () => {
    await renderScreen(<CostScreen id={COUNTRY} loaves={2} />, { seed: true });
    expect(await screen.findByTestId('batch-total')).toHaveTextContent('$2.77');
    expect(screen.getByTestId('per-loaf')).toHaveTextContent('$1.39');
    expect(
      screen.getByText('Per loaf is the batch total divided by 2, rounded to the nearest $0.01.'),
    ).toBeTruthy();
    expect(screen.getByText('$2.16')).toBeTruthy();
    expect(screen.getByText('$0.24')).toBeTruthy();
  });

  it('shows "<$0.01" for a line under one cent', async () => {
    await renderScreen(<CostScreen id={COUNTRY} />, {
      seed: true,
      // 10 g of salt at $0.00001 per g costs 0.1 cent.
      prepare: async ({ repos }) => {
        const salt = (await repos.pantry.list()).find((i) => i.name === 'Salt');
        await repos.pantry.update(salt!.id, {
          packagePriceCents: 1,
          packageSize: 1000,
          packageUnit: 'g',
        });
      },
    });
    expect(await screen.findByText('<$0.01')).toBeTruthy();
    expect(screen.getByText('Lines under $0.01 round to 0 in the total.')).toBeTruthy();
  });

  it('partial cost: banner, partial label, no suggested price, and an Add price action', async () => {
    await renderScreen(<CostScreen id={COUNTRY} />, { seed: true, prepare: unprice });
    expect(
      await screen.findByText('Whole wheat flour has no price. Totals leave it out.'),
    ).toBeTruthy();
    expect(screen.getByText('Per loaf, partial')).toBeTruthy();
    expect(screen.getByText('Add the missing prices to see a suggested price.')).toBeTruthy();
    expect(screen.queryByTestId('sell-price')).toBeNull();
    expect(screen.getByLabelText('Add price for Whole wheat flour')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('per-loaf')).toHaveTextContent('$1.21'));
  });

  it('a free (zero-cost) recipe shows no suggested price and says why', async () => {
    await renderScreen(<CostScreen id={COUNTRY} />, {
      seed: true,
      prepare: async ({ repos }) => {
        for (const item of await repos.pantry.list()) {
          if (item.packagePriceCents !== null) {
            await repos.pantry.update(item.id, { packagePriceCents: 0 });
          }
        }
      },
    });
    expect(await screen.findByText('Nothing in this recipe has a cost yet.')).toBeTruthy();
  });
});
