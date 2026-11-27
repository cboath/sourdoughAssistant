import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { Chip } from '../Chip';
import { ListRow } from '../ListRow';

describe('ListRow', () => {
  it('is one focus stop with a combined label', async () => {
    const onPress = jest.fn();
    await renderWithTheme(
      <ListRow title="Bread flour" subtitle="Flour" value="$0.89/lb" onPress={onPress} />,
    );
    const row = screen.getByRole('button', { name: 'Bread flour, Flour, $0.89/lb' });
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('toggle rows are switches and toggle on press', async () => {
    const onCheckedChange = jest.fn();
    await renderWithTheme(
      <ListRow
        variant="toggle"
        title="Quiet hours"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const row = screen.getByRole('switch', { name: 'Quiet hours' });
    expect(row).not.toBeChecked();
    await fireEvent.press(row);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('selectable rows are checkboxes', async () => {
    await renderWithTheme(
      <ListRow variant="selectable" title="Rye" checked onPress={() => undefined} />,
    );
    expect(screen.getByRole('checkbox', { name: 'Rye' })).toBeChecked();
  });

  it('a disabled row does not fire', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<ListRow title="Locked" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Locked'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Chip', () => {
  it('filter chips are checkboxes with checked state', async () => {
    const onPress = jest.fn();
    await renderWithTheme(<Chip label="Favorites" selected onPress={onPress} />);
    const chip = screen.getByRole('checkbox', { name: 'Favorites' });
    expect(chip).toBeChecked();
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
  });

  it('input chips expose a separate remove button', async () => {
    const onRemove = jest.fn();
    await renderWithTheme(
      <Chip variant="input" label="Rye" onPress={() => undefined} onRemove={onRemove} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Remove tag Rye' }));
    expect(onRemove).toHaveBeenCalled();
  });
});
