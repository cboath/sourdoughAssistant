import { Pressable, View } from 'react-native';
import { t } from '../../../lib/i18n';
import { Icon, StatusTag, Text } from '../../../ui/components';
import { useFocusRing } from '../../../ui/hooks/useFocusRing';
import { useFontScale } from '../../../ui/hooks/useFontScale';
import { useScreenMargin } from '../../../ui/hooks/useScreenMargin';
import { useTheme } from '../../../ui/theme';
import type { TimelineRow } from '../timeline';
import { DurationSlider } from './DurationSlider';
import { LetterBadge } from './LetterBadge';

export interface TimelineRowViewProps {
  row: TimelineRow;
  locale: string;
  highlighted: boolean;
  sliderOpen: boolean;
  onToggleSlider: (stepId: string) => void;
  onToggleFolds: (stepKey: string) => void;
  onSliderChange: (itemId: string, stepId: string, minutes: number) => void;
  onSliderReset: (itemId: string, stepId: string) => void;
}

/** One timeline row: a single accessibility stop with its tags, optional folds and slider. */
export function TimelineRowView(props: TimelineRowViewProps) {
  const { row } = props;
  const { color, space, size, layout, radius } = useTheme();
  const { stacked } = useFontScale();
  const margin = useScreenMargin();
  const focus = useFocusRing();

  const gutter = { paddingLeft: margin.left, paddingRight: margin.right };

  if (row.type === 'day') {
    return (
      <View style={[{ backgroundColor: color.surfaceSunken, paddingVertical: space.sm }, gutter]}>
        <Text variant="subhead" color="textSecondary" heading>
          {row.text}
        </Text>
      </View>
    );
  }

  if (row.type === 'slot') {
    return (
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={row.label}
        style={[
          { paddingTop: space.lg, paddingBottom: space.xs, flexDirection: 'row', gap: space.sm },
          gutter,
        ]}
      >
        <Icon name="oven" size={size.iconSm} color="textSecondary" />
        <Text variant="subhead" color="textSecondary" style={{ flexShrink: 1 }}>
          {row.text}
        </Text>
      </View>
    );
  }

  const timeColumn = (text: string, bold = false) => (
    <Text
      variant="subhead"
      numeric
      color={bold ? 'textPrimary' : 'textSecondary'}
      style={stacked ? undefined : { width: layout.timelineTimeColumn - space.sm }}
    >
      {text}
    </Text>
  );

  const marker = (kind: 'hollow' | 'success' | 'sub') => (
    <View
      accessible={false}
      style={{
        width: kind === 'sub' ? size.iconSm / 2 : size.iconSm * 0.7,
        height: kind === 'sub' ? size.iconSm / 2 : size.iconSm * 0.7,
        borderRadius: radius.full,
        borderWidth: 2,
        borderColor: kind === 'success' ? color.success : color.accent,
        backgroundColor: kind === 'success' ? color.success : color.surface,
        marginTop: space.xs,
      }}
    />
  );

  if (row.type === 'final') {
    return (
      <View
        accessible
        accessibilityLabel={row.label}
        style={[
          { flexDirection: stacked ? 'column' : 'row', gap: space.sm, paddingVertical: space.md },
          gutter,
        ]}
      >
        {timeColumn(row.time, true)}
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          {marker('success')}
          <Text variant="headline" style={{ fontWeight: '700' }}>
            {t('plan.readyToEat')}
          </Text>
        </View>
      </View>
    );
  }

  if (row.type === 'fold') {
    return (
      <View
        accessible
        accessibilityLabel={row.label}
        style={[
          { paddingVertical: space.xs, paddingLeft: margin.left + space.xl, gap: space.xs },
          { paddingRight: margin.right },
        ]}
      >
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          {marker('sub')}
          <Text variant="subhead" color="textSecondary" numeric>
            {row.text}
          </Text>
        </View>
        {row.tags.map((tag) => (
          <StatusTag key={tag.id} text={tag.text} icon={tag.icon} tone={tag.tone} />
        ))}
      </View>
    );
  }

  const step = row;
  const slider = step.slider;
  return (
    <View
      testID={`timeline-row-${step.id}`}
      style={[
        {
          paddingVertical: space.md,
          paddingLeft: margin.left + (step.alongside ? space.xl : 0),
          paddingRight: margin.right,
          backgroundColor: props.highlighted ? color.accentContainer : 'transparent',
        },
      ]}
    >
      <View
        accessible
        accessibilityLabel={step.label}
        accessibilityActions={[
          ...(slider ? [{ name: 'change', label: t('plan.change.action') }] : []),
          ...(step.foldCount > 0
            ? [
                {
                  name: 'folds',
                  label: t(step.foldsExpanded ? 'plan.hideFolds' : 'plan.showFolds'),
                },
              ]
            : []),
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'change' && slider) props.onToggleSlider(step.id);
          if (e.nativeEvent.actionName === 'folds') props.onToggleFolds(step.id);
        }}
        accessibilityState={slider ? { expanded: props.sliderOpen } : undefined}
        style={{ flexDirection: stacked ? 'column' : 'row', gap: space.sm }}
      >
        {timeColumn(step.time)}
        <View style={{ flex: 1, flexDirection: 'row', gap: space.sm }}>
          {step.alongside ? (
            <Icon name="parallel" size={size.iconSm} color="textSecondary" />
          ) : (
            marker('hollow')
          )}
          <View style={{ flex: 1, gap: space.xs }}>
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              {step.letter ? <LetterBadge letter={step.letter} index={step.itemIndex} /> : null}
              {step.ovenIcon ? <Icon name="oven" size={size.iconSm} color="textSecondary" /> : null}
              <Text variant="headline" numberOfLines={2} style={{ flexShrink: 1 }}>
                {step.name}
              </Text>
            </View>
            {step.prefix ? (
              <Text variant="subhead" color="textSecondary">
                {step.prefix}
              </Text>
            ) : null}
            <Text variant="subhead" color="textSecondary">
              {step.meta}
            </Text>
            {step.tags.map((tag) => (
              <StatusTag key={tag.id} text={tag.text} icon={tag.icon} tone={tag.tone} />
            ))}
            {slider?.overridesTemp ? (
              <Text variant="footnote" color="textSecondary">
                {t('plan.slider.overridesTemp')}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          paddingLeft: stacked ? 0 : layout.timelineTimeColumn,
        }}
      >
        {slider ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('plan.change')}, ${step.name}`}
            accessibilityState={{ expanded: props.sliderOpen }}
            onPress={() => props.onToggleSlider(step.id)}
            hitSlop={space.sm}
            {...focus.handlers}
            style={[
              { minHeight: size.touchKitchen, justifyContent: 'center', paddingRight: space.lg },
              focus.style,
            ]}
            testID={`change-${step.id}`}
          >
            <Text variant="callout" color="accent">
              {props.sliderOpen ? t('plan.slider.close') : t('plan.change')}
            </Text>
          </Pressable>
        ) : null}
        {step.foldCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(step.foldsExpanded ? 'plan.hideFolds' : 'plan.showFolds')}
            accessibilityState={{ expanded: step.foldsExpanded }}
            onPress={() => props.onToggleFolds(step.id)}
            hitSlop={space.sm}
            {...focus.handlers}
            style={[{ minHeight: size.touchKitchen, justifyContent: 'center' }, focus.style]}
            testID={`folds-${step.id}`}
          >
            <Text variant="callout" color="accent">
              {t(step.foldsExpanded ? 'plan.hideFolds' : 'plan.showFolds')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {slider && props.sliderOpen ? (
        <View style={{ paddingLeft: stacked ? 0 : layout.timelineTimeColumn }}>
          <DurationSlider
            model={slider}
            stepName={step.name}
            locale={props.locale}
            onChange={(minutes) => props.onSliderChange(slider.itemId, slider.stepId, minutes)}
            onReset={() => props.onSliderReset(slider.itemId, slider.stepId)}
          />
        </View>
      ) : null}
    </View>
  );
}
