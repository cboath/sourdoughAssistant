import { View } from 'react-native';
import { Card, Icon, ProgressBar, StatusTag, Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { t } from '../../../lib/i18n';
import { LetterBadge } from '../../schedule/components/LetterBadge';
import type { CardModel } from '../card';

export interface ActiveBakeCardProps {
  model: CardModel;
  onPress: () => void;
  onLongPress: () => void;
  actions: ReadonlyArray<{ name: string; label: string }>;
  onAction: (name: string) => void;
  testID?: string;
}

/** One bake on the home list: what is happening now, what is next, and when it will be ready. */
export function ActiveBakeCard({
  model,
  onPress,
  onLongPress,
  actions,
  onAction,
  testID,
}: ActiveBakeCardProps) {
  const { color, space, size } = useTheme();
  const overtime = model.variant === 'overtime';
  const multi = model.recipes.length > 1;
  return (
    <Card
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityActions={actions}
      onAccessibilityAction={onAction}
      accessibilityLabel={model.a11yLabel}
      accessibilityHint={t('home.card.hint')}
      style={
        overtime ? { borderWidth: size.focusRingWidth, borderColor: color.warning } : undefined
      }
    >
      <View style={{ gap: space.sm }}>
        <View style={{ gap: space.sm }}>
          {multi && model.recipes.length <= 2 ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: space.sm,
                alignItems: 'center',
              }}
            >
              {model.recipes.map((r) => (
                <View
                  key={r.letter}
                  style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}
                >
                  <LetterBadge letter={r.letter} index={r.index} />
                  <Text variant="title3" numberOfLines={2} style={{ flexShrink: 1 }}>
                    {r.name}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text variant="title3" numberOfLines={2}>
              {model.title}
            </Text>
          )}
          {overtime || model.reminders ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {overtime ? <StatusTag variant="overtime" text={t('home.tag.overtime')} /> : null}
              {model.reminders ? (
                <StatusTag
                  variant="remindersOff"
                  text={t(
                    model.reminders === 'off' ? 'home.tag.remindersOff' : 'home.tag.remindersLate',
                  )}
                />
              ) : null}
            </View>
          ) : null}
        </View>
        {model.variant === 'ready' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="checkCircle" color="success" />
            <Text variant="title3" style={{ flexShrink: 1 }}>
              {model.headline}
            </Text>
          </View>
        ) : (
          <Text variant={model.countdown ? 'headline' : 'title3'}>{model.headline}</Text>
        )}
        {model.countdown ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            {overtime ? <Icon name="alarm" size={size.iconLg} color="warning" /> : null}
            <Text
              variant="timerLarge"
              numeric
              color={overtime ? 'warning' : 'textPrimary'}
              testID={testID ? `${testID}-countdown` : undefined}
              style={{ flexShrink: 1 }}
            >
              {model.countdown}
            </Text>
          </View>
        ) : null}
        {model.lines.map((line, i) => (
          <Text key={`${i}:${line}`} variant="subhead" color="textSecondary">
            {line}
          </Text>
        ))}
        {model.progress !== null && model.progressLabel ? (
          <ProgressBar decorative value={model.progress} accessibilityLabel={model.progressLabel} />
        ) : null}
      </View>
    </Card>
  );
}
