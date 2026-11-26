import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { Button } from '../Button';
import { IconButton } from '../IconButton';

describe('Button', () => {
  it('exposes role, label and calls onPress', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Save" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is not pressable and reports disabled state when disabled', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <Button
        label="Schedule bake"
        onPress={onPress}
        disabled
        accessibilityHint="Pick a ready time first"
      />,
    );
    const button = screen.getByRole('button', { name: 'Schedule bake' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(button.props.accessibilityHint).toBe('Pick a ready time first');
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is busy and ignores presses while loading, with the spinner delayed', async () => {
    jest.useFakeTimers();
    const onPress = jest.fn();
    await renderWithTheme(<Button label="Save" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.queryByRole('progressbar')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('keeps at least the touch target height per size tier', async () => {
    await renderWithTheme(
      <Button label="Done, start Shape" size="hero" fullWidth onPress={() => undefined} />,
    );
    const style = screen.getByRole('button').props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(2).filter(Boolean)) : style;
    expect(flat.minHeight).toBe(72);
  });
});

describe('IconButton', () => {
  it('requires and exposes a label', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <IconButton icon="more" accessibilityLabel="More options" onPress={onPress} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'More options' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('is a switch with checked state in toggle mode', async () => {
    await renderWithTheme(
      <IconButton
        icon="timer"
        variant="toggle"
        selected
        accessibilityLabel="Keep screen on"
        onPress={() => undefined}
      />,
    );
    expect(screen.getByRole('switch', { name: 'Keep screen on' })).toBeChecked();
  });
});
