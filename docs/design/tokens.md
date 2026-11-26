# Sourdough Assistant: design tokens

DS-01 · 2026-11-26 · ux-ui-designer
Consumers: RN-04 copies the TypeScript block in section 9 verbatim to `apps/mobile/src/ui/theme/tokens.ts` (the path the architect chooses wins). Screens and components reference **token names only**. No raw hex, px or ms values in feature code.

> **PLACEHOLDER BRAND.** The palette below is a working palette ("Crust"), not a decided brand. Brand assets are open question Q5 for Chris. Every color is chosen to pass WCAG 2.2 AA in the pairings listed in section 2.3. If Chris supplies brand colors, only `palette` changes. The semantic names in `color.light` and `color.dark` stay the same, and the contrast table must be re-checked.

---

## 1. Principles

- **Semantic over literal.** Components use `color.textPrimary` and never `palette.crust700`.
- **Light and dark are both first-class.** The app follows the system appearance and has no in-app override in v1. Dark mode is the expected 3 AM kitchen state.
- **System fonts** (SF Pro on iOS, Roboto on Android) are used so Dynamic Type and Android font scaling work natively. A brand display face can be added later for `display` only.
- **4 pt grid** for all spacing and sizing.
- **Kitchen sizes.** There are three touch-target tiers: the platform minimum, kitchen (56) and hero (72).

---

## 2. Color

### 2.1 Placeholder palette ("Crust", PLACEHOLDER)

| Name | Hex | Used for |
|---|---|---|
| `flour50` | #FBF8F3 | Light background |
| `flour100` | #F3EDE4 | Light sunken surface |
| `flour200` | #E8E0D5 | Light divider |
| `flour300` | #DDD3C6 | Light skeleton |
| `stone400` | #A69B8E | Light disabled text |
| `stone500` | #8C7F70 | Light strong border |
| `stone600` | #5C5248 | Light secondary text |
| `char900` | #1F1A15 | Light primary text |
| `crust700` | #9A4A12 | Light accent |
| `crust800` | #7C3A0C | Light accent pressed |
| `crust100` | #F6E3D3 | Light accent container |
| `crust950` | #4A2206 | Text on light accent container |
| `crust300` | #F0A46A | Dark accent |
| `crust200` | #F7BE93 | Dark accent pressed |
| `night950` | #14110E | Dark background |
| `night900` | #1E1A16 | Dark surface |
| `night850` | #28231E | Dark raised surface |
| `night800` | #2A241F | Dark sunken/input fill |
| `night700` | #3A332C | Dark divider |
| `night600` | #6E645A | Dark disabled text |
| `stone450` | #9A8D7E | Dark strong border |
| `oat300` | #C2B6A8 | Dark secondary text |
| `oat100` | #F5EFE7 | Dark primary text |

### 2.2 Semantic colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | #FBF8F3 | #14110E | Screen background |
| `surface` | #FFFFFF | #1E1A16 | Cards, list rows |
| `surfaceRaised` | #FFFFFF | #28231E | Sheets, menus, snackbar background in dark |
| `surfaceSunken` | #F3EDE4 | #2A241F | Grouped-list background (iOS style), input fills, timeline track |
| `textPrimary` | #1F1A15 | #F5EFE7 | Body, titles, the timer |
| `textSecondary` | #5C5248 | #C2B6A8 | Subtitles, helper text, timeline times |
| `textDisabled` | #A69B8E | #6E645A | Disabled labels only (exempt from contrast rules; disabled state is also conveyed by the role) |
| `accent` | #9A4A12 | #F0A46A | Primary buttons, links, selected tab, current step indicator |
| `accentPressed` | #7C3A0C | #F7BE93 | Pressed state of accent fills |
| `textOnAccent` | #FFFFFF | #2B1404 | Text and icons on `accent` |
| `accentContainer` | #F6E3D3 | #4A2A12 | Tonal buttons, selected chips, current-step card |
| `textOnAccentContainer` | #4A2206 | #FBDCC4 | Text on `accentContainer` |
| `border` | #E8E0D5 | #3A332C | Dividers, card outlines (decorative only) |
| `borderStrong` | #8C7F70 | #9A8D7E | Input outlines, checkbox and switch-off outlines (non-text 3:1) |
| `focusRing` | #2F4A8A | #AFC4FF | Keyboard/switch-access focus outline, 2 pt |
| `danger` | #B3261E | #FFB4AB | Destructive buttons and text, field errors |
| `textOnDanger` | #FFFFFF | #690005 | Text on `danger` fills |
| `dangerContainer` | #F9DEDC | #5C1712 | Error banners |
| `textOnDangerContainer` | #410E0B | #FFDAD6 | |
| `warning` | #8A5A00 | #F2C36B | Overtime, quiet-hours-adjacent warnings, "reminders off" icon |
| `warningContainer` | #FDF0D5 | #3D2C00 | Warning banners |
| `textOnWarningContainer` | #4D3200 | #FFDF9E | |
| `success` | #2E6B30 | #8FD18F | Done checkmarks, "Ready to eat" |
| `successContainer` | #DDF0DA | #173A19 | Success banners |
| `textOnSuccessContainer` | #0F2E11 | #C8EEC4 | |
| `info` | #2F4A8A | #AFC4FF | Quiet-hours moon tag, DST tag, informational |
| `infoContainer` | #E3E9F8 | #1D2A4A | Info banners |
| `textOnInfoContainer` | #13254F | #DCE4FF | |
| `scrim` | rgba(31,26,21,0.40) | rgba(0,0,0,0.60) | Behind sheets and dialogs |
| `skeleton` | #E8E0D5 | #2A241F | Skeleton blocks |
| `seriesA` | #9A4A12 | #F0A46A | Multi-recipe recipe A (always with a letter badge) |
| `seriesB` | #2F4A8A | #AFC4FF | Recipe B |
| `seriesC` | #2E6B30 | #8FD18F | Recipe C |
| `seriesD` | #6B3A8A | #D9B3F0 | Recipe D (recipes beyond D cycle A to D; the letter badge disambiguates) |

### 2.3 Contrast verification (WCAG 2.2 AA)

I calculated these by hand with the WCAG relative-luminance formula. They are approximate and rounded conservatively, and the RN-04 unit test below is the authority. The thresholds are 4.5:1 for normal text, 3:1 for large text (24 px, or 18.66 px bold) and for UI components/graphics.

| Foreground on background | Light ratio | Dark ratio | Needs | Pass |
|---|---|---|---|---|
| `textPrimary` on `background` | about 16:1 | about 16:1 | 4.5 | yes |
| `textSecondary` on `background` | 7.2:1 | 8.9:1 | 4.5 | yes |
| `textSecondary` on `surfaceSunken` | 6.5:1 | 7.3:1 | 4.5 | yes |
| `accent` (as text) on `surface` | 6.2:1 | 8.4:1 | 4.5 | yes |
| `accent` (as text) on `background` | 5.9:1 | 9.4:1 | 4.5 | yes |
| `textOnAccent` on `accent` | 6.2:1 | 8.5:1 | 4.5 | yes |
| `danger` on `surface` | 6.6:1 | 10:1 | 4.5 | yes |
| `warning` on `surface` | 5.9:1 | 10:1 | 4.5 | yes |
| `warning` on `warningContainer` | 5.3:1 | 8.1:1 | 4.5 | yes |
| `success` on `surface` | 6.4:1 | 9.5:1 | 4.5 | yes |
| `info` on `surface` | 8.6:1 | 9.7:1 | 4.5 | yes |
| `borderStrong` on `surface` | 3.9:1 | 4.4:1 | 3.0 | yes |
| `focusRing` on `surface` | 8.6:1 | 9.7:1 | 3.0 | yes |

Rules
- `textDisabled` is used **only** on disabled controls. Never put information there.
- `border` (decorative) must never be the only boundary of an interactive control. Inputs use `borderStrong` or a `surfaceSunken` fill **plus** a label.
- No meaning is carried by color alone. Each status color always comes with an icon and a word (see `components.md` StatusTag).
- RN-04 adds a unit test that re-computes every row of this table from `tokens.ts`, so a palette swap can't silently break contrast.

---

## 3. Typography

System fonts. Every style scales with Dynamic Type and Android font scale (`allowFontScaling` stays true everywhere). The size and line height shown are at the default text size. iOS values match the HIG text styles, and Android values match the M3 type scale where the two differ.

| Token | iOS size/line | Android size/line | Weight (iOS / Android) | Max scale multiplier | Use |
|---|---|---|---|---|---|
| `timerHero` | 72/80 | 72/80 | 600 / 500 | 1.3 | Live-bake countdown (tabular figures) |
| `timerLarge` | 34/41 | 36/44 | 600 / 500 | 1.6 | Home card countdown, next-step time |
| `display` | 34/41 | 36/44 | 700 / 400 | 1.6 | Large titles (iOS large title is native) |
| `title1` | 28/34 | 28/36 | 700 / 400 | 2.0 | Live step name, empty-state titles |
| `title2` | 22/28 | 22/28 | 700 / 500 | 2.0 | Section titles, sheet titles |
| `title3` | 20/25 | 20/26 | 600 / 500 | 2.0 | Card titles |
| `headline` | 17/22 | 16/24 | 600 / 500 | none | Row titles, button labels |
| `body` | 17/22 | 16/24 | 400 / 400 | none | Default text |
| `callout` | 16/21 | 16/22 | 400 / 400 | none | Secondary body |
| `subhead` | 15/20 | 14/20 | 400 / 400 | none | Row subtitles, timeline step meta |
| `footnote` | 13/18 | 12/16 | 400 / 400 | none | Helper text, captions under fields |
| `caption` | 12/16 | 12/16 | 500 / 500 | none | Tags, badges (never the only carrier of essential info) |
| `numeric` | (inherits) | (inherits) | n/a | n/a | Modifier: `fontVariant: ['tabular-nums']`, applied to all times, amounts, money, percentages |

Rules
- **Max scale multiplier** maps to RN `maxFontSizeMultiplier`. "none" means unlimited. Body text must stay usable up to 200% and must not crash or lose content above that. Only the huge timer and display styles are capped, because they're already larger than 200% body text. A capped style is still never smaller than `body` at the same setting. The hero timer at 1.3x is 94 pt, and that remains the largest text on screen.
- **Minimum size** is `caption` (12). Nothing smaller.
- **Weights.** Android Roboto supports 400, 500 and 700. Specs that say "semibold" map to 600 on iOS and 500 on Android (the table already does this).
- **Numbers** always use `numeric` (tabular), so countdowns and price columns don't jitter.
- **Letter case.** Sentence case everywhere: buttons, titles and tabs. No all-caps (M3 buttons are sentence case too).
- **Truncation.** See `flows.md` section 8. The live step name and any warning text never truncate.

---

## 4. Spacing (4 pt grid)

| Token | Value | Typical use |
|---|---|---|
| `space.none` | 0 | |
| `space.xxs` | 2 | Hairline offsets only (icon optical alignment). This is the one off-grid exception. |
| `space.xs` | 4 | Icon to text in tags |
| `space.sm` | 8 | Between related elements; minimum gap between adjacent touch targets |
| `space.md` | 12 | Inside list rows (vertical), chip gaps |
| `space.lg` | 16 | Screen horizontal margin (phone), card padding |
| `space.xl` | 24 | Between sections; screen margin on tablets |
| `space.xxl` | 32 | Above and below hero content |
| `space.xxxl` | 48 | Empty-state top padding |
| `space.huge` | 64 | Live-view landscape column gap |

Layout constants (`layout.*`)

| Token | Value | Use |
|---|---|---|
| `layout.screenMargin` | 16 (phone), 24 (600 dp/pt wide or more) | Horizontal page padding, plus the safe-area inset |
| `layout.maxContentWidth` | 640 | Tablets and foldables: center content |
| `layout.listRowMinHeight` | 44 (iOS) / 56 (Android) | Single-line list row (M3 one-line list item = 56) |
| `layout.listRowTwoLineMinHeight` | 60 (iOS) / 72 (Android) | Two-line row |
| `layout.bottomActionBarPadding` | `space.lg` plus the bottom safe-area inset | Pinned primary-action container |
| `layout.timelineTimeColumn` | 88 | Timeline time column at default text size; stacks above the step name when the font scale is 1.5 or more |

---

## 5. Sizes and touch targets

| Token | Value | Rule |
|---|---|---|
| `size.touchMin` | 44 (iOS) / 48 (Android) | Every interactive element's hit area, at minimum. If the visual is smaller, use `hitSlop`. |
| `size.touchKitchen` | 56 | Anything used during a bake (live view controls, schedule sliders' +/- buttons, steppers, the "Also now" done button, banner actions on the live view) |
| `size.touchHero` | 72 | The live-view primary "Done, start…" button height; full width minus margins |
| `size.targetGap` | 8 | Minimum space between adjacent targets |
| `size.iconSm` | 20 | Inline with `subhead`/`footnote` |
| `size.iconMd` | 24 | Default icon, tab icons |
| `size.iconLg` | 28 | Live-view header controls |
| `size.iconHero` | 48 | Empty states, complete state |
| `size.badge` | 24 | Recipe letter badge (A, B…) at default text size; scales with text |
| `size.progressStroke` | 6 | Bake progress bar height |
| `size.focusRingWidth` | 2 | Focus outline width |
| `size.borderWidth` | 1 | Input and card outline (hairline `StyleSheet.hairlineWidth` for dividers) |

---

## 6. Radii

| Token | Value | Use |
|---|---|---|
| `radius.none` | 0 | |
| `radius.xs` | 4 | Tags, badges in rectangular form |
| `radius.sm` | 8 | Inputs, chips (Android chip = 8 per M3) |
| `radius.md` | 12 | Cards, banners, buttons (iOS) |
| `radius.lg` | 16 | Live-view current-step card |
| `radius.xl` | 28 | Bottom sheet top corners (M3), dialogs |
| `radius.full` | 999 | Pills: buttons on Android (M3 full-round), FAB uses `radius.lg`, letter badges, switches |

Button corner per platform: iOS `radius.md` and Android `radius.full`. This follows the platform conventions for filled buttons, while the brand color stays the same.

---

## 7. Elevation and shadow

Light mode uses soft warm shadows. Dark mode uses **no shadows**: elevation is shown by a lighter surface (`surfaceRaised`) per M3 tonal elevation, plus a `border` outline on cards.

| Token | iOS shadow (light) | Android `elevation` (light) | Dark mode | Use |
|---|---|---|---|---|
| `elevation.level0` | none | 0 | `surface` | Flat rows, grouped lists |
| `elevation.level1` | color #1F1A15, opacity 0.06, radius 3, offset 0/1 | 1 | `surface` + `border` 1 | Cards (bake card, cost summary) |
| `elevation.level2` | opacity 0.10, radius 8, offset 0/3 | 3 | `surfaceRaised` | Pinned bottom action bar, snackbar, FAB |
| `elevation.level3` | opacity 0.14, radius 16, offset 0/6 | 6 | `surfaceRaised` | Menus, custom sheets (native sheets bring their own) |

---

## 8. Motion

| Token | Value | Use |
|---|---|---|
| `motion.duration.instant` | 0 | Reduce-motion replacement for movement |
| `motion.duration.fast` | 150 ms | Press feedback, toggles, chip select |
| `motion.duration.standard` | 250 ms | Expanding a slider row, banners appearing, timeline row shift |
| `motion.duration.emphasized` | 400 ms | Step-complete transition on the live view |
| `motion.duration.skeletonPulse` | 1200 ms | Skeleton shimmer loop (off with reduce motion) |
| `motion.easing.standard` | cubic-bezier(0.2, 0, 0, 1) | Most transitions (M3 emphasized-standard) |
| `motion.easing.decelerate` | cubic-bezier(0, 0, 0, 1) | Entering elements |
| `motion.easing.accelerate` | cubic-bezier(0.3, 0, 1, 1) | Exiting elements |
| `motion.snackbarDuration` | 8000 ms | Undo window (longer than the usual 4 s, for floury hands) |

Rules
- **Reduce motion** (iOS "Reduce Motion", Android "Remove animations"; read through `AccessibilityInfo.isReduceMotionEnabled`): movement becomes a crossfade of `fast` duration or `instant`, the skeleton shimmer becomes a static block, and the step-complete celebration becomes static.
- **The countdown never animates digits** (no rolling or flipping). Only the text changes, once per second or once per minute (see `flows.md` section 6.3).
- **Native transitions** (stack push, modal, sheet) are left to the platform. Don't override them.

Haptics (`haptic.*`, through `expo-haptics`, which respects system settings)

| Token | iOS | Android | When |
|---|---|---|---|
| `haptic.selection` | selection | `Haptics.selectionAsync` | Slider snap, stepper change, segmented change |
| `haptic.success` | notification success | `notificationAsync(Success)` | Bake scheduled, step marked done |
| `haptic.warning` | notification warning | `notificationAsync(Warning)` | Validation failure on save, overtime starting while in view |
| `haptic.impactLight` | impact light | `impactAsync(Light)` | Undo |

---

## 9. `tokens.ts` (copy to `apps/mobile/src/ui/theme/tokens.ts`)

```ts
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
  iosSize: number, iosLine: number, androidSize: number, androidLine: number,
  iosWeight: TextStyleToken['fontWeight'], androidWeight: TextStyleToken['fontWeight'],
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
  none: 0, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64,
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
  none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 999,
  button: ios ? 12 : 999,
} as const;

export const elevation = {
  level0: { shadowOpacity: 0, elevation: 0 },
  level1: { shadowColor: palette.char900, shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  level2: { shadowColor: palette.char900, shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  level3: { shadowColor: palette.char900, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
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

export const tokens = { palette, color, typography, numeric, space, layout, size, radius, elevation, motion, opacity, haptic } as const;
export type Tokens = typeof tokens;
```

Implementation notes for RN-04
- Theme access: `useTheme()` returns `color[useColorScheme() ?? 'light']` plus the static groups. Components never import `palette`.
- Apply `typography.*` together with `maxFontSizeMultiplier` on every `Text`. A `Text` wrapper (`components.md` Text) does this, so screens never set font sizes directly.
- Read the font scale with `useWindowDimensions().fontScale` to switch layouts at `layout.timelineStackFontScale` and for row stacking (`components.md` section 1.2).
