import { fireEvent, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { renderWithTheme } from '../../testing';
import { SearchField } from '../SearchField';
import { TextField, type TextFieldRef } from '../TextField';

describe('TextField', () => {
  it('binds the label to the input and reports changes', async () => {
    const onChangeText = jest.fn();
    await renderWithTheme(<TextField label="Name" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Rye');
    expect(onChangeText).toHaveBeenCalledWith('Rye');
  });

  it('appends the error to the accessibility label and shows it', async () => {
    await renderWithTheme(
      <TextField
        label="Package size"
        value="0"
        onChangeText={() => undefined}
        error="Enter a size above 0"
      />,
    );
    expect(screen.getByLabelText('Package size, error: Enter a size above 0')).toBeTruthy();
    expect(screen.getByText('Enter a size above 0')).toBeTruthy();
  });

  it('uses the decimal keyboard for number and money', async () => {
    await renderWithTheme(
      <TextField
        label="Price"
        variant="money"
        prefix="$"
        value=""
        onChangeText={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Price').props.keyboardType).toBe('decimal-pad');
  });

  it('forwards the ref so a screen can focus the first error', async () => {
    const ref = createRef<TextFieldRef>();
    await renderWithTheme(
      <TextField ref={ref} label="Name" value="" onChangeText={() => undefined} />,
    );
    expect(ref.current).not.toBeNull();
  });

  it('read-only shows the value without an input', async () => {
    await renderWithTheme(
      <TextField label="Unit" readOnly value="g" onChangeText={() => undefined} />,
    );
    expect(screen.queryByLabelText('Unit')).toBeNull();
    expect(screen.getByLabelText('Unit, g')).toBeTruthy();
  });
});

describe('SearchField', () => {
  it('has the search role, and a clear button once there is text', async () => {
    const onChangeText = jest.fn();
    await renderWithTheme(
      <SearchField accessibilityLabel="Search recipes" value="rye" onChangeText={onChangeText} />,
    );
    expect(screen.getByRole('search')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChangeText).toHaveBeenCalledWith('');
  });
});
