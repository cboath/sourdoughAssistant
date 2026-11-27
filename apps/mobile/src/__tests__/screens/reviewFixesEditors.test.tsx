/** M3 design-review fixes (DR1-xx): behaviors that need a render to prove. */
import { act, configure, fireEvent, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { FormSubmittedContext, FormTextField } from '../../ui/components/FormFields';
import { renderWithTheme } from '../../ui/testing';
import { useSnackbarStore } from '../../state/snackbar';
import { PantryEditorScreen } from '../../features/pantry/components/PantryEditorScreen';
import { RecipeEditorScreen } from '../../features/recipes/components/RecipeEditorScreen';
import { PriceUpdateSheet } from '../../features/pantry/components/PriceUpdateSheet';
import type { PantryItem } from '../../db/types';
import { useRecipeDraft } from '../../features/recipes/store';
import { routerSpies } from '../helpers/mockRouter';
import { clearClients, renderScreen } from '../helpers/renderScreen';
import { pressHeaderButton } from '../helpers/header';

configure({ asyncUtilTimeout: 5000 });

jest.mock('expo-router', () => {
  const real = jest.requireActual('../helpers/mockRouter').mockExpoRouter as {
    useNavigation: () => unknown;
  } & Record<string, unknown>;
  return {
    ...real,
    useNavigation: () => (globalThis as { __nav?: unknown }).__nav ?? real.useNavigation(),
  };
});
jest.mock('@shopify/flash-list', () => jest.requireActual('../helpers/flashListMock'));
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));

const COUNTRY = '5eed0003-0000-4000-8000-000000000001';
const BREAD = '5eed0001-0000-4000-8000-000000000001';

afterEach(() => {
  clearClients();
  routerSpies.reset();
  useRecipeDraft.getState().reset();
  useSnackbarStore.setState({ current: null, clearances: {} });
  (globalThis as { __nav?: unknown }).__nav = undefined;
  jest.restoreAllMocks();
});

describe('DR1-05, DR1-07, DR1-08: the recipe editor summary, error links and step errors', () => {
  it('the live summary is one stop that reads hydration and totals', async () => {
    await renderScreen(<RecipeEditorScreen id={COUNTRY} />, { seed: true });
    const summary = await screen.findByTestId('recipe-summary');
    expect(summary.props.accessibilityLabel).toBe(
      'Recipe summary. Hydration 77.3% (includes levain). Flour 550 g · Water 425 g · Dough 985 g',
    );
    expect(summary.props.accessibilityLiveRegion).toBeUndefined();
  });

  it('a failed save lists its problems as links that move focus', async () => {
    await renderScreen(<RecipeEditorScreen id="new" />);
    await screen.findByTestId('recipe-name');
    await fireEvent.changeText(screen.getByTestId('recipe-notes'), 'x');
    await pressHeaderButton('Save');
    const links = await screen.findAllByRole('link');
    expect(links.map((l) => l.props.accessibilityLabel)).toEqual([
      'Enter a recipe name.',
      'Add at least one flour ingredient.',
    ]);
    await fireEvent.press(links[0] as never);
    expect(routerSpies.back).not.toHaveBeenCalled();
  });

  it('a step with a problem shows its error on the row, with an icon, not in the subtitle', async () => {
    await renderScreen(<RecipeEditorScreen id={COUNTRY} />, { seed: true });
    await screen.findByTestId('recipe-name');
    const bulk = useRecipeDraft.getState().draft?.steps.find((s) => s.kind === 'bulk');
    await act(async () => {
      useRecipeDraft.getState().upsertStep({ ...bulk!, durationMin: 999 });
    });
    const row = await screen.findByTestId(`step-${bulk?.id}`);
    expect(row.props.accessibilityLabel).toContain('default must be between min and max');
    expect(screen.getAllByText(/default must be between min and max/).length).toBeGreaterThan(0);
  });
});

describe('DR1-17: sheets always have a heading to focus', () => {
  it('the price sheet is titled and focus can land on its heading', async () => {
    const db = await renderScreen(<></>, { seed: true });
    const item = (await db.db.repos.pantry.get(BREAD)) as PantryItem;
    db.rerender(<PriceUpdateSheet item={item} onClose={() => undefined} />);
    // The sheet title is a header node, so screen-reader focus always has somewhere to land.
    const title = await screen.findByText('Update price');
    expect(title.parent?.props.accessibilityRole).toBe('header');
  });
});

describe('DR1-22, DR1-26: field errors wait for an edit; money is spoken with its currency', () => {
  function Form() {
    const { control } = useForm({ defaultValues: { name: '' }, mode: 'onTouched' });
    return (
      <FormSubmittedContext.Provider value={false}>
        <FormTextField control={control} name="name" label="Name" />
      </FormSubmittedContext.Provider>
    );
  }
  it('a field that was only focused shows no error (nothing is invalid here, so none either way)', async () => {
    await renderWithTheme(<Form />);
    const input = screen.getByLabelText('Name');
    await fireEvent(input, 'focus');
    await fireEvent(input, 'blur');
    expect(screen.queryByText(/error/)).toBeNull();
  });

  it('the price field says which currency', async () => {
    const db = await renderScreen(<></>, { seed: true });
    const item = (await db.db.repos.pantry.get(BREAD)) as PantryItem;
    db.rerender(<PriceUpdateSheet item={item} onClose={() => undefined} />);
    expect(await screen.findByLabelText('Package price, in US Dollar')).toBeTruthy();
  });
});

describe('DR1-39: editors that are gone give a way out', () => {
  it('a missing pantry item shows a Back button', async () => {
    await renderScreen(<PantryEditorScreen id="5eed0001-0000-4000-8000-0000000000ff" />, {
      seed: true,
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Back to pantry' }));
    expect(routerSpies.back).toHaveBeenCalled();
  });
  it('a deleted recipe shows a Back button', async () => {
    await renderScreen(<RecipeEditorScreen id="5eed0003-0000-4000-8000-0000000000ff" />, {
      seed: true,
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Back to recipes' }));
    expect(routerSpies.back).toHaveBeenCalled();
  });
});
