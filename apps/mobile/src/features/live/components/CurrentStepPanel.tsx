import { View } from 'react-native';
import { Button, Icon, StatusTag, Text } from '../../../ui/components';
import { useTheme } from '../../../ui/theme';
import { t } from '../../../lib/i18n';
import { CountdownText } from './CountdownText';
import { LetterBadge } from '../../schedule/components/LetterBadge';
import type { ItemLive } from '../derive';
import type { PanelModel } from '../panel';

export interface CurrentStepPanelProps {
  model: PanelModel;
  item: ItemLive;
  /** Two or more panels: smaller type, and the recipe above the step name (screens-bake.md 8.3). */
  compact: boolean;
  /** Show the letter badge and recipe name. */
  showRecipe: boolean;
  /** A notification or link pointed at this panel's step. */
  highlighted?: boolean;
  locale: string;
  onFinishedEarlier?: () => void;
}

/** The glanceable core of the live view (components.md 3.19): one accessibility element. */
export function CurrentStepPanel({
  model,
  item,
  compact,
  showRecipe,
  highlighted = false,
  locale,
  onFinishedEarlier,
}: CurrentStepPanelProps) {
  const { color, space, radius, size } = useTheme();
  const textColor = model.overtime ? 'textOnWarningContainer' : 'textOnAccentContainer';
  const container = model.ready
    ? color.successContainer
    : model.overtime
      ? color.warningContainer
      : color.accentContainer;
  const onContainer = model.ready ? 'textOnSuccessContainer' : textColor;
  const border = model.overtime ? color.warning : highlighted ? color.focusRing : 'transparent';

  return (
    <View style={{ gap: space.sm }}>
      <View
        testID={`panel-${item.itemId}`}
        accessible
        accessibilityLabel={model.a11yLabel}
        style={{
          backgroundColor: container,
          borderRadius: radius.lg,
          padding: space.xl,
          gap: space.sm,
          borderWidth: model.overtime || highlighted ? size.focusRingWidth : 0,
          borderColor: border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon
            name={model.captionIcon}
            size={size.iconSm}
            color={model.ready ? 'success' : onContainer}
          />
          <Text variant="caption" color={onContainer} style={{ flexShrink: 1 }}>
            {model.caption}
          </Text>
          <View style={{ flex: 1 }} />
          {model.ready ? null : (
            <Text variant="caption" color={onContainer}>
              {model.stepOf}
            </Text>
          )}
        </View>
        {showRecipe ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <LetterBadge letter={item.letter} index={item.index} />
            <Text variant="subhead" color={onContainer} style={{ flexShrink: 1 }}>
              {item.name}
            </Text>
          </View>
        ) : null}
        <Text variant={compact ? 'title2' : 'title1'} color={onContainer}>
          {model.stepName}
        </Text>
        {model.countdown ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            {model.overtime ? <Icon name="alarm" size={size.iconLg} color={textColor} /> : null}
            <CountdownText
              testID={`countdown-${item.itemId}`}
              model={model}
              locale={locale}
              compact={compact}
              color={textColor}
            />
          </View>
        ) : null}
        {model.sub ? <Text color={onContainer}>{model.sub}</Text> : null}
        {model.tags.length > 0 ? (
          <View style={{ gap: space.xs, marginTop: space.xs }}>
            {model.tags.map((tag) => (
              <StatusTag key={tag.id} text={tag.text} icon={tag.icon} tone={tag.tone} />
            ))}
          </View>
        ) : null}
      </View>
      {model.offerFinishedAt && onFinishedEarlier ? (
        <Button
          variant="text"
          size="lg"
          label={t('live.finishedEarlier')}
          onPress={onFinishedEarlier}
          testID={`finished-earlier-${item.itemId}`}
        />
      ) : null}
    </View>
  );
}
