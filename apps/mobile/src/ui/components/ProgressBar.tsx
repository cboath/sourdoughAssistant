import { View } from 'react-native';
import { useTheme } from '../theme';

export interface ProgressBarProps {
  /** 0 to 1. */
  value: number;
  /** "45 percent through the bake": the percentage is spoken, never drawn. */
  accessibilityLabel: string;
  /** Inside a card that is already one stop: hidden from screen readers (DR2-22). */
  decorative?: boolean;
  testID?: string;
}

/** Whole-bake progress on cards (components.md 3.29): `accent` fill on a `surfaceSunken` track. */
export function ProgressBar({
  value,
  accessibilityLabel,
  decorative = false,
  testID,
}: ProgressBarProps) {
  const { color, size, radius } = useTheme();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <View
      testID={testID}
      accessible={!decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{
        height: size.progressStroke,
        borderRadius: radius.full,
        backgroundColor: color.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: radius.full,
          backgroundColor: color.accent,
        }}
      />
    </View>
  );
}
