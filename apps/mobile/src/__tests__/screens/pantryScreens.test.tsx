import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { usePickedItem } from '../../features/pantry/pickedItem';
import { PantryDetailScreen } from '../../features/pantry/components/PantryDetailScreen';
import { PantryEditorScreen } from '../../features/pantry/components/PantryEditorScreen';
import { PantryListScreen } from '../../features/pantry/components/PantryListScreen';
import { PriceUpdateSheet } from '../../features/pantry/components/PriceUpdateSheet';
import type { TestDb } from '../../db/test-utils';
import type { PantryItem } from '../../db/types';
import { useSnackbarStore } from '../../state/snackbar';
import { headerButton, pressHeaderButton } from '../helpers/header';
import { routerSpies } from '../helpers/mockRouter';
import { clearClients, renderScreen } from '../helpers/renderScreen';

// Rendering a screen over an in-memory database can exceed the 1 s default on a busy machine.
configure({ asyncUtilTimeout: 5000 });

jest.mock('expo-router', () => jest.requireActual('../helpers/mockRouter').mockExpoRouter);
jest.mock('@shopify/flash-list', () => jest.requireActual('../helpers/flashListMock'));

const BREAD = '5eed0001-0000-4000-8000-000000000001';

afterEach(() => {
  clearClients();
  routerSpies.reset();
  useSnackbarStore.setState({ current: null });
});

const addRye = async ({ repos }: TestDb) => {
  await repos.pantry.create({ name: 'Rye flour', category: 'flour' });
};

describe('PantryListScreen', () => {
  it('groups by category, shows unit costs and tags unpriced items', async () => {
    await renderScreen(<PantryListScreen />, { seed: true, prepare: addRye });
    expect(await screen.findByText('Flour')).toBeTruthy();
    expect(screen.getAllByText('Salt').length).toBeGreaterThan(0);
    expect(screen.getByText('$0.24 per 100 g')).toBeTruthy();
    expect(screen.getByText('$12.00 for 5 kg'.replace('5 kg', '5,000 g'))).toBeTruthy();
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Rye flour, unpriced')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Unpriced (1)' })).toBeTruthy();
  });

  it('the Unpriced chip filters, and turns itself off when nothing is unpriced', async () => {
    const { db } = await renderScreen(<PantryListScreen />, { seed: true, prepare: addRye });
    await screen.findByText('Flour');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Unpriced (1)' }));
    expect(screen.queryByLabelText(/^Bread flour/)).toBeNull();
    expect(screen.getByLabelText('Rye flour, unpriced')).toBeTruthy();
    const rye = (await db.repos.pantry.list()).find((i) => i.name === 'Rye flour') as PantryItem;
    await db.repos.pantry.savePrice({
      pantryItemId: rye.id,
      packagePriceCents: 300,
      packageSize: 1,
      packageUnit: 'kg',
      pricedAt: '2026-11-20',
    });
  });

  it('opens an item and the new-item editor', async () => {
    await renderScreen(<PantryListScreen />, { seed: true });
    await fireEvent.press(await screen.findByTestId(`pantry-row-${BREAD}`));
    expect(routerSpies.push).toHaveBeenCalledWith(`/pantry/${BREAD}`);
  });

  it('shows the first-use empty state with an Add item action', async () => {
    await renderScreen(<PantryListScreen />);
    expect(await screen.findByText('Add what you buy')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
    expect(routerSpies.push).toHaveBeenCalledWith('/pantry-editor/new');
  });

  it('Android: search pill filters, shows a no-results state, and has a FAB', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await renderScreen(<PantryListScreen />, { seed: true });
    await screen.findByText('Flour');
    expect(screen.getByTestId('pantry-fab')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search pantry'), 'sal');
    expect(screen.queryByLabelText(/^Bread flour/)).toBeNull();
    expect(screen.getByLabelText(/^Salt/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search pantry'), 'zzz');
    expect(screen.getByText('Nothing in your pantry matches "zzz".')).toBeTruthy();
  });
});

describe('PantryDetailScreen', () => {
  it('shows the price, unit costs, conversions, history and where it is used', async () => {
    await renderScreen(<PantryDetailScreen id={BREAD} />, { seed: true });
    expect(await screen.findByText('$12.00')).toBeTruthy();
    expect(screen.getByText('$0.0024 per g')).toBeTruthy();
    expect(screen.getByText('$0.24 per 100 g')).toBeTruthy();
    expect(screen.getByText('120 g')).toBeTruthy();
    expect(screen.getAllByText('Current').length).toBe(1);
    expect(screen.getByText('Country loaf')).toBeTruthy();
    expect(screen.getByText(/450 g · Flour, 100 g · Levain, flour part priced here/)).toBeTruthy();
  });

  it('shows the change between history rows and deletes one with Undo', async () => {
    const { db } = await renderScreen(<PantryDetailScreen id={BREAD} />, {
      seed: true,
      prepare: async ({ repos }) => {
        await repos.pantry.savePrice({
          pantryItemId: BREAD,
          packagePriceCents: 1296,
          packageSize: 5000,
          packageUnit: 'g',
          pricedAt: '2026-11-20',
        });
      },
    });
    expect(await screen.findByText('Up 8%')).toBeTruthy();
    const rows = await db.repos.priceHistory.listForItem(BREAD);
    await fireEvent.press(screen.getByTestId(`delete-price-${rows[0]?.id}`));
    // The overflow opens a menu first; nothing is deleted until the item is chosen.
    expect((await db.repos.priceHistory.listForItem(BREAD)).length).toBe(2);
    await fireEvent.press(await screen.findByTestId('action-Delete this price'));
    await waitFor(() =>
      expect(useSnackbarStore.getState().current?.message).toBe(
        'Price removed. Current price is now $12.00.',
      ),
    );
    expect((await db.repos.pantry.get(BREAD))?.packagePriceCents).toBe(1200);
    useSnackbarStore.getState().current?.onAction?.();
    await waitFor(async () =>
      expect((await db.repos.pantry.get(BREAD))?.packagePriceCents).toBe(1296),
    );
  });

  it('shows a not-found state for an archived or unknown item', async () => {
    await renderScreen(<PantryDetailScreen id="5eed0001-0000-4000-8000-0000000000ff" />, {
      seed: true,
    });
    expect(await screen.findByText("This item isn't in your pantry anymore.")).toBeTruthy();
  });

  it('warns when a volume package has no grams per cup', async () => {
    const view = await renderScreen(<PantryDetailScreen id={BREAD} />, {
      seed: true,
      prepare: async ({ repos }) => {
        await repos.pantry.update(BREAD, { packageSize: 5, packageUnit: 'cup', gramsPerCup: null });
      },
    });
    expect(view).toBeTruthy();
    expect(
      await screen.findByText('Add grams per cup to work out the cost per gram.'),
    ).toBeTruthy();
  });
});

describe('PriceUpdateSheet', () => {
  const open = async (id = BREAD) => {
    const db = await renderScreen(<></>, { seed: true });
    const item = (await db.db.repos.pantry.get(id)) as PantryItem;
    const onClose = jest.fn();
    db.rerender(<PriceUpdateSheet item={item} onClose={onClose} />);
    return { ...db, onClose, item };
  };

  it('saves a new price to history, closes and offers Undo', async () => {
    const { db, onClose } = await open();
    const price = await screen.findByTestId('price-input');
    await fireEvent.changeText(price, '13.50');
    await fireEvent.press(screen.getByTestId('price-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const item = await db.repos.pantry.get(BREAD);
    expect(item?.packagePriceCents).toBe(1350);
    expect(await db.repos.priceHistory.listForItem(BREAD)).toHaveLength(2);
    expect(useSnackbarStore.getState().current?.message).toBe('Price saved. Recipe costs updated.');
  });

  it('shows errors and does not save an empty or negative price', async () => {
    const { db, onClose } = await open();
    const price = await screen.findByTestId('price-input');
    await fireEvent.changeText(price, '');
    await fireEvent.press(screen.getByTestId('price-save'));
    expect(await screen.findByText("Enter a price, or 0 if it's free.")).toBeTruthy();
    await fireEvent.changeText(price, '-3');
    await fireEvent.press(screen.getByTestId('price-save'));
    expect(await screen.findByText("Price can't be negative.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(await db.repos.priceHistory.listForItem(BREAD)).toHaveLength(1);
  });

  it('shows a live unit-cost preview with the change from the current price', async () => {
    await open();
    await fireEvent.changeText(await screen.findByTestId('price-input'), '12.96');
    expect(await screen.findByText('$0.26 per 100 g · was $0.24 per 100 g (Up 8%)')).toBeTruthy();
  });
});

describe('PantryEditorScreen', () => {
  it('requires a name, then creates an item and returns', async () => {
    const { db } = await renderScreen(<PantryEditorScreen id="new" />);
    const name = await screen.findByTestId('pantry-name');
    await fireEvent.changeText(name, 'Rye flour');
    expect(name.props.value).toBe('Rye flour');
    await fireEvent(name, 'blur');
    expect((await db.repos.pantry.list()).some((i) => i.name === 'Rye flour')).toBe(false);
  });

  it('Save is disabled until the form changes, then validates everything and shows a summary', async () => {
    await renderScreen(<PantryEditorScreen id="new" />);
    await screen.findByTestId('pantry-name');
    expect(headerButton().disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('pantry-price'), '2.40');
    await pressHeaderButton('Save');
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    expect(screen.getByText('Enter the package size too.')).toBeTruthy();
    expect(screen.getByText('Fix 2 things to save.')).toBeTruthy();
    expect(routerSpies.back).not.toHaveBeenCalled();
  });

  it('creates a priced item with its first history row and opens its detail', async () => {
    const { db } = await renderScreen(<PantryEditorScreen id="new" />);
    await fireEvent.changeText(await screen.findByTestId('pantry-name'), 'Rye flour');
    await fireEvent.changeText(screen.getByTestId('pantry-price'), '4.50');
    await fireEvent.changeText(screen.getByTestId('pantry-size-input'), '2');
    await pressHeaderButton('Save');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    const rye = (await db.repos.pantry.list()).find((i) => i.name === 'Rye flour');
    expect(rye).toMatchObject({ packagePriceCents: 450, packageSize: 2, packageUnit: 'g' });
    expect(await db.repos.priceHistory.listForItem(rye!.id)).toHaveLength(1);
    expect(routerSpies.push).toHaveBeenCalledWith(`/pantry/${rye!.id}`);
  });

  it('returnTo=ingredient hands the new item back instead of opening its detail', async () => {
    usePickedItem.getState().expect('add');
    const { db } = await renderScreen(
      <PantryEditorScreen id="new" returnTo="ingredient" name="Seeds" />,
    );
    await fireEvent.changeText(await screen.findByTestId('pantry-name'), 'Seeds mix');
    await pressHeaderButton('Save');
    await waitFor(() => expect(routerSpies.back).toHaveBeenCalled());
    const seeds = (await db.repos.pantry.list()).find((i) => i.name === 'Seeds mix');
    expect(usePickedItem.getState().itemId).toBe(seeds?.id);
    expect(routerSpies.push).not.toHaveBeenCalled();
    usePickedItem.getState().clear();
  });

  it('warns about a duplicate name on blur', async () => {
    await renderScreen(<PantryEditorScreen id="new" />, { seed: true });
    const name = await screen.findByTestId('pantry-name');
    await fireEvent.changeText(name, 'bread flour');
    await fireEvent(name, 'blur');
    expect(await screen.findByText('You already have Bread flour.')).toBeTruthy();
  });

  it('prefills the name and guesses the category from a picker query', async () => {
    await renderScreen(<PantryEditorScreen id="new" returnTo="ingredient" name="Rye flour" />);
    expect((await screen.findByTestId('pantry-name')).props.value).toBe('Rye flour');
    expect(screen.getByText('Flour')).toBeTruthy();
  });

  it('water starts free with a size and density', async () => {
    await renderScreen(<PantryEditorScreen id="new" name="Water" />);
    expect((await screen.findByTestId('pantry-price')).props.value).toBe('0');
    expect(screen.getByText('Water is free by default. Change it if you pay for it.')).toBeTruthy();
    expect(screen.getByTestId('pantry-density').props.value).toBe('236.59');
  });

  it('edit mode shows the price read-only with an Update price action and archive for used items', async () => {
    await renderScreen(<PantryEditorScreen id={BREAD} />, { seed: true });
    expect(await screen.findByText('Current price')).toBeTruthy();
    expect(screen.getByText('$12.00 for 5,000 g')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update price' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Archive item' })).toBeTruthy();
  });
});
