import { View } from 'react-native';
import type { Unit } from '../../db/types';
import { t, type MessageKey } from '../../lib/i18n';
import { ListRow } from './ListRow';
import { SectionHeader } from './SectionHeader';
import { Sheet } from './Sheet';

export const UNIT_GROUPS: ReadonlyArray<{ key: MessageKey; units: readonly Unit[] }> = [
  { key: 'unit.group.weight', units: ['g', 'kg', 'oz', 'lb'] },
  { key: 'unit.group.volume', units: ['ml', 'l', 'tsp', 'tbsp', 'cup', 'floz', 'qt', 'gal'] },
  { key: 'unit.group.count', units: ['each'] },
];

/** Short display form of a unit ("fl oz", not "floz"). */
export const UNIT_SHORT: Record<Unit, string> = {
  g: 'g',
  kg: 'kg',
  oz: 'oz',
  lb: 'lb',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'cup',
  floz: 'fl oz',
  qt: 'qt',
  gal: 'gal',
  each: 'each',
};
export const unitShort = (unit: Unit): string => UNIT_SHORT[unit];

export const unitName = (unit: Unit): string => t(`unit.${unit}` as MessageKey);

export interface UnitPickerProps {
  visible: boolean;
  value: Unit;
  onSelect: (unit: Unit) => void;
  onClose: () => void;
  /** Restrict the offered units (for example weight only for package size). Default: all. */
  units?: readonly Unit[];
}

/** Sheet listing units under Weight / Volume / Count headers. */
export function UnitPicker({ visible, value, onSelect, onClose, units }: UnitPickerProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={t('amount.pickUnit')}>
      <View accessibilityRole="radiogroup">
        {UNIT_GROUPS.map((group) => {
          const offered = group.units.filter((u) => !units || units.includes(u));
          if (offered.length === 0) return null;
          return (
            <View key={group.key}>
              <SectionHeader title={t(group.key)} />
              {offered.map((unit) => (
                <ListRow
                  key={unit}
                  variant="selectable"
                  selectionMode="single"
                  title={`${unitShort(unit)} · ${unitName(unit)}`}
                  checked={unit === value}
                  onPress={() => {
                    onSelect(unit);
                    onClose();
                  }}
                  testID={`unit-${unit}`}
                />
              ))}
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
