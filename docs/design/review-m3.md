# Design review: M3 screens (DR-01)

DR-01 · M3 · 2026-11-26 · ux-ui-designer
Specs: `flows.md`, `tokens.md`, `components.md`, `screens-recipes.md` (DS-02), `open-questions.md` (E2, E3, E4)
Code: `apps/mobile/app/**`, `apps/mobile/src/features/{recipes,pantry,cost}/**`, `apps/mobile/src/ui/**`, `apps/mobile/src/lib/i18n*.ts`
Method: I reviewed the code against the spec and didn't run the app. Items marked **(verify)** depend on runtime behavior that QA should confirm on the iPhone 18 Pro simulator before fixing.

**Counts:** 1 blocker · 17 major · 28 minor. Every issue is owned by `react-native-engineer` unless stated otherwise.

**What's already good:** No raw hex values in feature code. Every color goes through tokens and both schemes, and `Card`, `BottomActionBar` and `Snackbar` switch to tonal surfaces in dark mode. `Text` applies the typography caps everywhere. Money, percentages, grams and dates use `Intl` with the device locale. `IconButton`, `Stepper`, `Button` and `ListRow` meet `touchMin` and `touchKitchen`. Empty, error and skeleton states exist on every screen. E2 is applied on both platforms (`CFBundleDisplayName` and the Android label plugin), and E3 (system fonts) is respected.

---

## Issues (ranked by user impact)

### Blocker

**DR1-01 · blocker · INGR-EDIT, STEP-EDIT (iOS)**
- **File:** `apps/mobile/src/ui/editorHeader.tsx:24-28`, used by `IngredientEditorScreen.tsx:333-339` and `StepEditorScreen.tsx:173-179`
- **Spec:** §8 and §9 header: back chevron "Recipe" plus "Done". Back with changes asks "Discard changes to this…?" (`flows.md` §1.5: edge-swipe back on pushed screens).
- **Built:** For `pushed: true`, `headerBackVisible: false` hides the back button, `headerLeft` is `undefined`, and `gestureEnabled: !!saveDisabled` evaluates to `false`. On iOS there's no back button and no swipe-back. "Done" is the only way out, and it validates. A new step starts with an empty name (`stepForm.ts:53`) and a new ingredient with an empty amount, so a user who taps "Add step" or "Add ingredient" by mistake can't leave without inventing valid data or dismissing the whole recipe editor. Android is unaffected because system back works.
- **Fix:** For pushed editors, keep the native back button (`headerBackVisible: true`, `headerLeft` unset) and `gestureEnabled: true`. Let `useDiscardGuard` handle the dirty confirm. Apply `gestureEnabled: !dirty` only to modal roots.
- **Owner:** react-native-engineer

### Major

**DR1-02 · major · RECIPE-EDIT, PANTRY-EDIT (iOS) (verify)**
- **File:** `apps/mobile/app/_layout.tsx:30-31`; `src/ui/editorHeader.tsx:24`; `src/ui/useDiscardGuard.ts:25-36`
- **Spec:** `flows.md` §1.5 and `screens-recipes.md` §6.2: iOS blocks swipe-to-dismiss when the editor is dirty (`isModalInPresentation`).
- **Built:** `gestureEnabled` is set on the screen inside the nested editor stack. The modal that can be swiped away is the root-stack screen `recipe-editor` / `pantry-editor`, which keeps swipe-down enabled. A JS `beforeRemove` listener can't cancel a native sheet dismissal, so a dirty recipe is likely lost with no confirm.
- **Fix:** Drive `gestureEnabled` on the root `recipe-editor` and `pantry-editor` screens from the draft's dirty state, for example with `navigation.getParent()?.setOptions({ gestureEnabled: !dirty })` from the editor, or with `usePreventRemove` on the root screen. QA test: edit the name, swipe down, and check that the edit is kept.
- **Owner:** react-native-engineer

**DR1-03 · major · RECIPE-DETAIL, RECIPE-LIST, RECIPE-COST**
- **File:** `RecipeDetailScreen.tsx:232-233, 646-656`; `RecipeListScreen.tsx:325-328`; `CostScreen.tsx:282-286`
- **Spec:** "Schedule this recipe" is the screen's primary action. It opens SCHED-PLAN (RN-06). "Change markup" opens `settings/cost` (RN-10).
- **Built:** Both lead to `+not-found`: "Page not found. That page does not exist or has been removed." with [Go to Bakes], which replaces the user's place. The Schedule button is enabled and pinned on every recipe, so this is the most likely first tap on the screen. **This interim UX is bad.**
- **Fix:** Until the routes exist, put them behind a feature flag (`features.scheduling`, `features.costSettings`):
  - Hide the `BottomActionBar` on RECIPE-DETAIL.
  - Remove "Schedule" from the list row menu.
  - Hide "Change markup" and show the markup as plain text.

  Don't show a disabled button that has no reason.
- **Owner:** react-native-engineer

**DR1-04 · major · PANTRY-DETAIL**
- **File:** `src/features/pantry/components/PantryDetailScreen.tsx:343-349`
- **Spec:** §2.2 item 5: an overflow `IconButton` opens a menu with one item, "Delete this price". `components.md` §3.3 says overflow means "More options".
- **Built:** The overflow button, labelled "More options for price on {date}", deletes the price as soon as it's tapped. Both sighted and VoiceOver users expect a menu. There's an 8 s undo, but the action is destructive and mislabelled.
- **Fix:** Open the `ActionSheet` (or a native menu) with "Delete this price" (destructive) from this button. Keep the row's `accessibilityAction`.
- **Owner:** react-native-engineer

**DR1-05 · major · RECIPE-EDIT**
- **File:** `src/features/recipes/components/RecipeEditorScreen.tsx:513-518`
- **Spec:** §6.8: the live summary card is a polite live region labelled "Recipe summary". It announces hydration changes at most every 2 s.
- **Built:** The container is `accessible` with `accessibilityLabel="Recipe summary"`. That label replaces the children, so VoiceOver and TalkBack read only "Recipe summary" and never the hydration or totals. On Android the live region re-announces "Recipe summary" on every keystroke. This misses the M3 done-when ("usable with VoiceOver/TalkBack").
- **Fix:** Make the label "Recipe summary. {hydration line}. {totals line}. {per-loaf line}". Announce through a throttled `announceForAccessibility` (2 s, only when hydration changes) instead of `accessibilityLiveRegion`.
- **Owner:** react-native-engineer

**DR1-06 · major · STEP-EDIT**
- **File:** `src/ui/components/DurationField.tsx:40-64`; `src/ui/components/RangeField.tsx:51-72`
- **Spec:** §9.5: sub-fields are labelled "Default, hours", "Default, minutes", "Shortest, hours" and so on.
- **Built:** The group label is `accessible={false}`, and each input is labelled just "Hours" or "Minutes". With a range, a screen-reader user hears "Hours, Minutes" three times with no way to tell min, default and max apart.
- **Fix:** Pass the parent label into the sub-fields: `${label}, ${t('duration.hours')}`. Use the spec words "Default", "Shortest" and "Longest" (see DR1-36).
- **Owner:** react-native-engineer

**DR1-07 · major · RECIPE-EDIT (RN-05 deviation 7, filed)**
- **File:** `RecipeEditorScreen.tsx:169-177, 364-368, 390`
- **Spec:** §0.3.3: on a failed Save, focus and scroll move to the first error. §6.2.1: each summary line is a link that scrolls to and focuses the problem.
- **Built:** Only a Name error moves focus. A flour, steps or dough-weight error doesn't scroll. Save is in the header, so a user lower down the form who taps Save gets a haptic and an announcement, and the danger banner appears at the top, out of view. The summary lines are plain text.
- **Fix:**
  1. Keep a ref to the `ScrollView`, and record section offsets with `onLayout`.
  2. On a failed save, call `scrollTo(0)` so the banner shows, then focus the first error.
  3. Render each summary line as a `Pressable` (`role="link"`) that scrolls to its section and calls `setAccessibilityFocus` on it.
- **Owner:** react-native-engineer

**DR1-08 · major · RECIPE-EDIT (steps)**
- **File:** `RecipeEditorScreen.tsx:568-572`
- **Spec:** §6.2.4: an inline error line on the step row, in `footnote danger` with an error icon.
- **Built:** The `validateSteps` message is appended to the subtitle with `\n`, in `subhead textSecondary`. A row that blocks saving looks like any other row. Together with DR1-07, the user can't find which step is wrong.
- **Fix:** Render the error under the subtitle as `Icon error` plus `Text footnote danger`. Consider giving `ListRow` an `error` prop.
- **Owner:** react-native-engineer

**DR1-09 · major · RECIPE-DETAIL (scale), STEP-EDIT (timing, offset)**
- **File:** `src/ui/components/SegmentedControl.tsx:53-61`
- **Spec:** `components.md` §3.12: on iOS, a `surfaceSunken` track with a `surface` selected pill. On Android, M3 segmented buttons with a check icon on the selected segment. `tokens.md` §2.3: state isn't carried by color alone, and non-text contrast is 3:1.
- **Built:** The selected segment is marked only by an `accentContainer` fill on a transparent track. Against `background`, that's about 1.2:1 in light mode and about 1.5:1 in dark mode, with no icon and no weight change. Users can't tell "Loaves" from "Dough weight", which fails WCAG 1.4.11.
- **Fix:**
  - Android: a leading `check` icon on the selected segment.
  - iOS: the `surfaceSunken` track with a `surface` pill plus `elevation.level1` (in dark mode, `surfaceRaised` plus a `borderStrong` outline).
  - Both platforms: `headline` for the selected label and `body` for unselected labels.
- **Owner:** react-native-engineer

**DR1-10 · major · PRICE-UPDATE, PANTRY-EDIT, RECIPE-EDIT, INGR-EDIT, STEP-EDIT, RECIPE-DETAIL (iOS)**
- **File:** `src/ui/components/TextField.tsx:115-118` (there's no `InputAccessoryView` anywhere in `src/`)
- **Spec:** `components.md` §3.7 and `screens-recipes.md` §3.3 and §6.10: iOS number fields get a keyboard "Done" accessory bar.
- **Built:** The iOS `decimal-pad` has no return key, so `returnKeyType: 'done'` has no effect. In the price sheet the keyboard opens automatically (`autoFocus`) and covers "Save price". The only way out is tapping blank space.
- **Fix:** Add a shared `InputAccessoryView` with "Done" (and Previous/Next if it's cheap) for the `number` and `money` variants on iOS, and wire it through `inputAccessoryViewID`.
- **Owner:** react-native-engineer

**DR1-11 · major · all screens with Undo**
- **File:** `src/ui/components/Snackbar.tsx:35-49`
- **Spec:** `components.md` §1.5.2 and §3.24: the 8 s undo window pauses while a screen reader has focus on the snackbar.
- **Built:** The timer pauses only on touch. A VoiceOver user hears the announcement but often can't swipe to "Undo" within 8 s, so undo for deletes and archives is effectively unavailable. On Android the message is also announced twice (`announceForAccessibility` plus `accessibilityLiveRegion`).
- **Fix:**
  - When `AccessibilityInfo.isScreenReaderEnabled()` is true, don't auto-dismiss. Keep the snackbar until the user acts or navigates, or extend it to at least 20 s.
  - Pause on `onAccessibilityFocus` where it's available.
  - Remove one of the two Android announcements.
- **Owner:** react-native-engineer

**DR1-12 · major · tab roots, RECIPE-DETAIL**
- **File:** `src/ui/components/Snackbar.tsx:57-61`; `src/shell/AppProviders.tsx:17`
- **Spec:** §3.24: the snackbar sits above the BottomActionBar or hero button and never over it. It must also not cover navigation.
- **Built:** The host is mounted once at the root, at `insets.bottom + space.lg`, and `bottomOffset` is never passed. On tab screens it covers the tab bar, and on Android the FAB too. After "Recipe saved." on RECIPE-DETAIL it covers "Schedule this recipe" for 8 s.
- **Fix:** Measure the tab bar and the BottomActionBar (use `onHeightChange`, which already exists) and publish the offset to the snackbar store. Alternatively, render a `SnackbarHost` inside each screen container, above its pinned elements.
- **Owner:** react-native-engineer

**DR1-13 · major · RECIPE-LIST (filters), RECIPE-EDIT (tags), INGR-EDIT (role)**
- **File:** `src/ui/components/Chip.tsx:22, 54`
- **Spec:** `components.md` §1.2.3: no fixed heights on text containers (use `minHeight`). §3.13: visual height 32.
- **Built:** `height: 32` is fixed on a container with `subhead` text, which has no scale cap. From about 1.3x the label clips, and at 200% (line height 40) it overflows and is cut.
- **Fix:** Use `minHeight: 32` with `paddingVertical: space.xs`, and compute `hitSlop` from the measured height.
- **Owner:** react-native-engineer

**DR1-14 · major · PANTRY-LIST, RECIPE-LIST, RECIPE-EDIT, PANTRY-DETAIL, RECIPE-DETAIL (steps)**
- **File:** `src/ui/components/ListRow.tsx:135-162`. Callers: `RecipeEditorScreen.tsx:475-494`, `PantryListScreen.tsx:108-112`, `RecipeListScreen.tsx:158-162`, `PantryDetailScreen.tsx:322-340`, `RecipeDetailScreen.tsx:617-628`
- **Spec:** §0.6 and `components.md` §1.2.2: at `fontScale >= 1.5`, trailing values and tags move under the title. §6.2.3: ingredient tags sit on their own row under the subtitle.
- **Built:** Only `value` stacks. The `trailing` node (StatusTag, "Current", "Temperature-sensitive") always stays at the end of the row. In RECIPE-EDIT one ingredient row holds the title, the grams, a "Needs grams per cup" tag and a separate overflow button. At default size on a 393 pt phone that leaves the title about 100 pt, and at 200% the title collapses to a few characters per line.
- **Fix:** When `stacked`, render `trailing` under the subtitle, start-aligned. In RECIPE-EDIT, move the tag under the subtitle at every size, as the spec says.
- **Owner:** react-native-engineer

**DR1-15 · major · RECIPE-DETAIL (ingredients table)**
- **File:** `src/features/recipes/components/RecipeDetailScreen.tsx:446, 453, 525, 533`
- **Spec:** §10.2.5: the baker's % column has a fixed width that fits "100.0%". The table stacks at large text. `components.md` §1.2.2: no clipping.
- **Built:** The columns are a fixed 96 and 64 pt, and `body` scales without a cap. Between 1.15x and 1.49x (including the largest non-accessibility size, which is in the testing bar) "100.0%" and "1,036 g" don't fit, so they wrap mid-number ("100.0" / "%").
- **Fix:** Scale the widths with `fontScale` (`64 * fontScale`, clamped) or measure them once with `onTextLayout`. Alternatively, stack from `fontScale >= 1.15` for this table only.
- **Owner:** react-native-engineer

**DR1-16 · major · all M3 screens (landscape)**
- **File:** `src/ui/components/ContentColumn.tsx:23`; `ListRow.tsx:107`; `SectionHeader.tsx:20`; `EmptyState.tsx:43`
- **Spec:** `flows.md` §1.6: all screens support landscape on phones, with no content under the notch or camera cutout. `tokens.md` §4: `layout.screenMargin` plus the safe-area inset, and 24 when the window is 600 wide or more.
- **Built:** `orientation: 'default'` (`app.config.ts:13`), but no screen content applies left or right insets. Only the bars, snackbar and FAB do. On the iPhone 18 Pro in landscape, row titles and the start of section headers sit under the Dynamic Island. `layout.screenMarginWide` is never used.
- **Fix:** In `ContentColumn`, `ListRow` and `SectionHeader`, add `insets.left` and `insets.right` to the horizontal padding, and switch to `screenMarginWide` at `width >= layout.wideBreakpoint`. A small `useScreenMargin()` hook would cover all three.
- **Owner:** react-native-engineer

**DR1-17 · major · PRICE-UPDATE, INGR-PICK, all sheets**
- **File:** `src/ui/components/Sheet.tsx:39-47, 101-114`; `PriceUpdateSheet.tsx:58-64, 208`
- **Spec:** §3.6, §7.4 and `components.md` §1.4.7 / §3.26: focus moves to the sheet title on open and returns to the opener on close.
- **Built:**
  - `PriceUpdateSheet` passes `hideTitle`, so `titleRef` is never set and nothing gets focus. The `autoFocus` keyboard then grabs focus, and VoiceOver users aren't told what opened.
  - No sheet returns focus to its opener on close. Focus drops to the top of the screen, which breaks the M3 done-when for INGR-PICK.
- **Fix:**
  - Let `Sheet` accept a `titleRef` (or render the form title through `Sheet`) so focus always lands on a heading.
  - Take an `openerRef` prop (or capture the focused node on open) and `setAccessibilityFocus` on it after close.
- **Owner:** react-native-engineer

**DR1-18 · major · RECIPE-LIST, RECIPE-DETAIL, RECIPE-EDIT (row menus) (verify)**
- **File:** `src/ui/components/ActionSheet.tsx:33-36`
- **Spec:** §5.5 and §6.9: Delete asks for confirmation with a native alert.
- **Built:** `onClose()` hides the RN `Modal`, and `action.onPress()` calls `Alert.alert` in the same tick. On iOS an alert presented while a modal is being dismissed is commonly dropped. If that happens, "Delete" from the list menu or the detail overflow silently does nothing.
- **Fix:** Run the action after the modal has dismissed (`Modal onDismiss` on iOS, or `InteractionManager.runAfterInteractions`). QA test: list long-press > Delete, and detail overflow > Delete.
- **Owner:** react-native-engineer

### Minor

**DR1-19 · minor · RECIPE-DETAIL, PRICE-UPDATE, INGR-EDIT, STEP-EDIT (iOS)**
- **File:** `RecipeDetailScreen.tsx:415`; `PriceUpdateSheet.tsx:263`; `IngredientEditorScreen.tsx:454`; `StepEditorScreen.tsx:286`; `Banner.tsx:66`
- **Spec:** Polite live regions, throttled: scale result 1 s (§10.7), price preview 1 s (§3.6), levain split (§8.5). Banners use `role="alert"` on first appearance (§3.23).
- **Built:** `accessibilityLiveRegion` and `role="alert"` do nothing on iOS, so VoiceOver gets no announcements. On Android nothing is throttled.
- **Fix:** Add a `useAnnounce(text, { throttleMs })` hook that calls `announceForAccessibility` on both platforms. Use it in all four places and for a banner's first appearance.

**DR1-20 · minor · PANTRY-LIST, RECIPE-LIST (iOS)**
- **File:** `src/ui/useScreenSearch.tsx:23-31`; `PantryListScreen.tsx:173-179`; `RecipeListScreen.tsx:193-197`
- **Spec:** §1.3 and §5.4: [Clear search] clears the search. `components.md` §3.16: the search bar hides on scroll.
- **Built:**
  - `setQuery('')` resets JS state, but the native header search bar still shows the old text, so the bar and the list disagree.
  - `hideWhenScrolling: false`.
- **Fix:** Pass `headerSearchBarOptions.ref` and call `ref.current?.clearText()` (and `blur()`) from `setQuery('')`. Drop `hideWhenScrolling: false`.

**DR1-21 · minor · all write paths**
- **File:**
  - `RecipeListScreen.tsx:104-106, 109-112, 120-123`
  - `RecipeDetailScreen.tsx:197-200, 220-228`
  - `PantryDetailScreen.tsx:132-140`
  - `PantryEditorScreen.tsx:273-281`
  - `IngredientEditorScreen.tsx:295-298`
- **Spec:** §0.4: every failed write shows "Couldn't save. Try again." with [Retry].
- **Built:** Delete, favorite, archive, price-delete and inline-density failures show the message without [Retry]. A failed Undo (`restore`) is only logged, so the user believes the item came back.
- **Fix:** Add `actionLabel: t('common.retry')` with the same call. On a failed undo, show `common.saveFailed` with [Retry].

**DR1-22 · minor · PRICE-UPDATE, PANTRY-EDIT, INGR-EDIT (RN-05 deviation 1, filed)**
- **File:** `PriceUpdateSheet.tsx:97`; `PantryEditorScreen.tsx:138`; `IngredientEditorScreen.tsx:151`
- **Spec:** §0.3.2: errors appear on blur **after the user has edited that field**, plus all errors on Save.
- **Built:** `mode: 'onTouched'` flags a field the moment focus leaves it, even if the user never typed. Examples:
  - "Add price" auto-focuses the empty price field. Tapping "Store" or the unit button then shows "Enter a price, or 0 if it's free." before the user has done anything.
  - Tapping Name and then Category shows "Enter a name." immediately.
- **Fix:** In `FormTextField` and `FormAmountField`, show `fieldState.error` only when `(fieldState.isTouched && fieldState.isDirty) || formState.isSubmitted`. Keep `onTouched` for re-validation.

**DR1-23 · minor · modal editors (header Save)**
- **File:** `src/ui/components/HeaderTextButton.tsx:31, 42`
- **Spec:** §0.3.1: Save is disabled on a clean form. The iOS nav-bar "Save" is semibold (`components.md` §3.2).
- **Built:**
  - `disabled` only dims the button and sets the a11y state. `onPress` still fires, so the button says "dimmed" and still saves and closes.
  - `fontWeight: '700'` is used instead of `fontWeightSemibold`.
- **Fix:** Pass `disabled` to the `Pressable`, and use `fontWeightSemibold`.

**DR1-24 · minor · INGR-EDIT (role), PANTRY-EDIT (category), STEP-EDIT (type, anchor, timing), unit picker**
- **File:** `ListRow.tsx:64`; `Chip.tsx:45`; `IngredientEditorScreen.tsx:423-436`; `PantryEditorScreen.tsx:477-487`; `StepEditorScreen.tsx:342-352, 412-444`; `UnitPicker.tsx:37-47`
- **Spec:** §8.5: the role chips are a radiogroup and each chip is `role="radio"`. §4.7: the category sheet is a radiogroup. §9.5: the alignment group is a radio group.
- **Built:** The groups are `radiogroup`, but every child announces "checkbox".
- **Fix:** Add a `radio` mode: `ListRow variant="selectable" selectionMode="single"` and `Chip variant="filter" single`, with `accessibilityRole="radio"` and `checked`.

**DR1-25 · minor · PANTRY-LIST, RECIPE-LIST, RECIPE-EDIT, RECIPE-DETAIL, PANTRY-DETAIL**
- **File:** `PantryListScreen.tsx:113-122`; `RecipeListScreen.tsx:149`; `RecipeEditorScreen.tsx:480`; `RecipeDetailScreen.tsx:479-492`; `PantryDetailScreen.tsx:144-155`; `ui/components/formatting.tsx:43, 74`
- **Spec:** §0.2 accessibility column, §1.6, §6.8 and §10.7: labels use spoken units ("1,001 grams", "24 cents per 100 grams", "not available" for "–", "about 3 and three quarter cups").
- **Built:** Labels reuse the display strings: "450 g · about 3¾ cups", "$0.24 per 100 g", "77.3% hydration · 1 loaf", "–". VoiceOver reads "g" as a letter and reads the separators inconsistently. The pantry card label for a "needs grams per cup" item reads "…for 2 cup. , . Priced…".
- **Fix:** Add `spokenGrams`, `spokenUnit(unit, n)` and `spokenDash` helpers next to `spokenDuration`. Build labels from parts joined with ", ", and drop empty parts.

**DR1-26 · minor · forms everywhere**
- **File:** `TextField.tsx:85-87, 101, 135`; `CostScreen.tsx:149`; `RecipeEditorScreen.tsx:405`; `StepEditorScreen.tsx:214, 266`
- **Spec:** §3.6: prefix and suffix are part of the label, not separate stops. Money label: "Package price, in {currency name}". `components.md` §1.4.3: one stop per control.
- **Built:**
  - The visible label `Text`, the prefix "$" and the suffix "g" are each separate VoiceOver stops before the input, which repeats the label.
  - Visible labels above `Stepper` and `SegmentedControl` duplicate their group labels.
  - The money label has no currency name.
- **Fix:**
  - Mark the label, prefix and suffix `Text` as `accessible={false}` / `importantForAccessibility="no"`, and fold the suffix's spoken unit into the input label.
  - Hide the duplicate visible labels from accessibility.
  - Add the currency name with `Intl.DisplayNames(locale, { type: 'currency' })`.

**DR1-27 · minor · RECIPE-LIST**
- **File:** `RecipeListScreen.tsx:167-175, 285-302`; `Chip.tsx:46, 76`; `i18n.ts:81`
- **Spec:** §5.5: every long-press item is also an `accessibilityAction`. §5.7: tag chips are labelled "Tag {tag}" and the Favorites chip "Favorites only". `components.md` §3.13: the remove button reads "Remove tag Rye".
- **Built:**
  - The actions are only Duplicate and Delete. "Add to favorites" is missing (and Schedule, until DR1-03).
  - Chips use the bare text. The keys `recipes.filter.tag` and `recipes.filter.favoritesOnly` exist but aren't used.
  - `chip.remove` is "Remove {name}".
- **Fix:** Add an `accessibilityLabel` prop to `Chip` and pass the spec labels. Add the favorite action. Change `chip.remove` to "Remove tag {name}".

**DR1-28 · minor · PANTRY-DETAIL**
- **File:** `PantryDetailScreen.tsx:58-63, 285-287, 296, 356-364, 368-387`; `pantry/format.ts:219-231`
- **Spec:** §2.3 and §2.2.
- **Built:**
  - The skeleton is 4 generic rows instead of a heading bar, a card block and 3 rows.
  - The history count is in the header title, not as trailing text.
  - Unconvertible history rows show nothing instead of "–".
  - "Show all" has no `expanded` state.
  - "Used in" shows "Not used in any recipe yet." while it's loading or after an error.
- **Fix:** Match the spec items. Return "–" for `kind: 'unknown'`. Pass `accessibilityState={{ expanded }}`. Render "Used in" only when `usedIn.isSuccess`.

**DR1-29 · minor · all sheets (RN-05 deviation 5 follow-up)**
- **File:** `Sheet.tsx:50-56, 83, 89-100, 112`
- **Spec:** `components.md` §3.26. Sheet title `title2` (§3.2, §7.1). Dark sheets use `surfaceRaised` (`tokens.md` §2.2).
- **Built:**
  - There's a grabber, but drag-to-dismiss doesn't work.
  - The title is `title3`.
  - The sheet uses `surface` in dark mode, so it barely separates from the screen behind the scrim.
  - The grabber is a raw 32 x 4.
- **Fix:** Add a pan-to-dismiss on the grabber/header area (routed through `onClose` so the dirty check runs). Use `title2` and `surfaceRaised` when `isDark`. Use `space.xxl` x `space.xs` for the grabber.

**DR1-30 · minor · row and overflow menus (RN-05 deviation 10 follow-up)**
- **File:** `ActionSheet.tsx:30`; `ListRow.tsx:174`
- **Spec:** `components.md` §3.5: a chevron means navigation.
- **Built:**
  - Menu actions use `variant="navigation"`, so on iOS "Duplicate" and "Move up" show chevrons as if they open screens.
  - There's no Cancel row on iOS, so the scrim is the only way out (VoiceOver users hear "Close").
- **Fix:** Add a `variant="action"` with no chevron, centered on iOS. Add a trailing "Cancel" row on iOS.

**DR1-31 · minor · tokens**
- **File:**
  - `IngredientPickerSheet.tsx:135` (16, 8)
  - `RecipeListScreen.tsx:258, 389` (`FAB_CLEARANCE` on iOS, 8)
  - `PantryListScreen.tsx:189`
  - `RecipeDetailScreen.tsx:693` (4)
  - `SearchField.tsx:32, 51` (`+8`, `fontSize: 16`)
  - `TextField.tsx:92, 128, 131` (56, 96, 17/16)
  - `Skeleton.tsx:21` (14)
  - `Stepper.tsx:100` (56)
  - `AmountField.tsx:80` (22)
  - `Fab.tsx:54`
  - `ListRow.tsx:124, 131`
  - `app/(tabs)/_layout.tsx:31` (`iconSm - 6`)
- **Spec:** `tokens.md` §1 and §9: token names only. Text styles come from `typography`.
- **Built:** Raw numbers and arithmetic on tokens. The inputs hard-code `fontSize` instead of `typography.body`. Bottom padding reserves FAB space on iOS, where there's no FAB.
- **Fix:** Replace each value with `space.*`, `size.*` or `typography.*`. Add `layout.textFieldMinHeightAndroid = 56` and `layout.multilineMinHeight` to the tokens if needed (I'll add them to `tokens.md`). Apply `FAB_CLEARANCE` only on Android.

**DR1-32 · minor · copy (localization)**
- **File:**
  - `recipes/format.ts:37, 47-49, 66`
  - `ui/components/formatting.tsx:31, 71`
  - `recipes/stepText.ts:7, 56`
  - `cost/components/CostScreen.tsx:93, 197`
  - `IngredientEditorScreen.tsx:136, 198`
  - `pantry/format.ts:26-40`
  - `AmountField.tsx:85`
  - `lib/i18n.ts:95`
  - `lib/number.ts:23`
- **Spec:** §0.2 and the brief: final strings ready for localization. Money and numbers by locale.
- **Built:** User-visible English is built in code:
  - Fragments: "about", "per", "d/h/min", "hour(s)", "range … to", "it" in "ends when it starts", " and " in the banner list, the default name "Levain".
  - `UNIT_SHORT` has no plurals ("for 2 cup").
  - The unit button shows the raw code "floz", and the conversion banner reads "measured in cup".
  - `tp` uses `PluralRules('en')`.
  - `parseNumberInput` rejects grouped input, so "1,000" g per loaf reads as invalid.
- **Fix:**
  - Move the fragments into `i18n-recipes.ts` keys. Use `Intl.ListFormat` for name lists and plural unit keys (`unit.cup.one` / `.other`).
  - Select `PluralRules` from the active locale.
  - Strip the locale's group separator before parsing.

**DR1-33 · minor · copy (tone, E4)**
- **File:** `src/lib/i18n.ts:22-28, 47-49, 74, 80`
- **Spec:** E4: plain, friendly, imperative, with contractions as in DS-02 (for example `val.date.future` "The date can't be in the future."). §9.4 uses "Shortest" and "Longest".
- **Built:** "That page does not exist or has been removed.", "Could not load this", "The date cannot be in the future.", "Please update the app", "Your data has not been changed." The range labels are "Minimum" and "Maximum".
- **Fix:**
  - "That page isn't here anymore." · "Couldn't load this." · "The date can't be in the future." · "Update the app to keep going." · "Your data hasn't changed. Try again."
  - `range.min` → "Shortest", `range.max` → "Longest".
  - Remove the duplicate `date.future` in favor of `val.date.future`.

**DR1-34 · minor · forms with limits**
- **File:** `TextField.tsx:149-158`
- **Spec:** Counters appear from 50 of 60 (§4.1), 70 of 80 (§6.2) and 9,000 of 10,000 (§6.2.7).
- **Built:** The counter is always visible ("0/10000"), isn't locale-formatted, and uses `textAlign: 'right'`, which doesn't mirror for RTL.
- **Fix:** Add a `counterFrom` prop. Format the numbers with `Intl`. Use `textAlign: 'auto'` with `alignSelf: 'flex-end'`.

**DR1-35 · minor · STEP-EDIT**
- **File:** `DurationField.tsx:49-62`; `StepEditorScreen.tsx:157-161`
- **Spec:** §9.2: `DurationField` normalizes **on blur** (90 min becomes 1 h 30 min).
- **Built:** The value normalizes on every keystroke. Typing "90" in minutes jumps to "30" mid-entry. Clearing a field forces "0", so the user can't empty it and retype.
- **Fix:** Keep local text state per sub-field. Commit and normalize on blur or submit.

**DR1-36 · minor · STEP-EDIT**
- **File:** `RangeField.tsx:57-78`; `StepEditorScreen.tsx:254-258`
- **Spec:** §9.1.4a: the default comes first, then min and max side by side (stacked at large text).
- **Built:** The order is min, default, max, one per row. "Default must be between min and max." can appear twice: in `RangeField` and again as `errors.default`.
- **Fix:** Reorder the fields. Show the range error in one place only, from the screen.

**DR1-37 · minor · icons**
- **File:** `src/ui/components/Icon.tsx:29, 41, 65`
- **Spec:** `components.md` §3.3 and §4: the overflow icon is `ellipsis.circle` on iOS. Icons next to text scale with the text (§1.2.5).
- **Built:**
  - `more-vert` is used on iOS.
  - The alongside-step icon is Material `drag-handle`, which suggests rows can be dragged (they can't).
  - `allowFontScaling={false}` and fixed sizes mean inline icons stay small at 200%.
- **Fix:**
  - Use `more-horiz` (or an SF Symbol) for `more` on iOS.
  - Map `parallel` to a non-drag glyph such as `call-split` or `alt-route`.
  - Scale inline icons by `fontScale` within `iconSm` to `iconLg`.

**DR1-38 · minor · Android conventions**
- **File:** `app/(tabs)/_layout.tsx:28-31`; `RecipeDetailScreen.tsx:286`; `CostCard.tsx:71`
- **Spec:** §10.2 header: on Android, Edit is a pencil icon labelled "Edit recipe". The chevron is iOS only (`components.md` §3.5). M3 navigation bar.
- **Built:**
  - The tab bar marks the selected tab only by tint, with no M3 active indicator.
  - Android shows a text "Edit" in the top app bar.
  - The cost card shows a chevron on Android.
- **Fix:** Add an active-indicator pill behind the focused tab icon on Android. Use `IconButton icon="edit"` on Android. Show the chevron only on iOS.

**DR1-39 · minor · editors (dead ends)**
- **File:** `RecipeEditorScreen.tsx:95`; `PantryEditorScreen.tsx:104-106`; `IngredientEditorScreen.tsx:65-68`; `StepEditorScreen.tsx:44-46`
- **Spec:** §2.3 and §10.3: not-found states offer a way back.
- **Built:**
  - The editor "gone" states render `EmptyState` with no action and no header close button.
  - INGR-EDIT returns `null` (a blank screen) while the pantry loads.
  - The step and ingredient not-found states say "Page not found".
- **Fix:** Set header options (Cancel/X) before the early returns. Add [Back to recipes] / [Back to pantry]. Show a `Skeleton` while loading.

**DR1-40 · minor · PANTRY-EDIT**
- **File:** `PantryEditorScreen.tsx:186, 374-380`
- **Spec:** §4.1.4: the price is a `TextField money` with the locale's currency prefix, as in PRICE-UPDATE.
- **Built:** The new-item price field has no currency symbol. The Water prefill formats 0 with 2 decimals whatever the currency is (JPY should be "0").
- **Fix:** Reuse the PRICE-UPDATE `currencySymbol` prefix, and use `currencyMinorDigits(display.currency)`.

**DR1-41 · minor · RECIPE-EDIT**
- **File:** `RecipeEditorScreen.tsx:498-503, 615-620`
- **Spec:** §6.2.3: "Add ingredient" is a `ListRow` styled as a text button with a leading `add` icon (`accent`).
- **Built:** The add rows are navigation rows with a `textPrimary` title and an iOS chevron, so they look like an ingredient called "Add ingredient".
- **Fix:** Use an accent title and no chevron.

**DR1-42 · minor · RECIPE-DETAIL (iOS)**
- **File:** `BottomActionBar.tsx:42`
- **Spec:** `tokens.md` §4: `layout.bottomActionBarPadding` is `space.lg` plus the bottom inset.
- **Built:** Inside the tabs, the tab bar already consumes the home-indicator inset, so the bar adds about 34 pt of empty space under "Schedule this recipe".
- **Fix:** Use `useBottomTabBarHeight()` (or a `insideTabs` prop) and skip `insets.bottom` when a tab bar is present.

**DR1-43 · minor · RECIPE-EDIT (tags)**
- **File:** `RecipeEditorScreen.tsx:651-659`
- **Spec:** §6.2.5: the iOS return key reads "Add" (Android IME `done`), and each submit adds a chip.
- **Built:** `returnKeyType="done"` with the default `blurOnSubmit`, so the keyboard closes after every tag.
- **Fix:** Set `submitBehavior="submit"` (or `blurOnSubmit={false}`) and use the return key label `'default'`, or `returnKeyLabel` on Android.

**DR1-44 · minor · PRICE-UPDATE, PANTRY-EDIT (date)**
- **File:** `DateTimeField.tsx:92, 118-122`
- **Spec:** `components.md` §3.15: the error is `danger` text plus an icon. §3.7: the error is appended to the label.
- **Built:** The error text has no icon and isn't in the accessibility label.
- **Fix:** Match the `TextField` error row, and append `common.error` to the label.

**DR1-45 · minor · RECIPE-DETAIL (ingredients)**
- **File:** `RecipeDetailScreen.tsx:466, 479-487`
- **Spec:** §10.2.5 and §10.3: unpriced lines get a tag, and conversion errors show "Needs grams per cup" as in the editor. Archived lines read "(archived)".
- **Built:** Lines with `needsDensity` or `needsEach` show no tag. The levain label leaves out "(archived)".
- **Fix:** Reuse the editor's tag mapping, and add `archived` to `detail.levainRowLabel`.

**DR1-46 · minor · AmountField (PRICE-UPDATE, PANTRY-EDIT, INGR-EDIT)**
- **File:** `AmountField.tsx:47, 80, 85`
- **Spec:** §4.5: at large text the unit button moves under the number input. The unit is shown with its display name.
- **Built:** The layout stays side by side at every size. A fixed `marginBottom: 22` aligns the button with the helper text, and it misaligns once the helper wraps. The button shows the raw code ("floz").
- **Fix:** Stack when `stacked`. Align with `alignItems: 'flex-start'` and put the button beside the input row only (not the helper). Show the `UNIT_SHORT` label.

---

## Accepted deviations (RN-05 list)

| # | Deviation | Verdict |
|---|---|---|
| 1 | Errors show once a field is touched, not after it was edited | **Not accepted.** Filed as DR1-22 (minor). |
| 2 | Dough-weight mode shows "Total 1,036 g (target 1,035 g)" | **Accepted.** This is the specified behavior (§10.2.4, ADR 0010 §8). |
| 3 | No Android FAB collapse on scroll | **Accepted for M3.** The label stays and the list reserves clearance. Revisit in DR-03 with the BAKES-HOME FAB. |
| 4 | No side-by-side cost cards on wide screens | **Accepted.** The single column at `maxContentWidth` reads fine, `supportsTablet` is false, and the spec said "can". |
| 5 | Price sheet is a modal with Save and Cancel in the body | **Accepted as interim.** One primary action, and it works on both platforms. Conditions: DR1-17 (focus) and DR1-29 (drag-dismiss, title). Revisit the native iOS form sheet when the expo-router `formSheet` route is adopted. |
| 6 | "Cost incomplete" is a right-aligned tag, not a third line | **Accepted on condition of DR1-14.** The tag is fine at default size, but it must move under the title at `fontScale >= 1.5`. |
| 7 | Summary banner shows up to 3 plain lines, not links | **Not accepted.** Filed as DR1-07 (major), together with the missing scroll to the first error. |
| 8 | Pantry detail uses ScrollView, not FlashList | **Accepted.** History is short, and there's no nested-scroll problem. |
| 9 | Edit-mode pantry density is optional | **Accepted.** Clearing it is surfaced everywhere ("Needs grams per cup" tags and banners, "Can't convert" in cost), so nothing goes silently wrong. |
| 10 | Row menus use a sheet instead of Alert | **Accepted.** Android alerts cap at 3 buttons, and a bottom sheet of actions is valid M3. Follow-ups: DR1-18 (alert after the sheet closes) and DR1-30 (no chevrons, Cancel on iOS). |
| 11 | "Used in" shows the whole levain amount (100 g) | **Accepted.** It matches the spec example ("100 g · Levain, flour part priced here"). |
| 12 | "Unpriced" tag is shown for archived items with no price | **Accepted.** It's accurate: recipes still use the item, and the tag explains the incomplete cost. |

Known interim routes ("Schedule this recipe" before RN-06, "Change markup" before RN-10): the interim UX is not acceptable, so it's filed as DR1-03.

## Notes for the spec (ux-ui-designer follow-up, no code impact)
- I'll update `screens-recipes.md` to record deviations 5, 6, 9 and 10 as accepted, and add the `layout.textFieldMinHeightAndroid` and `layout.multilineMinHeight` tokens mentioned in DR1-31.
