# Sourdough Assistant: accessibility rules and base components

DS-01 · 2026-11-26 · ux-ui-designer
Tokens: `docs/design/tokens.md`. Flows and screen IDs: `docs/design/flows.md`.
Built by RN-04 in `apps/mobile/src/ui/**`. Feature screens compose these; they don't restyle them.

---

## 1. Accessibility rules (requirements, checked in DR-01/02/03)

### 1.1 Touch targets
1. Every interactive element has a hit area of at least `size.touchMin` (44 pt iOS, 48 dp Android). If the visual is smaller (icon buttons, tags with actions), extend the hit area with `hitSlop` or padding. Don't shrink a target because of crowding. Wrap the layout instead.
2. **Kitchen tier.** Every control on `BAKE-LIVE`, the steppers and slider +/- buttons on `SCHED-PLAN`, and banner actions on the live view are at least `size.touchKitchen` (56). The live primary "Done, start…" button is `size.touchHero` (72) tall and full width.
3. Adjacent targets are at least `size.targetGap` (8) apart.
4. No gesture-only actions. Every swipe, drag or long-press has a visible button or menu equivalent **and** an accessibility action (`accessibilityActions`).
5. During a bake, no action is irreversible without undo (`motion.snackbarDuration` = 8 s), and no destructive action sits next to the primary action.

### 1.2 Text size (Dynamic Type / font scale)
1. All text goes through the `Text` component, with `allowFontScaling` on and `maxFontSizeMultiplier` taken from the typography token (only display and timer styles are capped).
2. Layouts must work at **200%** with no clipped or overlapping text. At `fontScale >= 1.5`:
   - List rows with a trailing value stack vertically: the value moves under the label, left-aligned.
   - Timeline rows put the time above the step name.
   - Button rows (two side-by-side buttons) stack vertically, with the primary on top.
   - Segmented controls with more than 2 segments fall back to a picker row.
3. No fixed heights on text containers. Use `minHeight`.
4. Screens scroll. Pinned bottom actions stay pinned, and the scroll content gets bottom padding equal to the bar height, so nothing is hidden behind them.
5. Icons that sit next to text scale with the text (size = font size x 1.2, clamped to between `size.iconSm` and `size.iconLg`).

### 1.3 Contrast and color
1. Use only token pairings from `tokens.md` section 2.3: text 4.5:1, large text and UI boundaries 3:1. This applies in light and dark.
2. **Never color alone.** Status = icon + word + color. Examples: overtime "+12:30 over" with a clock-alert icon; quiet hours with a moon icon and "Quiet hours"; unpriced with a tag icon and "Unpriced"; recipes in multi-bakes with a letter badge and name.
3. The current step in the timeline is marked by a filled marker **and** the word "Now" (and its accessibility state), not by color.
4. A focus ring (`color.focusRing`, `size.focusRingWidth`) is visible on keyboard, switch-access and hardware-keyboard focus. This matters on iPad/Chromebook with a keyboard.

### 1.4 Screen readers (VoiceOver / TalkBack)
1. Every interactive element has `accessibilityRole`, a concise `accessibilityLabel` (verb or noun, no "button" in the label) and an `accessibilityHint` only when the result isn't obvious.
2. State goes through `accessibilityState` (`selected`, `checked`, `disabled`, `expanded`, `busy`), not the label.
3. Rows are one focus stop: group the title, subtitle and value into one element with a combined label ("Bulk ferment, starts Friday 2:05 PM, 6 hours, quiet hours"). Trailing controls inside a row (switch, overflow) are separate stops.
4. Times are read as words. `accessibilityLabel` uses the full form ("Friday 3:05 AM", "5 hours 42 minutes"), never "5:42:10". Money is read by the locale formatter ("1 dollar 39 cents" is produced by the platform from "$1.39", so keep the currency symbol in the label).
5. Announcements (`AccessibilityInfo.announceForAccessibility`) happen only for: step changes on `BAKE-LIVE`, overtime start, save success/failure snackbars, and schedule recompute results ("Ready time now 10:40 AM"). Countdown ticks are **never** announced.
6. Heading role on screen titles and section headers (`accessibilityRole="header"`), so rotor/heading navigation works.
7. Focus order follows visual order. When a modal or sheet opens, focus moves to its title. When it closes, focus returns to the control that opened it.
8. Decorative images and illustrations are `accessible={false}` / `importantForAccessibility="no"`.
9. Adjustable controls (Stepper, DurationSlider) use `accessibilityRole="adjustable"` with `increment`/`decrement` actions, so VoiceOver swipe up/down and TalkBack volume keys work.

### 1.5 Motion and time
1. Respect reduce motion (`tokens.md` section 8).
2. Undo windows are 8 s and pause while a screen reader has focus on the snackbar.
3. No auto-dismissing content that the user must act on. Banners stay until they're resolved or dismissed.

### 1.6 Testing bar (QA and DR)
Each screen is checked at:
- Default text size, the largest non-accessibility size, and 200%, in light and dark.
- VoiceOver on and TalkBack on.
- Landscape.
- Reduce motion on.

The RNTL tests assert roles and labels for the recipe editor, schedule screen and live bake (BUILD_PLAN testing table).

---

## 2. Conventions used below

- **States** column vocabulary: default, pressed, focused, disabled, loading, error, selected. Pressed uses `accentPressed` for accent fills, and otherwise an M3 state layer (`opacity.pressedOverlay`) on Android or highlight dimming on iOS. Android also uses a ripple (`android_ripple`, bounded) for all pressables.
- **Platform** column notes only where iOS and Android deliberately differ.
- Copy strings are in `code` with a key. Final keys and strings for screens come in DS-02/03/04.

---

## 3. Components

### 3.1 Text
- **Purpose.** The only way to render text. It applies a typography token, color token, font scaling cap and tabular numerals.
- **Props.** `variant` (a typography token name), `color` (a semantic color token, default `textPrimary`), `numeric` (bool), `numberOfLines` (default unlimited; lists pass 2).
- **Accessibility.** Pass-through. `role="header"` when `variant` is `display`, `title1` or `title2` and `heading` is true.

### 3.2 Button
- **Purpose.** Triggers an action. There's one `primary` per screen.
- **Anatomy.** Container, optional leading icon (`size.iconMd`), label (`headline`, sentence case), optional trailing spinner.
- **Variants.**

| Variant | Container | Label | Use |
|---|---|---|---|
| `primary` | `accent` fill | `textOnAccent` | The main action ("Schedule bake", "Save") |
| `tonal` | `accentContainer` fill | `textOnAccentContainer` | Secondary actions ("Start now", "Use Sat 4:30 PM") |
| `outline` | `borderStrong` 1 pt outline, transparent | `accent` | Tertiary alongside a primary |
| `text` | none | `accent` | Low emphasis ("Not now", "Skip") |
| `destructive` | `danger` fill (in confirm contexts) or text-only `danger` (at the bottom of editors) | `textOnDanger` / `danger` | Delete, cancel bake |

- **Sizes.**

| Size | Height | Use |
|---|---|---|
| `md` | `size.touchMin` | Default |
| `lg` | `size.touchKitchen` | Pinned bottom actions, schedule flow, live secondary actions |
| `hero` | `size.touchHero` | Live "Done, start…" only |

  Width is intrinsic by default, or `fullWidth`. Horizontal padding is `space.xl`.
- **Corner.** `radius.button` (iOS 12, Android full pill).
- **States.**
  - **pressed:** `accentPressed` for fills; state layer for others.
  - **focused:** focus ring.
  - **disabled:** iOS uses container at 0.4 opacity for the whole button. Android uses the M3 container `textPrimary` at `opacity.disabledContainer` with label `textDisabled`. It is not pressable, and the role state is disabled.
  - **loading:** the label stays, a spinner replaces the leading icon, it isn't pressable, and the state is busy. Don't show a spinner for under 300 ms (delay its appearance).
  - **error:** n/a (errors live on fields and banners).
- **Hero variant extras.** The label can wrap to 2 lines ("Done, start Cold ferment for Country loaf"). Its height grows from a minimum of 72. It also triggers `haptic.success`.
- **Accessibility.** `role="button"`. The label is the visible text. A disabled button has a hint explaining why, when that isn't visible ("Pick a ready time that fits first").
- **Platform.** In nav bars, use native header buttons (`text` style), not this component: iOS "Save" is semibold in the nav bar, and Android "Save" is a text button in the top app bar.

### 3.3 IconButton
- **Purpose.** Icon-only actions (keep-awake toggle, overflow, banner dismiss).
- **Anatomy.** Icon (`size.iconMd`, or `iconLg` on the live view), centered in a hit area of at least `size.touchMin` (live: `touchKitchen`).
- **Variants.** `plain`, `toggle` (selected state: `accentContainer` circle behind the icon), `filled`.
- **States.** pressed, focused, disabled, selected (toggle).
- **Accessibility.** `role="button"`, or `"switch"` for toggles with `checked`. A label is **required** ("Keep screen on", "More options", "Dismiss").
- **Platform.** The overflow icon is horizontal ellipsis `ellipsis.circle` on iOS and vertical `more_vert` on Android. Share is `square.and.arrow.up` on iOS and `share` on Android. Back is native.

### 3.4 BottomActionBar
- **Purpose.** Pins the screen's one primary action above the home indicator or gesture bar (Schedule bake, Continue, Save on long forms).
- **Anatomy.** A `surface` container with `elevation.level2` (dark: `surfaceRaised` + top `border`), padding `space.lg`, bottom padding `space.lg` + the safe-area inset. Holds one `Button lg fullWidth`, optionally with a `footnote` line above it ("3 loaves, 2 recipes").
- **States.** It follows its button. It hides when the keyboard is up on iOS (the keyboard toolbar has "Done"), and stays above the keyboard on Android (`adjustResize`).
- **Platform.** On `BAKES-HOME` Android, it renders instead as an **M3 Extended FAB** ("Schedule a bake", `radius.lg`, bottom right, collapses to an icon-only FAB on scroll, with the label kept in its accessibility label). On iOS it stays a pinned full-width button. The rationale: an Extended FAB is the Material convention for a screen's main create action, and iOS has no FAB idiom.

### 3.5 ListRow
- **Purpose.** The standard row for lists and settings.
- **Anatomy.** Optional leading (icon `size.iconMd`, letter Badge, or 40 pt thumbnail), then a title (`headline` or `body`), optional subtitle (`subhead`, `textSecondary`), and an optional trailing element (value text `body textSecondary`, a StatusTag, chevron (iOS only), Switch, or IconButton overflow).
- **Variants.** `navigation` (chevron on iOS; no chevron on Android, per M3), `value`, `toggle`, `destructive` (title in `danger`, centered on iOS grouped lists), `selectable` (checkbox or radio leading, used in multi-select).
- **Sizes.** Min height `layout.listRowMinHeight` / `listRowTwoLineMinHeight`, padding `space.md` vertical and `layout.screenMargin` horizontal.
- **States.** pressed (iOS: `surfaceSunken` highlight; Android: ripple), focused, disabled (title `textDisabled`, not pressable), selected (checkbox checked).
- **Large text.** At `fontScale >= 1.5` the trailing value moves under the title. Titles wrap to 2 lines, then ellipsis (the full text is in the label).
- **Accessibility.** One focus stop with a combined label. `role="button"` for navigation, `"switch"` for toggle rows (the whole row toggles), `"checkbox"` for selectable. Overflow is a separate stop, and its actions are also exposed as `accessibilityActions` on the row.
- **Platform.** iOS grouped lists use inset grouped style (`surface` rows on `surfaceSunken` background, `radius.md` sections). Android lists are full-bleed with `border` dividers inset by the leading width.

### 3.6 SectionHeader
- **Purpose.** Labels a group of rows.
- **Anatomy.** A title (iOS: `footnote` `textSecondary`, sentence case; Android: `subhead` in the `accent` weight, M3 list subheader), and an optional trailing text action ("Edit", "See all").
- **Accessibility.** `role="header"`.

### 3.7 TextField
- **Purpose.** Text and number input.
- **Anatomy.** Label (always visible above the field; never a placeholder-only label), the input, an optional prefix/suffix (currency symbol, "g", "%"), helper text (`footnote` `textSecondary`), error text (`footnote` `danger` + error icon), and an optional character counter.
- **Variants.** `text`, `number` (numeric keyboard, locale decimal separator), `money` (locale currency; value held in cents), `multiline` (notes).
- **States.**
  - **default:** `surfaceSunken` fill + `borderStrong` 1 pt.
  - **focused:** `accent` 2 pt border.
  - **error:** `danger` 2 pt border + error text + icon.
  - **disabled:** `textDisabled`, no border.
  - **read-only:** no fill, value only.
- **Sizes.** Min height `size.touchMin` (iOS 44, Android 56 to match the M3 text field). Corner `radius.sm`.
- **Accessibility.** The label is bound to the input. The error text is appended to the label read-out ("Package size, error: Enter a size above 0"). On a failed save, focus moves to the first error field.
- **Platform.** The iOS number keyboard has no return key, so add an input accessory "Done" bar. Android uses `imeOptions` next/done.

### 3.8 AmountField (amount + unit)
- **Purpose.** Ingredient amounts and package sizes.
- **Anatomy.** A `number` TextField plus a unit button (shows "g", opens a UnitPicker sheet listing g, kg, oz, lb, ml, cup, tsp, tbsp, each). Below it, a secondary display in `footnote` ("about 4 cups · 17.6 oz").
- **States.** Same as TextField. For a volume unit when the item has no grams-per-cup value, it shows an inline info state (see `flows.md` section 4).
- **Accessibility.** The unit button is labelled "Unit, grams". The secondary display is part of the field's hint.

### 3.9 Stepper
- **Purpose.** Small integers: loaves, oven capacity, fold count, kitchen temperature (by 1°).
- **Anatomy.** A [−] button, the value (`title3 numeric`, with a unit label), and a [+] button. Buttons are at least `size.touchKitchen` and outlined with `radius.full`.
- **States.** At the min or max, that button is disabled. Pressing gives `haptic.selection`. Long-press auto-repeat is optional, and tapping must always work.
- **Accessibility.** One element, `role="adjustable"`, label "Loaves", value "2 loaves", with increment/decrement actions. The two buttons are hidden from the screen reader (avoid duplicate stops).
- **Platform.** A custom component on both platforms (iOS `UIStepper` is too small for the kitchen tier).

### 3.10 DurationSlider
- **Purpose.** Picks a step's duration within its min-max range when scheduling (S-2).
- **Anatomy.** A header row with the step name and chosen value ("Cold ferment · 14 h"). Below that: [−15 min] button, track (min to max) with a default tick labelled "Default", thumb at least 28 pt visual and `touchKitchen` hit, [+15 min] button. Under the track, labels for min and max ("12 h", "24 h"). If kitchen temperature adjustment moved it, a tag appears: "Adjusted for 27 °C".
- **Behavior.** Snaps to 5 min. The buttons step 15 min and clamp to the range. Each snap gives `haptic.selection`. The timeline recomputes live while dragging (throttled to one recompute per frame) and on release.
- **States.** default, dragging (thumb grows to 32), disabled (a step without a range shows only the value), focused.
- **Accessibility.** `role="adjustable"`, label "Cold ferment duration", value "14 hours, range 12 to 24 hours", increments of 15 min.
- **Platform.** Same custom component on both. Use `@react-native-community/slider` only if it can meet the hit and tick requirements.

### 3.11 DurationField and RangeField (recipe editing)
- **DurationField.** Hours and minutes in two `number` fields side by side ("6 h" "30 min"). This is used for a step's default duration. It stacks at large text.
- **RangeField.** Min, default and max as three DurationFields, with inline validation "Default must be between min and max." and a "No range" toggle that hides min and max.
- **Accessibility.** Each sub-field is labelled ("Minimum, hours").

### 3.12 SegmentedControl
- **Purpose.** 2 to 3 mutually exclusive options: "Ready at | Start now", "g | oz", "°C | °F".
- **Variants.** iOS uses the native-style segmented control with `surfaceSunken` track and `surface` selected pill (min height 44 for the kitchen; the native default of 32 is too small). Android uses M3 segmented buttons (outlined, with a check icon on the selected one, height 48).
- **States.** selected, pressed, disabled, focused.
- **Accessibility.** The group is `role="radiogroup"` and each segment is `role="radio"` with `checked`. At `fontScale >= 1.5` and more than 2 options, it switches to a ListRow with a picker.

### 3.13 Chip
- **Purpose.** Tag filters on `RECIPE-LIST`, tag entry in the recipe editor, and the role picker in `INGR-EDIT`.
- **Variants.** `filter` (selected: `accentContainer` + check icon), `input` (removable: a trailing x with a separate hit area of at least `touchMin`), `assist`.
- **Sizes.** Visual height 32 and hit height of at least `size.touchMin`. Corner `radius.sm` (Android) or `radius.full` (iOS). Text `subhead`.
- **Accessibility.** Filter chips are `role="checkbox"` with `checked`. The input chip's remove is its own button, labelled "Remove tag Rye".

### 3.14 Switch
- **Purpose.** Binary settings (quiet hours on, temperature-sensitive step, keep screen on).
- **Platform.** The native `Switch`. Track tint is `accent` when on. In the off state, Android shows the M3 outline with `borderStrong`.
- **Accessibility.** Always inside a toggle ListRow, so the whole row is the target.

### 3.15 DateTimeField
- **Purpose.** Ready date/time, quiet hours from/to, step actual time edits.
- **Anatomy.** A ListRow-like field: label ("Ready") and value (`title3 numeric`: "Sat, Nov 28 · 10:00 AM", with a relative hint "in 1 d 13 h"). Tapping it opens the platform picker.
- **Platform.**
  - iOS: a native sheet with `UIDatePicker`: inline calendar for the date, wheels for the time, a "Done" button, medium detent.
  - Android: an M3 `DatePickerDialog`, then a `TimePickerDialog` (clock or input mode per the user's choice), chained.
  - Both platforms: the locale's 12/24 h format, and the minute interval is 5.
- **States.** default, error (the "too soon" state: `danger` text + icon + message below), disabled.
- **Accessibility.** Label "Ready time, Saturday November 28, 10:00 AM", hint "Opens date and time picker".

### 3.16 SearchField
- **Platform.** On iOS, use the native search bar in the nav bar (`headerSearchBarOptions`, hides on scroll), with a "Cancel" button. On Android, use the M3 Search bar at the top of the list (pill, `surfaceSunken`, leading search icon, trailing clear).
- **States.** empty, typing (results filter as you type, no submit), no results (EmptyState variant `search`).
- **Accessibility.** `role="search"`, label "Search recipes".

### 3.17 Card
- **Purpose.** A grouped summary that is tappable as a whole.
- **Anatomy.** A `surface` container with `radius.md`, `elevation.level1`, padding `space.lg`, and content slots.
- **States.** pressed (scale 0.98 with `motion.duration.fast`, or no scale with reduce motion), focused.
- **Accessibility.** One focus stop with a combined label, `role="button"` when tappable. Inner buttons are separate stops.

### 3.18 ActiveBakeCard (BAKES-HOME)
- **Anatomy.**
  1. Top row: recipe name(s) (`title3`, with letter badges for multi-recipe), and a StatusTag if needed ("Overtime", "Reminders off").
  2. The current step name (`headline`) and the countdown (`timerLarge numeric`), e.g. "Bulk ferment" over "2 h 14 min left".
  3. "Next: Shape at 8:05 PM" (`subhead textSecondary`).
  4. A progress bar for the whole bake (`size.progressStroke`, `accent` on `surfaceSunken`, with a text percentage in the accessibility label only).
  5. "Ready Sat 10:00 AM" (`subhead`).
- **Variants.**
  - `active`.
  - `upcoming`: no countdown hero, just "Starts Fri 3:05 AM", and the card is quieter (`surface`, no progress).
  - `overtime`: the countdown reads "+12 min over" in `warning` with an icon.
- **Accessibility.** The label is "Country loaf. Bulk ferment, 2 hours 14 minutes left. Next, shape at 8:05 PM. Ready Saturday 10 AM." `role="button"`, hint "Opens live bake".

### 3.19 CurrentStepPanel (BAKE-LIVE)
- **Purpose.** The glanceable core of the live view.
- **Anatomy.** An `accentContainer` card with `radius.lg` and padding `space.xl`. It contains:
  - A "Now" label (`caption`, with an icon).
  - The step name (`title1`, wraps fully).
  - The countdown (`timerHero numeric`).
  - "until {next step} · {clock time}" (`body textSecondary`).
  - For folds: "Fold 2 of 4 · next at 12:30 PM".
  - For temperature-adjusted steps: a tag.

  The hero Button sits below the card, outside it.
- **States.** `waiting` (before the first step: "Starts in"), `running`, `overtime` (the countdown turns to "+12:30 over" in `warning` with a clock-alert icon, and the card border is 2 pt `warning`), `complete` (success icon, "Ready to eat", the button becomes "Back to bakes").
- **Landscape.** Two columns: the panel on the left, and the button + "Also now" + next step on the right, separated by a `space.huge` gap.
- **Accessibility.** The panel is one element. Its label updates every minute, not every second. A step change triggers an announcement: "Now: Shape. 10 minutes." When overtime starts: "Shape is over time."

### 3.20 TimelineRow and Timeline
- **Purpose.** The ordered list of steps with start times, used in `SCHED-PLAN`, `BAKE-LIVE` and recipe detail (relative times there).
- **Anatomy (row).**
  - Time column (`layout.timelineTimeColumn`): day + time (`subhead numeric`, "Fri" over "3:05 AM").
  - A rail marker: hollow for upcoming, filled `accent` + "Now" for current, a check in `success` for done.
  - Content: optional letter badge, step name (`headline`), meta line (`subhead textSecondary`: "6 h · range 5 to 8 h").
  - Tags row: StatusTags such as quiet hours, adjusted, "Same time as B: Shape", DST.
  - Trailing: in `SCHED-PLAN` for range steps, a "Change" disclosure that expands a DurationSlider in place.
- **Variants.**
  - `sequential`.
  - `alongside`: indented with a parallel-line icon and the meta "Alongside Cold ferment".
  - `sub` (fold reminders, compact, hidden behind "4 folds" expand).
  - `slotHeader`: "Oven slot 1 · A ×2".
  - `final`: "Ready to eat", bold, with a success marker.
- **States.** upcoming, current, done (time shows actual, "Done 3:12 AM"), overtime, skipped-in-past (only possible after "Start now" or recompute; shown in `textSecondary` with "Missed"), expanded (slider open).
- **Large text.** At `fontScale >= 1.5` the time moves above the name, and the rail stays.
- **Accessibility.** Each row is one stop: "Shape. Starts Friday 8:05 PM. 10 minutes. During quiet hours." Rows with "Change" expose an action, "Change duration", and `expanded` state. The timeline container is a list (`role="list"` on Android via `accessibilityRole="list"`).

### 3.21 StatusTag
- **Purpose.** Short status labels. They always have an icon and text.
- **Variants.**

| Variant | Icon (iOS / Android) | Colors | Text |
|---|---|---|---|
| `quietHours` | `moon` / `bedtime` | `infoContainer` / `textOnInfoContainer` | "Quiet hours" |
| `overtime` | `clock.badge.exclamationmark` / `alarm` | `warningContainer` / `textOnWarningContainer` | "Over time" |
| `unpriced` | `tag` / `sell` | `warningContainer` / `textOnWarningContainer` | "Unpriced" |
| `adjusted` | `thermometer` / `device_thermostat` | `surfaceSunken` / `textSecondary` | "Adjusted for 27 °C" |
| `dst` | `clock.arrow.circlepath` / `schedule` | `infoContainer` / `textOnInfoContainer` | "Clocks go back 1 h" |
| `overlap` | `person.2` / `group` | `surfaceSunken` / `textSecondary` | "Same time as B: Shape" |
| `remindersOff` | `bell.slash` / `notifications_off` | `warningContainer` / `textOnWarningContainer` | "Reminders off" |
| `done` | `checkmark` / `check` | `successContainer` / `textOnSuccessContainer` | "Done" |

- **Anatomy.** Icon (`size.iconSm`), text (`caption`), padding `space.xs` / `space.sm`, `radius.xs`.
- **Accessibility.** Not focusable on its own. Its text joins the parent row's label.

### 3.22 Badge (letter and count)
- **Letter badge.** A `size.badge` circle filled with `seriesA..D`, a letter in `caption` 700, text `textOnAccent` (light) or `background` (dark). It always appears next to the recipe name.
- **Count badge.** Tab-bar badge, using the native tab badge on both platforms.
- **Accessibility.** The letter badge is hidden. The recipe name carries the meaning.

### 3.23 Banner (inline)
- **Purpose.** Persistent, contextual messages at the top of a screen's content: reminders off, too soon, quiet-hours summary, cost incomplete.
- **Anatomy.** A container (`infoContainer` / `warningContainer` / `dangerContainer` / `successContainer`) with `radius.md` and padding `space.lg`. Inside: a leading icon (`iconMd`), a message (`callout`, up to 3 lines and then expands), up to two text-button actions, and an optional dismiss IconButton.
- **Variants.** `info`, `warning`, `danger`, `success`.
- **States.** It appears with a `standard` expand (reduce motion: instant), and it isn't auto-dismissed. On `BAKE-LIVE`, actions use `touchKitchen` height.
- **Accessibility.** The container is `role="alert"` only on first appearance for warning/danger. The message is read first, then the actions.

### 3.24 Snackbar (with Undo)
- **Purpose.** Brief confirmation plus undo after kitchen actions and saves.
- **Anatomy.** An inverse container (light: `textPrimary` background with `background` text; dark: `surfaceRaised` with `textPrimary`), `radius.sm` (Android M3) / `radius.md` (iOS), one line of message (two at large text), and one action ("Undo", in `accentContainer`-on-inverse color, at least `touchMin`). It sits above the BottomActionBar or hero button, never over it.
- **Timing.** `motion.snackbarDuration` (8 s). The timer pauses while focused by a screen reader or touched.
- **Accessibility.** Announced on appear (live region polite). The action is focusable.
- **Platform.** The same component on both. iOS has no native snackbar, and a custom toast is the accepted pattern.

### 3.25 Dialog and confirm
- **Rule.** Use the **native** alert for confirmations (`Alert.alert`): iOS `UIAlertController` (`.alert`, or `.actionSheet` for discard-changes from a toolbar), Android M3 dialog. The destructive option has destructive style. The safe option is the default, on the right on iOS (cancel style) and as the dismiss button on Android.
- **Copy pattern.** The title is a question ("Delete Country loaf?"). The body gives the consequence. Buttons are verbs ("Delete", "Keep").

### 3.26 Sheet
- **Purpose.** Pickers and short tasks: INGR-PICK, PRICE-UPDATE, unit picker, kitchen temp, DateTime (iOS).
- **Platform.** On iOS, a native form/page sheet (`presentation: 'formSheet'` with `sheetAllowedDetents` medium/large, grabber visible). On Android, an M3 modal bottom sheet (drag handle, `radius.xl` top corners, `scrim`), full screen when content exceeds 90% of the height, and system back closes it.
- **States.** A dirty sheet (PRICE-UPDATE) asks before discarding, same as editors.
- **Accessibility.** Focus moves to the sheet title when it opens. The sheet uses the modal accessibility setting (`accessibilityViewIsModal`).

### 3.27 EmptyState
- **Anatomy.** An illustration or `size.iconHero` icon (decorative), a title (`title2`), a body (`body textSecondary`, max 2 sentences), and a primary Button, plus an optional secondary text button. It's centered, with top padding `space.xxxl`.
- **Variants.** `firstUse` (illustration), `search` (icon, "No recipes match 'rye'.", "Clear search"), `error` (danger icon, "Try again").

### 3.28 Skeleton
- **Purpose.** Cold-start placeholder (no more than about 300 ms of DB read).
- **Anatomy.** `skeleton` blocks that match the final layout (ListRow skeleton: a 60% title bar and a 40% subtitle bar). They shimmer at `skeletonPulse`, which is static with reduce motion.
- **Accessibility.** The container has `accessibilityState={{ busy: true }}` and the label "Loading". Individual blocks are hidden.

### 3.29 ProgressBar
- **Purpose.** Whole-bake progress on cards.
- **Anatomy.** A `surfaceSunken` track and `accent` fill, `size.progressStroke`, `radius.full`.
- **Accessibility.** `role="progressbar"` with `accessibilityValue` min/max/now. The text label is "45 percent through the bake".

### 3.30 PermissionPrimer
- **Purpose.** The pre-prompt screen before the notification and exact-alarm system prompts (`flows.md` section 5.4 has the copy).
- **Anatomy.** An illustration (decorative; a phone with a bell over a loaf), a title (`title1`), a body (`body`), a three-item benefit list with icons ("Feed, fold and shape reminders", "Works overnight and when the app is closed", "A heads-up before each step (optional)"), and a BottomActionBar with a primary button (allow) and a `text` button (not now).
- **Rule.** The system prompt is triggered only by the primary button. "Not now" never triggers it, and the app asks again only through the banner.

### 3.31 KeepAwakeToggle
- An IconButton `toggle` in the `BAKE-LIVE` header (sun icon `sun.max` / `light_mode`, at `touchKitchen`). The label is "Keep screen on", `role="switch"`, `checked`. The first time it is used, a snackbar explains: "Screen stays on while this bake is open." A full-width ListRow fallback in the overflow menu is for discoverability.

### 3.32 OtherBakeChip
- A tonal pill under the `BAKE-LIVE` header when another bake is active: "Other bake: Whole wheat · Shape in 0:42". At least `touchKitchen` high. Tapping it replaces the live view with that bake's. The label is "Switch to Whole wheat bake. Shape in 42 minutes."

### 3.33 MoneyText, QuantityText, TimeText (formatting components)
- **MoneyText.** Cents formatted with `Intl.NumberFormat(locale, { style: 'currency', currency })` (C-4), `numeric`. Optional `perUnit` ("$0.0024 per g": unit costs show up to 4 decimals, totals show 2).
- **QuantityText.** Grams first ("450 g"), with an optional secondary display ("about 3¾ cups").
- **TimeText.** A clock time in the locale's 12/24 h format. A relative day: "Today", "Tomorrow", otherwise the weekday ("Fri"), or "Fri, Dec 4" when it's more than 6 days away. Durations: "6 h", "6 h 30 min", "45 min", "1 d 4 h".
- **Accessibility.** Each sets `accessibilityLabel` to the spelled-out form (`flows.md` and section 1.4 rule 4).

---

## 4. Icons

- v1 uses one icon family for brand consistency: **Material Symbols Rounded** through `@expo/vector-icons`, on both platforms. The exceptions use platform-native glyphs because users recognize them: share, overflow and back (native header). Those are SF Symbols on iOS through `expo-symbols`, falling back to the Material glyph if the architect prefers a single dependency.
- Sizes come from `size.icon*`. Color comes from the parent text color token.
- Icons are decorative (`accessible={false}`) unless they're the only content of a control, in which case the control carries the label.

---

## 5. Component-to-milestone map (for RN-04 ordering)

| Needed first in | Components |
|---|---|
| M3 (RN-04/05) | Text, Button, IconButton, BottomActionBar, ListRow, SectionHeader, TextField, AmountField, Stepper, Chip, Switch, SearchField, Card, StatusTag, Banner, Snackbar, Sheet, EmptyState, Skeleton, MoneyText, QuantityText, DurationField, RangeField |
| M4 (RN-06/07) | SegmentedControl, DateTimeField, DurationSlider, TimelineRow/Timeline, Badge, PermissionPrimer, TimeText |
| M5 (RN-08) | ActiveBakeCard, CurrentStepPanel, ProgressBar, KeepAwakeToggle, OtherBakeChip, Button `hero` |
