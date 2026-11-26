import { View } from 'react-native';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme/tokens';
import { t, type MessageKey } from '../../lib/i18n';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type StatusTagVariant =
  'quietHours' | 'overtime' | 'unpriced' | 'adjusted' | 'dst' | 'overlap' | 'remindersOff' | 'done';
export type StatusTone = 'info' | 'warning' | 'neutral' | 'success' | 'danger';

const VARIANTS: Record<
  StatusTagVariant,
  { icon: IconName; tone: StatusTone; textKey?: MessageKey }
> = {
  quietHours: { icon: 'moon', tone: 'info', textKey: 'status.quietHours' },
  overtime: { icon: 'alarm', tone: 'warning', textKey: 'status.overtime' },
  unpriced: { icon: 'tag', tone: 'warning', textKey: 'status.unpriced' },
  adjusted: { icon: 'thermometer', tone: 'neutral' },
  dst: { icon: 'clock', tone: 'info' },
  overlap: { icon: 'people', tone: 'neutral' },
  remindersOff: { icon: 'bellOff', tone: 'warning', textKey: 'status.remindersOff' },
  done: { icon: 'check', tone: 'success', textKey: 'status.done' },
};

const TONES: Record<StatusTone, { bg: keyof ColorTokens; fg: keyof ColorTokens }> = {
  info: { bg: 'infoContainer', fg: 'textOnInfoContainer' },
  warning: { bg: 'warningContainer', fg: 'textOnWarningContainer' },
  neutral: { bg: 'surfaceSunken', fg: 'textSecondary' },
  success: { bg: 'successContainer', fg: 'textOnSuccessContainer' },
  danger: { bg: 'dangerContainer', fg: 'textOnDangerContainer' },
};

export interface StatusTagProps {
  /** A named variant from components.md; supplies icon, tone and (for most) default text. */
  variant?: StatusTagVariant;
  /**
   * Text override (screens-recipes.md section 12.1 item 13): "Cost incomplete", "Current",
   * "Can't convert" ... Required for variants without default text and when no variant is given.
   */
  text?: string;
  /** Overrides the variant's tone and icon, for custom-text tags. */
  tone?: StatusTone;
  icon?: IconName;
}

/**
 * Short status label: always an icon plus words plus color (never color alone). Not focusable:
 * the parent row folds `text` into its own accessibility label.
 */
export function StatusTag({ variant, text, tone, icon }: StatusTagProps) {
  const { color, space, radius, size } = useTheme();
  const base = variant ? VARIANTS[variant] : undefined;
  const palette = TONES[tone ?? base?.tone ?? 'neutral'];
  const resolvedIcon = icon ?? base?.icon ?? 'info';
  const resolvedText = text ?? (base?.textKey ? t(base.textKey) : '');
  return (
    <View
      accessible={false}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: space.xs,
        paddingVertical: space.xs,
        paddingHorizontal: space.sm,
        borderRadius: radius.xs,
        backgroundColor: color[palette.bg],
      }}
    >
      <Icon name={resolvedIcon} size={size.iconSm} color={palette.fg} />
      <Text variant="caption" color={palette.fg} style={{ flexShrink: 1 }}>
        {resolvedText}
      </Text>
    </View>
  );
}
