/**
 * QA-03: the cost card on the recipe detail screen and the breakdown behind it, against the PRD
 * section 6 acceptance example (TC-RE-20 to TC-RE-27). Prices are the seed prices:
 * bread flour $0.0024/g, whole wheat $0.0035/g, salt $0.0010/g, water free.
 */
import { configure, act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { TestDb } from '../../../db/test-utils';
import { routerSpies } from '../../../__tests__/helpers/mockRouter';
import { Navigator, navigatorTop, resetNavigator } from '../../../__tests__/helpers/navigator';
import { clearClients, renderScreen } from '../../../__tests__/helpers/renderScreen';
import { flags } from '../../../lib/flags';
import { useSettings } from '../../../state/settings';
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
const WHEAT = '5eed0001-0000-4000-8000-000000000002';
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
  useSettings.getState().reset();
});

const unpriceWheat = async ({ repos }: TestDb) => {
  await repos.pantry.update(WHEAT, {
    packagePriceCents: null,
    packageSize: null,
    packageUnit: null,
  });
};

const unpriceAll = async ({ repos }: TestDb) => {
  for (const item of await repos.pantry.list()) {
    await repos.pantry.update(item.id, {
      packagePriceCents: null,
      packageSize: null,
      packageUnit: null,
    });
  }
};

describe('cost card: PRD acceptance example', () => {
  it('one loaf: $1.39 per loaf, $4.17 suggested, lines largest first with their shares', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    expect(await screen.findByText('$1.39 per loaf')).toBeTruthy();
    expect(screen.getByText('$1.39 for 1 loaf')).toBeTruthy();
    expect(screen.getByText('Suggested price $4.17 per loaf')).toBeTruthy();
    expect(screen.queryByText('Cost incomplete')).toBeNull();
    const card = screen.getByTestId('cost-card');
    expect(card).toHaveProp(
      'accessibilityLabel',
      expect.stringMatching(
        /^Cost\. \$1\.39 per loaf, \$1\.39 for 1 loaf\. Suggested price \$4\.17\./,
      ),
    );
    // Bread flour $1.08 (450 g) + levain flour $0.12 are billed to the same item.
    expect(screen.getByText('Bread flour · $1.08')).toBeTruthy();
    expect(screen.getByText('Whole wheat flour · $0.18')).toBeTruthy();
    expect(screen.getByText('77.7%')).toBeTruthy();
    expect(screen.getByText('12.9%')).toBeTruthy();
  });

  it('the breakdown opens at the current scale and matches the PRD table row by row', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await screen.findByText('$1.39 per loaf');
    await fireEvent.press(screen.getByTestId('cost-card'));
    expect(navigatorTop()).toBe(`/recipes/${COUNTRY}/cost?loaves=1`);
    expect(await screen.findByTestId('per-loaf')).toHaveTextContent('$1.39');
    expect(screen.getByTestId('batch-total')).toHaveTextContent('$1.39');
    expect(screen.getByTestId('sell-price')).toHaveTextContent('$4.17');
    expect(screen.getByText('$1.08')).toBeTruthy();
    expect(screen.getByText('$0.18')).toBeTruthy();
    expect(screen.getByText('$0.12')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('450 g at $0.24 per 100 g')).toBeTruthy();
  });

  it('two loaves: $2.77 batch, $1.39 per loaf (138.5 cents rounds half up)', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await screen.findByText('$1.39 per loaf');
    await fireEvent(screen.getByTestId('scale-loaves'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(await screen.findByText('$2.77 for 2 loaves')).toBeTruthy();
    expect(screen.getByText('$1.39 per loaf')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cost-card'));
    expect(navigatorTop()).toBe(`/recipes/${COUNTRY}/cost?loaves=2`);
    expect(await screen.findByTestId('batch-total')).toHaveTextContent('$2.77');
    expect(screen.getByText(/rounded to the nearest \$0\.01/)).toBeTruthy();
  });

  it('a price change shows on the card, and the percentages shift with it', async () => {
    const { db, client } = await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await screen.findByText('$1.39 per loaf');
    // Bread flour $12.00 -> $15.00 per 5 kg: $0.003/g, so 500 g (450 + 50 levain) cost $1.50.
    const bread = (await db.repos.pantry.list()).find((i) => i.name === 'Bread flour')!;
    await db.repos.pantry.update(bread.id, { packagePriceCents: 1500 });
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(await screen.findByText('$1.69 per loaf')).toBeTruthy();
    expect(screen.getByText('Suggested price $5.07 per loaf')).toBeTruthy();
  });
});

describe('cost card: partial cost', () => {
  it('an unpriced line marks the cost partial, counts it, and hides the suggested price', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true, prepare: unpriceWheat });
    expect(await screen.findByText('$1.21 per loaf, partial')).toBeTruthy();
    expect(screen.getByText('Cost incomplete')).toBeTruthy();
    expect(screen.getByText('1 ingredient has no price.')).toBeTruthy();
    expect(screen.queryByText(/Suggested price/)).toBeNull();
    expect(screen.getByTestId('cost-card')).toHaveProp(
      'accessibilityLabel',
      expect.not.stringContaining('Suggested price'),
    );
    expect(screen.getByTestId('cost-card')).toHaveProp(
      'accessibilityLabel',
      expect.stringContaining('Cost incomplete'),
    );
  });

  it('two unpriced lines are counted as two', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, {
      seed: true,
      prepare: async (db) => {
        await unpriceWheat(db);
        const salt = (await db.repos.pantry.list()).find((i) => i.name === 'Salt')!;
        await db.repos.pantry.update(salt.id, {
          packagePriceCents: null,
          packageSize: null,
          packageUnit: null,
        });
      },
    });
    expect(await screen.findByText('2 ingredients have no price.')).toBeTruthy();
    expect(screen.queryByText(/Suggested price/)).toBeNull();
  });

  it('nothing priced says so instead of showing $0.00', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true, prepare: unpriceAll });
    expect(await screen.findByText('No prices yet')).toBeTruthy();
    expect(screen.getByText('Add prices in your pantry to see the cost.')).toBeTruthy();
    expect(screen.queryByText(/per loaf$/)).toBeNull();
    expect(screen.queryByText(/Suggested price/)).toBeNull();
  });

  it('adding the missing price from the breakdown completes the cost and shows the sell price', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true, prepare: unpriceWheat });
    await fireEvent.press(await screen.findByTestId('cost-card'));
    expect(await screen.findByText('Per loaf, partial')).toBeTruthy();
    expect(screen.queryByTestId('sell-price')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Add price for Whole wheat flour'));
    await fireEvent.changeText(await screen.findByTestId('price-input'), '7');
    await fireEvent.changeText(screen.getByTestId('size-input-input'), '2000');
    await fireEvent.press(screen.getByTestId('price-save'));

    await waitFor(() => expect(screen.getByTestId('per-loaf')).toHaveTextContent('$1.39'));
    expect(screen.getByTestId('sell-price')).toHaveTextContent('$4.17');
    expect(screen.queryByText('Per loaf, partial')).toBeNull();
  });

  it('a line that is not linked to a pantry item is unpriced and offers to link it', async () => {
    const { db } = await renderScreen(<Navigator initial={DETAIL} />, {
      seed: true,
      prepare: async ({ repos }) => {
        const aggregate = (await repos.recipes.get(COUNTRY))!;
        await repos.recipes.update(COUNTRY, {
          ingredients: aggregate.ingredients.map((i) =>
            i.name === 'Salt' ? { ...i, pantryItemId: null } : i,
          ),
        });
      },
    });
    expect(await screen.findByText('Cost incomplete')).toBeTruthy();
    expect(screen.queryByText(/Suggested price/)).toBeNull();
    await fireEvent.press(screen.getByTestId('cost-card'));
    await fireEvent.press((await screen.findAllByLabelText('Link in recipe'))[0]!);
    expect(navigatorTop()).toBe(`/recipe-editor/${COUNTRY}`);
    expect(db).toBeTruthy();
  });
});

describe('suggested price and links that are not built yet', () => {
  it('the suggested price follows the markup setting (200% -> 100%)', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, {
      seed: true,
      prepare: async ({ repos }) => {
        // The screens read settings from the store, which the app hydrates at launch.
        useSettings.setState({
          status: 'ready',
          settings: await repos.settings.ensure({ markupBps: 10000 }),
        });
      },
    });
    // $1.39 + 100% = $2.78.
    expect(await screen.findByText('Suggested price $2.78 per loaf')).toBeTruthy();
  });

  it('"Change markup" and "Schedule this recipe" are hidden until their routes exist', async () => {
    await renderScreen(<Navigator initial={[...DETAIL, `/recipes/${COUNTRY}/cost?loaves=1`]} />, {
      seed: true,
    });
    expect(await screen.findByText('Ingredient cost + 200% markup')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change markup' })).toBeNull();
  });

  it('the detail screen has no Schedule button until RN-06 (DR1-03)', async () => {
    await renderScreen(<Navigator initial={DETAIL} />, { seed: true });
    await screen.findByText('77.3%');
    expect(screen.queryByTestId('schedule')).toBeNull();
  });

  it('with the flags on, both controls appear and open their routes', async () => {
    flags.costSettings = true;
    flags.scheduling = true;
    await renderScreen(<Navigator initial={[...DETAIL, `/recipes/${COUNTRY}/cost?loaves=1`]} />, {
      seed: true,
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Change markup' }));
    expect(navigatorTop()).toBe('/settings/cost');
  });
});
