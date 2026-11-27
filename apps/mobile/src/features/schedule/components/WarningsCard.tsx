import { Pressable, View } from 'react-native';
import { t } from '../../../lib/i18n';
import { Icon, Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import type { WarningLine } from '../timeline';

const TONE_FG = {
  info: 'textOnInfoContainer',
  warning: 'textOnWarningContainer',
  neutral: 'textPrimary',
  success: 'textOnSuccessContainer',
  danger: 'textOnDangerContainer',
} as const;

/** "Worth a look": one tappable line per non-blocking warning type (screens-bake.md 3.5 B). */
export function WarningsCard({
  lines,
  onSelect,
}: {
  lines: readonly WarningLine[];
  onSelect: (line: WarningLine) => void;
}) {
  const { color, space, radius, size } = useTheme();
  if (lines.length === 0) return null;
  return (
    <View
      testID="warnings-card"
      style={{
        backgroundColor: color.surfaceSunken,
        borderRadius: radius.md,
        padding: space.lg,
        gap: space.xs,
      }}
    >
      <Text variant="headline" heading>
        {t('plan.warn.title')}
      </Text>
      {lines.map((line) => (
        <Pressable
          key={line.id}
          testID={`warning-${line.id}`}
          accessibilityRole="button"
          accessibilityLabel={[line.text, line.hint].filter(Boolean).join(' ')}
          accessibilityHint={t('plan.warn.hint')}
          onPress={() => onSelect(line)}
          style={{
            minHeight: size.touchMin,
            flexDirection: 'row',
            gap: space.sm,
            alignItems: 'flex-start',
            paddingVertical: space.sm,
          }}
        >
          <Icon name={line.icon} size={size.iconSm} color={TONE_FG[line.tone]} />
          <View style={{ flex: 1 }}>
            <Text variant="callout">{line.text}</Text>
            {line.hint ? (
              <Text variant="footnote" color="textSecondary">
                {line.hint}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
