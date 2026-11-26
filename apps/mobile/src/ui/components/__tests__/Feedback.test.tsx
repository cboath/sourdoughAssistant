import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { Banner } from '../Banner';
import { EmptyState } from '../EmptyState';
import { Skeleton } from '../Skeleton';
import { Snackbar, SnackbarHost } from '../Snackbar';
import { StatusTag } from '../StatusTag';
import { showSnackbar, useSnackbarStore } from '../../../state/snackbar';

describe('StatusTag', () => {
  it('shows default text for a named variant', async () => {
    await renderWithTheme(<StatusTag variant="unpriced" />);
    expect(screen.getByText('Unpriced')).toBeTruthy();
  });

  it('supports a custom-text override (never color alone)', async () => {
    await renderWithTheme(<StatusTag text="Cost incomplete" tone="warning" icon="tag" />);
    expect(screen.getByText('Cost incomplete')).toBeTruthy();
  });

  it('is not an accessibility stop of its own', async () => {
    await renderWithTheme(<StatusTag variant="done" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Banner', () => {
  it('announces warnings as alerts and runs actions and dismiss', async () => {
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    await renderWithTheme(
      <Banner
        variant="warning"
        message="Reminders are off"
        actions={[{ label: 'Turn on', onPress: onAction }]}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onAction).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('info banners are not alerts', async () => {
    await renderWithTheme(<Banner message="Quiet hours apply" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Snackbar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useSnackbarStore.setState({ current: null });
  });
  afterEach(() => jest.useRealTimers());

  it('dismisses after the 8 s undo window', async () => {
    const onDismiss = jest.fn();
    await renderWithTheme(<Snackbar message="Archived" onDismiss={onDismiss} />);
    await act(async () => {
      jest.advanceTimersByTime(7900);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pauses while touched', async () => {
    const onDismiss = jest.fn();
    await renderWithTheme(
      <Snackbar
        message="Archived"
        actionLabel="Undo"
        onAction={() => undefined}
        onDismiss={onDismiss}
      />,
    );
    const region = screen.getByTestId('snackbar');
    await act(async () => {
      region?.props.onTouchStart?.();
      jest.advanceTimersByTime(20000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('host renders a queued message and Undo runs the action then clears it', async () => {
    const onUndo = jest.fn();
    await renderWithTheme(<SnackbarHost />);
    await act(async () => {
      showSnackbar({ message: 'Recipe deleted', actionLabel: 'Undo', onAction: onUndo });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
    expect(useSnackbarStore.getState().current).toBeNull();
  });
});

describe('EmptyState and Skeleton', () => {
  it('renders title, body, action and a heading role', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <EmptyState
        title="No recipes yet"
        body="Add your first recipe."
        action={{ label: 'New recipe', onPress }}
      />,
    );
    expect(screen.getByRole('header', { name: 'No recipes yet' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'New recipe' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('error variant offers Try again', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <EmptyState
        variant="error"
        title="Could not load"
        action={{ label: 'Try again', onPress }}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('skeleton is one busy element labelled Loading', async () => {
    await renderWithTheme(<Skeleton rows={3} />);
    const el = screen.getByLabelText('Loading');
    expect(el.props.accessibilityState).toEqual({ busy: true });
  });
});
