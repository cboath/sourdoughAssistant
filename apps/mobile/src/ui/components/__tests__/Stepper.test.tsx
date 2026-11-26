import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { renderWithTheme } from '../../testing';
import { Stepper } from '../Stepper';

function Harness({ initial = 2, max = 4 }: { initial?: number; max?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <Stepper
      label="Loaves"
      value={value}
      onChange={setValue}
      min={1}
      max={max}
      formatValue={(v) => `${v} loaves`}
    />
  );
}

describe('Stepper', () => {
  it('is one adjustable element with a value', async () => {
    await renderWithTheme(<Harness />);
    const el = screen.getByRole('adjustable', { name: 'Loaves' });
    expect(el.props.accessibilityValue).toEqual({ min: 1, max: 4, now: 2, text: '2 loaves' });
  });

  it('responds to increment and decrement accessibility actions and clamps', async () => {
    await renderWithTheme(<Harness initial={4} />);
    const el = screen.getByRole('adjustable', { name: 'Loaves' });
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByRole('adjustable').props.accessibilityValue.now).toBe(4);
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(screen.getByRole('adjustable').props.accessibilityValue.now).toBe(3);
  });
});
