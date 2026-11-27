import { fireEvent, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import type { Unit } from '../../../db/types';
import { renderWithTheme } from '../../testing';
import { AmountField } from '../AmountField';
import { DateTimeField } from '../DateTimeField';
import { DurationField } from '../DurationField';
import { MoneyText, QuantityText, formatPerUnitMoney } from '../formatting';
import { RangeField, isRangeValid, type DurationRange } from '../RangeField';

describe('DurationField', () => {
  it('splits minutes into hours and minutes and recombines on edit', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<DurationField label="Duration" valueMin={390} onChange={onChange} />);
    expect(screen.getByLabelText('Duration, hours').props.value).toBe('6');
    expect(screen.getByLabelText('Duration, minutes').props.value).toBe('30');
    await fireEvent.changeText(screen.getByLabelText('Duration, hours'), '7');
    expect(onChange).toHaveBeenCalledWith(450);
    await fireEvent.changeText(screen.getByLabelText('Duration, minutes'), '15');
    expect(onChange).toHaveBeenLastCalledWith(435);
  });
});

describe('DurationField normalizes on blur', () => {
  it('lets "90" be typed in minutes, and normalizes to 1 h 30 min when the field is left', async () => {
    const onChange = jest.fn();
    await renderWithTheme(<DurationField label="Duration" valueMin={0} onChange={onChange} />);
    const minutes = screen.getByLabelText('Duration, minutes');
    await fireEvent.changeText(minutes, '90');
    expect(onChange).toHaveBeenLastCalledWith(90);
    expect(minutes.props.value).toBe('90');
    await fireEvent(minutes, 'blur');
    expect(screen.getByLabelText('Duration, hours').props.value).toBe('1');
    expect(screen.getByLabelText('Duration, minutes').props.value).toBe('30');
  });

  it('lets a field be emptied while typing', async () => {
    await renderWithTheme(
      <DurationField label="Duration" valueMin={30} onChange={() => undefined} />,
    );
    const minutes = screen.getByLabelText('Duration, minutes');
    await fireEvent.changeText(minutes, '');
    expect(screen.getByLabelText('Duration, minutes').props.value).toBe('');
  });
});

describe('RangeField', () => {
  it('validates min <= default <= max', () => {
    expect(isRangeValid({ minMin: 60, defaultMin: 90, maxMin: 120 })).toBe(true);
    expect(isRangeValid({ minMin: 60, defaultMin: 30, maxMin: 120 })).toBe(false);
    expect(isRangeValid({ minMin: 60, defaultMin: 130, maxMin: 120 })).toBe(false);
  });

  it('shows an inline error when the default is out of range', async () => {
    const range: DurationRange = { minMin: 300, defaultMin: 100, maxMin: 480 };
    await renderWithTheme(
      <RangeField label="Bulk" range={range} defaultMin={100} onChange={() => undefined} />,
    );
    expect(screen.getByText('Default must be between min and max.')).toBeTruthy();
  });

  it('"No range" hides min and max', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <RangeField label="Bulk" range={null} defaultMin={360} onChange={onChange} />,
    );
    expect(screen.queryByText('Minimum', { exact: false })).toBeNull();
    await fireEvent.press(screen.getByRole('switch', { name: 'No range' }));
    expect(onChange).toHaveBeenCalledWith({
      range: { minMin: 360, defaultMin: 360, maxMin: 360 },
      defaultMin: 360,
    });
  });
});

describe('AmountField + UnitPicker', () => {
  function Harness({ units }: { units?: readonly Unit[] }) {
    const [unit, setUnit] = useState<Unit>('g');
    const [value, setValue] = useState('450');
    return (
      <AmountField
        label="Amount"
        value={value}
        onChangeValue={setValue}
        unit={unit}
        onChangeUnit={setUnit}
        units={units}
      />
    );
  }

  it('opens a grouped unit picker and selects a unit', async () => {
    await renderWithTheme(<Harness />);
    await fireEvent.press(screen.getByRole('button', { name: 'Unit, grams' }));
    expect(screen.getByText('Weight')).toBeTruthy();
    expect(screen.getByText('Volume')).toBeTruthy();
    expect(screen.getByText('Count')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('unit-cup'));
    expect(screen.getByRole('button', { name: 'Unit, cups' })).toBeTruthy();
  });

  it('can restrict the offered units', async () => {
    await renderWithTheme(<Harness units={['g', 'kg']} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Unit, grams' }));
    expect(screen.queryByText('Volume')).toBeNull();
    expect(within(screen.getByTestId('unit-kg')).getByText(/kg/)).toBeTruthy();
  });
});

describe('DateTimeField (date-only)', () => {
  const pick = (date: Date) =>
    fireEvent(
      screen.getByTestId('date-picker'),
      'valueChange',
      { nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } },
      date,
    );

  it('shows a locale date, and the native picker commits the chosen date on Done', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <DateTimeField
        label="Date priced"
        value="2026-11-26"
        maxDate="2026-11-26"
        onChange={onChange}
      />,
    );
    const field = screen.getByRole('button', { name: /Date priced, / });
    expect(field.props.accessibilityLabel).toContain('Nov 26, 2026');
    await fireEvent.press(field);
    await pick(new Date(2026, 10, 25));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-25');
  });

  it('cannot go past maxDate', async () => {
    const onChange = jest.fn();
    await renderWithTheme(
      <DateTimeField
        label="Date priced"
        value="2026-11-26"
        maxDate="2026-11-26"
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: /Date priced, / }));
    await pick(new Date(2026, 11, 30));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-26');
  });
});

describe('formatting components', () => {
  it('MoneyText formats minor units and keeps the symbol in the label', async () => {
    await renderWithTheme(<MoneyText cents={139} currency="USD" locale="en-US" />);
    expect(screen.getByLabelText('$1.39')).toBeTruthy();
  });

  it('per-unit money shows up to 4 decimals', () => {
    expect(formatPerUnitMoney(0.24, 'USD', 'en-US', 'g')).toBe('$0.0024 per g');
    expect(formatPerUnitMoney(139, 'USD', 'en-US', 'loaf')).toBe('$1.39 per loaf');
  });

  it('QuantityText shows grams first', async () => {
    await renderWithTheme(<QuantityText grams={450} unitSystem="metric" locale="en-US" />);
    expect(screen.getByText('450 g')).toBeTruthy();
  });
});
