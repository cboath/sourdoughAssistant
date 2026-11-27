import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme/tokens';

/**
 * Icon seam over Material icons (@expo/vector-icons). Callers only use `name`, `size` and `color`.
 * Always decorative: the parent control carries the accessible label.
 */
type Glyph = ComponentProps<typeof MaterialIcons>['name'];

const GLYPHS = {
  check: 'check',
  close: 'close',
  search: 'search',
  moon: 'nights-stay',
  alarm: 'alarm',
  tag: 'local-offer',
  thermometer: 'thermostat',
  bellOff: 'notifications-off',
  clock: 'schedule',
  people: 'people',
  error: 'error-outline',
  info: 'info-outline',
  warning: 'warning-amber',
  chevronRight: 'chevron-right',
  chevronLeft: 'chevron-left',
  chevronDown: 'expand-more',
  chevronUp: 'expand-less',
  oven: 'microwave',
  more: Platform.OS === 'ios' ? 'more-horiz' : 'more-vert',
  minus: 'remove',
  plus: 'add',
  calendar: 'calendar-today',
  timer: 'timer',
  book: 'menu-book',
  pantry: 'kitchen',
  settings: 'settings',
  star: 'star',
  starOutline: 'star-border',
  arrowUp: 'arrow-upward',
  arrowDown: 'arrow-downward',
  parallel: 'call-split',
  levain: 'bubble-chart',
  edit: 'edit',
  delete: 'delete-outline',
  sun: 'wb-sunny',
  arrowBack: 'arrow-back',
  checkCircle: 'check-circle',
  play: 'play-arrow',
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: keyof ColorTokens;
}

export function Icon({ name, size, color = 'textPrimary' }: IconProps) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const base = size ?? theme.size.iconMd;
  // Icons beside text grow with it (up to 2x); large and hero icons keep their size.
  const px =
    base <= theme.size.iconLg ? Math.round(base * Math.min(Math.max(fontScale, 1), 2)) : base;
  return (
    <MaterialIcons
      name={GLYPHS[name]}
      size={px}
      color={theme.color[color]}
      accessible={false}
      importantForAccessibility="no"
      allowFontScaling={false}
    />
  );
}
