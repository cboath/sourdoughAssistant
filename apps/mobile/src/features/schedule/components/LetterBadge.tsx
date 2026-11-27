import { View, useWindowDimensions } from 'react-native';
import { Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';

const SERIES = ['seriesA', 'seriesB', 'seriesC', 'seriesD'] as const;

/** Recipe letter (A to D) in its series color. Decorative: the recipe name always sits beside it. */
export function LetterBadge({ letter, index }: { letter: string; index: number }) {
  const { color, size, isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  // The letter is capped at 1.3x and the circle grows with it, so it never clips (DR2-23).
  const dim = Math.round(size.badge * Math.min(Math.max(fontScale, 1), 1.3));
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        backgroundColor: color[SERIES[index] ?? 'seriesA'],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant="caption"
        maxFontSizeMultiplier={1.3}
        style={{ fontWeight: '700' }}
        color={isDark ? 'background' : 'textOnAccent'}
      >
        {letter}
      </Text>
    </View>
  );
}
