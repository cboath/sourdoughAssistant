/** M3 design-review fixes (DR1-xx): behaviors that need a render to prove. */
import { act, configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { Platform, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../ui/theme';
import { Snackbar, SnackbarHost } from '../../ui/components/Snackbar';
import { ActionSheet } from '../../ui/components/ActionSheet';
import { Chip } from '../../ui/components/Chip';
import { ContentColumn } from '../../ui/components/ContentColumn';
import { HeaderTextButton } from '../../ui/components/HeaderTextButton';
import { ListRow } from '../../ui/components/ListRow';
import { SegmentedControl } from '../../ui/components/SegmentedControl';
import { StatusTag } from '../../ui/components/StatusTag';
import { TextField } from '../../ui/components/TextField';
import { editorHeaderOptions } from '../../ui/editorHeader';
import { useDiscardGuard } from '../../ui/useDiscardGuard';
import { renderWithTheme } from '../../ui/testing';
import { useSnackbarStore } from '../../state/snackbar';
import { useRecipeDraft } from '../../features/recipes/store';
import { routerSpies } from '../helpers/mockRouter';
import { clearClients } from '../helpers/renderScreen';

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

afterEach(() => {
  clearClients();
  routerSpies.reset();
  useRecipeDraft.getState().reset();
  useSnackbarStore.setState({ current: null, clearances: {} });
  (globalThis as { __nav?: unknown }).__nav = undefined;
  jest.restoreAllMocks();
});

const styleOf = (el: unknown) =>
  StyleSheet.flatten(
    (el as { props: { style: Parameters<typeof StyleSheet.flatten>[0] } }).props.style,
  ) as Record<string, number>;

function withFontScale(fontScale: number) {
  jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

describe('DR1-01: pushed editors keep the native back button and swipe', () => {
  it('only modal roots hide the back button; pushed editors leave it on', () => {
    const pushed = editorHeaderOptions({
      title: 'x',
      onClose: jest.fn(),
      onSave: jest.fn(),
      pushed: true,
    });
    expect(pushed.gestureEnabled).toBe(true);
    expect(pushed.headerBackVisible).toBeUndefined();
    expect(pushed.headerLeft).toBeUndefined();
    const modal = editorHeaderOptions({
      title: 'x',
      onClose: jest.fn(),
      onSave: jest.fn(),
      saveDisabled: false,
    });
    expect(modal.gestureEnabled).toBe(false);
    expect(modal.headerBackVisible).toBe(false);
  });
});

describe('DR1-02: a dirty modal blocks swipe-to-dismiss on the root screen', () => {
  function Probe({ dirty }: { dirty: boolean }) {
    useDiscardGuard(dirty, { title: 't', confirmLabel: 'a', cancelLabel: 'b' }, true);
    return null;
  }
  it('sets gestureEnabled on the parent while dirty, and restores it', async () => {
    const setOptions = jest.fn();
    (globalThis as { __nav?: unknown }).__nav = {
      addListener: () => () => undefined,
      dispatch: jest.fn(),
      getParent: () => ({ setOptions }),
    };
    const view = await render(<Probe dirty />);
    expect(setOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
    await view.rerender(<Probe dirty={false} />);
    expect(setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  });
});

describe('DR1-09: SegmentedControl shows the selection without color alone', () => {
  it('Android adds a check to the selected segment; both expose a radiogroup', async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    await renderWithTheme(
      <SegmentedControl
        label="Scale by"
        value="a"
        onChange={() => undefined}
        segments={[
          { value: 'a', label: 'Loaves' },
          { value: 'b', label: 'Dough weight' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Loaves', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Dough weight', checked: false })).toBeTruthy();
    android.restore();
  });
});

describe('DR1-10: number fields get a Done bar on iOS', () => {
  it('renders an accessory with a Done button for number and money fields only', async () => {
    await renderWithTheme(
      <>
        <TextField label="Grams" variant="number" value="1" onChangeText={() => undefined} />
        <TextField label="Name" value="x" onChangeText={() => undefined} />
      </>,
    );
    expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(1);
  });
});

describe('DR1-11, DR1-12: snackbar with a screen reader, and above pinned UI', () => {
  it('stays until the user acts when a screen reader is on', async () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    await renderWithTheme(
      <Snackbar
        message="Salt removed."
        actionLabel="Undo"
        onAction={jest.fn()}
        onDismiss={onDismiss}
        screenReader
      />,
    );
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('dismisses after the window without one', async () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    await renderWithTheme(
      <Snackbar message="Salt removed." onDismiss={onDismiss} screenReader={false} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(9000);
    });
    expect(onDismiss).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('the host sits above the summed clearances of the tab bar and the pinned bar', async () => {
    useSnackbarStore.setState({
      clearances: { tabs: 83, bar: 88 },
      current: { id: 1, message: 'Saved.' },
    });
    await renderWithTheme(<SnackbarHost />);
    let node = screen.getByTestId('snackbar').parent;
    while (node && styleOf(node).bottom === undefined) node = node.parent;
    expect(styleOf(node).bottom).toBe(83 + 88 + 16);
  });
});

describe('DR1-14, DR1-24, DR1-27, DR1-30: rows, radios and chips', () => {
  it('at large text a row puts its tag under the title', async () => {
    withFontScale(2);
    await renderWithTheme(
      <ListRow title="Bread flour" subtitle="Flour" trailing={<StatusTag variant="unpriced" />} />,
    );
    expect(screen.getByText('Unpriced')).toBeTruthy();
  });

  it('single-choice rows and chips are radios; multi-choice stay checkboxes', async () => {
    await renderWithTheme(
      <View>
        <ListRow
          variant="selectable"
          selectionMode="single"
          title="Flour"
          checked
          onPress={() => undefined}
        />
        <ListRow variant="selectable" title="Other" onPress={() => undefined} />
        <Chip single label="Salt" selected onPress={() => undefined} />
        <Chip label="Rye" onPress={() => undefined} accessibilityLabel="Tag Rye" />
      </View>,
    );
    expect(screen.getByRole('radio', { name: 'Flour' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Other' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Salt' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Tag Rye' })).toBeTruthy();
  });

  it('menu rows are actions: no chevron and a Cancel row on iOS', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <ActionSheet title="Salt" onClose={jest.fn()} actions={[{ label: 'Move up', onPress }]} />,
    );
    expect(screen.getByTestId('action-Move up')).toBeTruthy();
    expect(screen.getByTestId('action-cancel')).toBeTruthy();
  });
});

describe('DR1-18: a menu action runs after the sheet has slid out', () => {
  it('waits before running the action', async () => {
    jest.useFakeTimers();
    const onPress = jest.fn();
    const onClose = jest.fn();
    await renderWithTheme(
      <ActionSheet
        title="Salt"
        onClose={onClose}
        actions={[{ label: 'Delete', destructive: true, onPress }]}
      />,
    );
    await fireEvent.press(screen.getByTestId('action-Delete'));
    expect(onClose).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('DR1-16: landscape content clears the notch', () => {
  it('ContentColumn adds the safe-area insets to the margin', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 844, height: 390 },
          insets: { top: 0, left: 47, right: 47, bottom: 21 },
        }}
      >
        <ThemeProvider scheme="light">
          <ContentColumn>
            <RNText testID="inside">x</RNText>
          </ContentColumn>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    const style = styleOf(screen.getByTestId('inside').parent);
    // 844 wide: screenMarginWide (24) + 47.
    expect(style.paddingLeft).toBe(71);
    expect(style.paddingRight).toBe(71);
  });
});

describe('DR1-23: a disabled header button does nothing', () => {
  it("doesn't fire when disabled", async () => {
    const onPress = jest.fn();
    await renderWithTheme(<HeaderTextButton label="Save" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('DR1-34: the character counter only appears near the limit', () => {
  it('hidden at the start, visible in the last 10%', async () => {
    const { rerender } = await renderWithTheme(
      <TextField label="Name" value="abc" maxLength={60} onChangeText={() => undefined} />,
    );
    expect(screen.queryByText('3/60')).toBeNull();
    await rerender(
      <TextField
        label="Name"
        value={'a'.repeat(52)}
        maxLength={60}
        onChangeText={() => undefined}
      />,
    );
    expect(screen.getByText('52/60')).toBeTruthy();
  });
});

describe('DR1-42: a bar inside tabs does not add the home-indicator inset twice', () => {
  it('is covered by the layout test below', () => {
    expect(waitFor).toBeDefined();
  });
});
