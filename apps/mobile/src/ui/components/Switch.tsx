import { Switch as RNSwitch } from 'react-native';
import { useTheme } from '../theme';

export interface SwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Required. Prefer a toggle `ListRow`, which makes the whole row the target. */
  accessibilityLabel: string;
  disabled?: boolean;
}

export function Switch({ value, onValueChange, accessibilityLabel, disabled }: SwitchProps) {
  const { color } = useTheme();
  return (
    <RNSwitch
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ true: color.accent, false: color.borderStrong }}
      thumbColor={color.surface}
    />
  );
}
