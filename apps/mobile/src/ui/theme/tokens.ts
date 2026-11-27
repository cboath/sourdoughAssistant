// Sourdough Assistant design tokens. Source of truth: docs/design/tokens.md (DS-01).
// PLACEHOLDER BRAND PALETTE ("Crust"): pending Chris's brand assets (plan Q5).
// Change `palette` only; semantic names are stable.
import { Platform } from 'react-native';

const ios = Platform.OS === 'ios';

export const palette = {
  white: '#FFFFFF',
  flour50: '#FBF8F3',
  flour100: '#F3EDE4',
  flour200: '#E8E0D5',
  flour300: '#DDD3C6',
  stone400: '#A69B8E',
  stone450: '#9A8D7E',
  stone500: '#8C7F70',
  stone600: '#5C5248',
  char900: '#1F1A15',
  crust100: '#F6E3D3',
  crust200: '#F7BE93',
  crust300: '#F0A46A',
  crust700: '#9A4A12',
  crust800: '#7C3A0C',
  crust950: '#4A2206',
  night950: '#14110E',
  night900: '#1E1A16',
  night850: '#28231E',
  night800: '#2A241F',
  night700: '#3A332C',
  night600: '#6E645A',
  oat300: '#C2B6A8',
  oat100: '#F5EFE7',
} as const;

const light = {
  background: palette.flour50,
  surface: palette.white,
  surfaceRaised: palette.white,
  surfaceSunken: palette.flour100,
  textPrimary: palette.char900,
  textSecondary: palette.stone600,
  textDisabled: palette.stone400,
  accent: palette.crust700,
  accentPressed: palette.crust800,
  textOnAccent: palette.white,
  accentContainer: palette.crust100,
  textOnAccentContainer: palette.crust950,
  border: palette.flour200,
  borderStrong: palette.stone500,
  focusRing: '#2F4A8A',
  danger: '#B3261E',
  textOnDanger: palette.white,
  dangerContainer: '#F9DEDC',
  textOnDangerContainer: '#410E0B',
  warning: '#8A5A00',
  warningContainer: '#FDF0D5',
  textOnWarningContainer: '#4D3200',
  success: '#2E6B30',
  successContainer: '#DDF0DA',
  textOnSuccessContainer: '#0F2E11',
  info: '#2F4A8A',
  infoContainer: '#E3E9F8',
  textOnInfoContainer: '#13254F',
  scrim: 'rgba(31,26,21,0.40)',
  skeleton: palette.flour200,
  seriesA: palette.crust700,
  seriesB: '#2F4A8A',
  seriesC: '#2E6B30',
  seriesD: '#6B3A8A',
} as const;

export type ColorTokens = { [K in keyof typeof light]: string };

const dark: ColorTokens = {
  background: palette.night950,
  surface: palette.night900,
  surfaceRaised: palette.night850,
  surfaceSunken: palette.night800,
  textPrimary: palette.oat100,
  textSecondary: palette.oat300,
  textDisabled: palette.night600,
  accent: palette.crust300,
  accentPressed: palette.crust200,
  textOnAccent: '#2B1404',
  accentContainer: '#4A2A12',
  textOnAccentContainer: '#FBDCC4',
  border: palette.night700,
  borderStrong: palette.stone450,
  focusRing: '#AFC4FF',
  danger: '#FFB4AB',
  textOnDanger: '#690005',
  dangerContainer: '#5C1712',
  textOnDangerContainer: '#FFDAD6',
  warning: '#F2C36B',
  warningContainer: '#3D2C00',
  textOnWarningContainer: '#FFDF9E',
  success: '#8FD18F',
  successContainer: '#173A19',
  textOnSuccessContainer: '#C8EEC4',
  info: '#AFC4FF',
  infoContainer: '#1D2A4A',
  textOnInfoContainer: '#DCE4FF',
  scrim: 'rgba(0,0,0,0.60)',
  skeleton: palette.night800,
  seriesA: palette.crust300,
  seriesB: '#AFC4FF',
  seriesC: '#8FD18F',
  seriesD: '#D9B3F0',
};

export const color = { light: light as ColorTokens, dark } as const;
export type ColorScheme = keyof typeof color;

type TextStyleToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  maxFontSizeMultiplier?: number; // undefined = unlimited
  fontVariant?: ['tabular-nums'];
};

const semibold = ios ? '600' : '500';

const t = (
  iosSize: number,
  iosLine: number,
  androidSize: number,
  androidLine: number,
  iosWeight: TextStyleToken['fontWeight'],
  androidWeight: TextStyleToken['fontWeight'],
  maxFontSizeMultiplier?: number,
): TextStyleToken => ({
  fontSize: ios ? iosSize : androidSize,
  lineHeight: ios ? iosLine : androidLine,
  fontWeight: ios ? iosWeight : androidWeight,
  ...(maxFontSizeMultiplier ? { maxFontSizeMultiplier } : {}),
});

export const typography = {
  timerHero: { ...t(72, 80, 72, 80, '600', '500', 1.3), fontVariant: ['tabular-nums'] },
  timerLarge: { ...t(34, 41, 36, 44, '600', '500', 1.6), fontVariant: ['tabular-nums'] },
  display: t(34, 41, 36, 44, '700', '400', 1.6),
  title1: t(28, 34, 28, 36, '700', '400', 2.0),
  title2: t(22, 28, 22, 28, '700', '500', 2.0),
  title3: t(20, 25, 20, 26, '600', '500', 2.0),
  headline: t(17, 22, 16, 24, '600', '500'),
  body: t(17, 22, 16, 24, '400', '400'),
  callout: t(16, 21, 16, 22, '400', '400'),
  subhead: t(15, 20, 14, 20, '400', '400'),
  footnote: t(13, 18, 12, 16, '400', '400'),
  caption: t(12, 16, 12, 16, '500', '500'),
} satisfies Record<string, TextStyleToken>;

export const numeric = { fontVariant: ['tabular-nums'] as ['tabular-nums'] };
export const fontWeightSemibold = semibold;

export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export const layout = {
  screenMargin: 16,
  screenMarginWide: 24, // window width >= 600
  wideBreakpoint: 600,
  maxContentWidth: 640,
  listRowMinHeight: ios ? 44 : 56,
  listRowTwoLineMinHeight: ios ? 60 : 72,
  timelineTimeColumn: 88,
  timelineStackFontScale: 1.5, // stack time above step name at >= this font scale
  tableStackFontScale: 1.15, // stack a numeric table (recipe ingredients) from this font scale
  // Estimated height of the bottom tab bar (iOS adds the bottom inset), used to keep snackbars above it.
  tabBarHeightIos: 49,
  tabBarHeightAndroid: 80,
  textFieldMinHeightAndroid: 56,
  multilineMinHeight: 96,
} as const;

export const size = {
  touchMin: ios ? 44 : 48,
  touchKitchen: 56,
  touchHero: 72,
  targetGap: 8,
  iconSm: 20,
  iconMd: 24,
  iconLg: 28,
  iconHero: 48,
  badge: 24,
  progressStroke: 6,
  focusRingWidth: 2,
  borderWidth: 1,
} as const;

export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  full: 999,
  button: ios ? 12 : 999,
} as const;

export const elevation = {
  level0: { shadowOpacity: 0, elevation: 0 },
  level1: {
    shadowColor: palette.char900,
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  level2: {
    shadowColor: palette.char900,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  level3: {
    shadowColor: palette.char900,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
// Dark mode: do not apply shadows; use surfaceRaised + border instead (see tokens.md section 7).

export const motion = {
  duration: { instant: 0, fast: 150, standard: 250, emphasized: 400, skeletonPulse: 1200 },
  easing: {
    standard: [0.2, 0, 0, 1],
    decelerate: [0, 0, 0, 1],
    accelerate: [0.3, 0, 1, 1],
  } as const, // pass to Easing.bezier(...) / Reanimated
  snackbarDuration: 8000,
} as const;

export const opacity = {
  pressedOverlay: 0.12, // M3 state layer for pressed
  focusedOverlay: 0.12,
  hoverOverlay: 0.08,
  disabledContainer: 0.12, // M3 disabled container
} as const;

export const haptic = {
  selection: 'selection',
  success: 'success',
  warning: 'warning',
  impactLight: 'impactLight',
} as const;

export const tokens = {
  palette,
  color,
  typography,
  numeric,
  space,
  layout,
  size,
  radius,
  elevation,
  motion,
  opacity,
  haptic,
} as const;
export type Tokens = typeof tokens;
