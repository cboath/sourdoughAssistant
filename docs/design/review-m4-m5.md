# Design review: M4 and M5 screens (DR-02)

DR-02 · M5 · 2026-11-27 · ux-ui-designer
Specs: `screens-bake.md` (DS-03), `flows.md`, `components.md`, `tokens.md`, `open-questions.md` (D3 quiet hours 10 PM–6 AM, D4 default ready time, D5 keep-awake on, D6, B1–B9, E4 tone), `review-m3.md` (format, and the shared fixes already made)
Code: `apps/mobile/src/features/{schedule,live,notifications}/**`, `apps/mobile/app/bake/**`, `apps/mobile/app/(tabs)/bakes/**`, `apps/mobile/src/lib/i18n-{schedule,live,notifications}.ts`, `apps/mobile/src/ui/components/{ProgressBar,Card,Banner,Icon,Button,ActionSheet,BottomActionBar}.tsx`
Method: I reviewed the code against the spec and didn't run the app. Items marked **(verify)** depend on runtime behavior (font metrics, navigation, VoiceOver timing) that QA should confirm on the iPhone simulator before fixing. Android checks stay blocked (plan §9).

**Counts:** 0 blockers · 9 major · 19 minor (28 issues). Every issue is owned by `react-native-engineer`. The spec changes are already made by ux-ui-designer (listed at the end).

**What's already good:**
- **Kitchen tier.** The hero is 72 pt, full width and pinned at the bottom for a single item. "+15 min", "Ingredients", "Also now › Done", the header icons, the banner actions on the live view, "Change" and "Show folds" all meet 56 pt.
- **Panel.** It's one accessibility element whose label is rebuilt once a minute, and it's not a live region. Home cards aren't live regions either.
- **Overtime.** It's shown by an icon, words, a border and the container color, so never by color alone. It buzzes and announces once, only when it starts while the view is open.
- **Confirms.** Cancel and Finish both use native confirms with clear wording ("Cancel this bake?", [Keep baking] [Cancel bake], destructive). Cancel has no undo, and Finish does.
- **Lock screen.** No notes, quantities or costs reach a notification. Titles and bodies are cleaned and capped, Android channels are PRIVATE, and the copy matches §11 and E4.
- **Primers.** They're honest: the bake is saved first, "Not now" is a full-size button, it never triggers the system prompt, and the primary is busy-guarded against a double prompt. I found no dark patterns.
- **Series colors.** In light mode, white letters on A–D measure 6.2, 8.5, 6.4 and 8.1:1. In dark mode, `background` letters on A–D measure 9.2, 10.9, 10.5 and 10.4:1. The badge is always next to a name.
- **Dark mode at 3 AM.** The dark panel pairs (`textOnAccentContainer` on `accentContainer`, `textOnWarningContainer` on `warningContainer`) are well above 7:1.
- **Defaults.** Keep-awake defaults on (D5), is remembered, and is released on background and completion. The smart default ready time (D4) and the 12 h sweep (D6) are implemented.

---

## Issues (ranked by user impact)

### Major

**DR2-01 · major · BAKE-LIVE (Other-bake chip)**
- **File:** `src/features/live/components/LiveBakeScreen.tsx:731-745`
- **Spec:** §8.2 item 1: "Other bake: Whole wheat · Shape in 42 min", which names the **next** step and the time until it starts.
- **Built:**
  - For a running bake, the chip uses the current step and its end time, so "Bulk ferment in 3 h" reads as if Bulk starts in 3 hours.
  - For an overtime bake, `Math.max(1, ceil(at − now))` gives "Shape in 1 min" when Shape is actually 2 h overdue. That's the moment the chip matters most, and it says the opposite.
- **Fix:**
  - Use `live.next` (or the urgent item's `next`) and its `plannedStartAt` for "{step} in {duration}".
  - When the other bake is overtime, show `live.other.over` ("Other bake: Whole wheat · Shape is over time") with the `alarm` icon.
  - Sort overtime first.
  - The label follows the same rules.
- **Owner:** react-native-engineer

**DR2-02 · major · BAKE-LIVE (hero), all `size="hero"` buttons**
- **File:** `src/ui/components/Button.tsx:149`
- **Spec:** §0.6: "Hero button labels wrap to 2 lines (3 at 200%). The button grows from `size.touchHero`." `tokens.md` §3: action text never truncates.
- **Built:** `numberOfLines={2}` for every hero. At 200% (`headline` at about 34 pt), "Done, start Cold ferment (fridge)" needs 3 lines and ends in an ellipsis. "A · Done, start Preheat oven and Dutch oven" already truncates at about 1.3×. A low-vision baker can't see which step the tap starts, so the one action on the screen loses its meaning.
- **Fix:** Remove the line limit for `hero` (or use `fontScale >= 1.5 ? 3 : 2` and let it grow beyond that). The bar already grows with `onHeightChange`.
- **Owner:** react-native-engineer

**DR2-03 · major · BAKE-LIVE (countdown glanceability) (verify)**
- **File:** `src/features/live/components/CurrentStepPanel.tsx:83-96`; `src/features/live/format.ts:19-34`
- **Spec:** §0.2 and §8.2 item 5 (updated): the countdown never wraps mid-value. Units are `title2` on the same baseline.
- **Built:** The whole string is `timerHero` (72 pt, 94 pt at the cap), and it has `flexShrink: 1` beside a 28 pt icon. The panel's text width on a 393-wide phone is about 313 pt (screen margin plus `space.xl` padding). By SF metrics, "5 h 42 min" is about 360 pt and "+12:30 over" about 400 pt, so the commonest states (hours left, any overtime) likely break as "5 h 42" / "min" or "+12:30" / "over". Across the room, a broken "5 h 42" reads as a time of day.
- **Fix:**
  - Render numerals in `timerHero` and the "+", "d", "h", "min" and "over" runs in `title2`, baseline-aligned in one `Text`.
  - Allow a break only between unit groups (use a no-break space inside each group).
  - Fallback: `numberOfLines={1}` + `adjustsFontSizeToFit` + `minimumFontScale={0.7}`.
  - QA: check "1 d 4 h", "5 h 42 min", "42:10", "+12:30 over" and "+1 h 5 min over" at 100% and at 200% (capped), on a 375-wide and a 393-wide phone.
- **Owner:** react-native-engineer

**DR2-04 · major · BAKES-HOME (reminder state invisible after dismiss)**
- **File:** `src/features/live/components/ActiveBakeCard.tsx:70`; `src/features/live/card.ts` (no reminder field); `src/lib/i18n-live.ts` (`home.tag.remindersOff` / `home.tag.remindersLate` are missing)
- **Spec:** §0.4 rule 3 and §1.3: every affected `ActiveBakeCard` keeps a `remindersOff` tag that can't be dismissed ("Reminders off", or "Reminders may be late" for exact alarms), "so the state is never invisible". The card label ends with "Reminders off."
- **Built:** No card shows the tag. After the user taps X on "Reminders are off", nothing on home says the bakes won't alert them. This is the overnight failure the app exists to prevent.
- **Fix:**
  - Add `remindersOff: 'off' | 'late' | null` to `CardModel`, from `usePermissions` (notifications denied or undetermined → `off`; exact alarm denied on Android → `late`).
  - Render `StatusTag remindersOff` next to the overtime tag, add the words to the label, and add both i18n keys.
- **Owner:** react-native-engineer

**DR2-05 · major · BAKES-HOME, BAKE-LIVE, SCHED-PLAN (screen-reader spam)**
- **File:** `src/ui/components/Banner.tsx:51-57`; mounted from `LiveBakeScreen.tsx:508-532` and `BakesHomeScreen.tsx:155-159`
- **Spec:** `components.md` §3.23 and §8.11: `role="alert"` **only on the first appearance** of the condition. Announcements are limited to step changes, overtime start, shift results and snackbars.
- **Built:** Every warning or danger `Banner` calls `announceForAccessibility` on **mount**. So "Reminders are off…", the ≥ 60 min ready-time card and the oven conflict are re-announced on every visit:
  - Each time BAKE-LIVE opens (home → live, notification tap → live, Other-bake chip).
  - Each time the home list remounts.

  With 2 reminder banners plus a ready card, VoiceOver gets three back-to-back announcements that cut each other off and talk over the screen title. Users will learn to ignore them.
- **Fix:**
  - Give `Banner` an `announceKey` prop.
  - Keep a session set of announced keys (for example `useAnnounced` in `state/`): reminder banners use `kind`, ready cards use `dismissKey`, the conflict uses `slot`.
  - Announce only when the key is new. The banner stays readable in focus order.
- **Owner:** react-native-engineer

**DR2-06 · major · BAKE-LIVE (Done announcement) (verify)**
- **File:** `src/features/live/hooks/useLiveActions.ts:108-111, 144-157`; `src/ui/components/Snackbar.tsx:64-65`
- **Spec:** §8.7: after Done, announce `live.announce.step` ("Now: Cold ferment. 12 hours.") plus the shift sentence, and show the snackbar. §8.11: focus stays on the hero.
- **Built:**
  - `run()` announces "Now: Cold ferment. 12 h." synchronously. Then the snackbar's effect announces "Shape done." on iOS a moment later.
  - On iOS a new announcement interrupts the one in progress, so the user most likely hears only "Shape done." and never learns what's next. The hero's new label isn't re-read while focus sits on it.
  - The duration is the display form ("12 h"), not the spoken form.
- **Fix:**
  - Make one combined announcement per action: `"{snack}. Now: {next}, {spokenDuration}."`. Add an `announce: false` option to `showSnackbar` for these calls, or give the snackbar a `spokenMessage`.
  - Use `spokenDuration` in `live.announce.step`.
  - QA: with VoiceOver on, tap Done and check that the next step is heard.
- **Owner:** react-native-engineer

**DR2-07 · major · SCHED-PLAN (Schedule while blocked)**
- **File:** `src/features/schedule/components/SchedulePlanScreen.tsx:701-705` and `:289-293`
- **Spec:** §3.2 item 8 and §3.5 A1 (updated; the RN-06 deviation is accepted on these conditions): the button stays enabled, and a blocked tap gives `haptic.warning`, scrolls the banner into view, moves focus to it and announces the hint.
- **Built:** A blocked tap gives only a haptic. The too-soon, invalid and recipe-gone banners are in the list header, so a user scrolled down to the timeline taps "Schedule bake", feels a buzz, and sees nothing change. Without haptics (or with VoiceOver, which reads the hint only on focus), it looks broken. The recipe-gone state has no hint at all. The clock-passed re-check at `:289-293` has the same gap.
- **Fix:**
  - On a blocked tap: `listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })`.
  - Then `setAccessibilityFocus` on the first blocking banner (ref) and announce the hint.
  - Add the hint `plan.recipeGone` for the gone state.
- **Owner:** react-native-engineer

**DR2-08 · major · BAKE-LIVE (landscape and tablet)**
- **File:** `src/features/live/components/LiveBakeScreen.tsx:597-604`
- **Spec:** §8.9: right column = "hero button (inline at the **top** of the column), secondary actions, 'Also now', ready-time card and banners, 'Coming up'". §8.11: the hero is first in the landscape right column.
- **Built:** The right column renders the chip, then the reminder banners, the ready card and the conflict banner, and only then the hero. On a phone propped in landscape (about 390 pt tall), two banners push Done below the fold. That's the posture most bakers use on the counter.
- **Fix:** Order the right column as hero, secondary row, "Also now", chip, banners, "Coming up".
- **Owner:** react-native-engineer

**DR2-09 · major · BAKES-HOME (banners don't scroll)**
- **File:** `src/features/live/components/BakesHomeScreen.tsx:155-159`
- **Spec:** §1.2 item 2: the banners are part of the scrolling content, between the header and "Now".
- **Built:** `ReminderBanners` sits outside the `FlashList`, so it's pinned. At 200% text, "Reminders are off…" plus "Some reminders couldn't be set" (which can't be dismissed) take more than half of an iPhone screen permanently. The cards scroll in the remaining gap.
- **Fix:** Render the banners as the list's `ListHeaderComponent`, inside `ContentColumn`.
- **Owner:** react-native-engineer

### Minor

**DR2-10 · minor · BAKE-LIVE (hero flicker)**
- **File:** `LiveBakeScreen.tsx:371`; `useLiveActions.ts:28`; `Button.tsx:36, 56`
- **Spec:** §3.6.3 and §8.7: show the loading state only if the write takes 300 ms or more. The post-tap window is `busy`.
- **Built:** The 400 ms lock is passed as `loading`, and the spinner delay is 300 ms, so every Done flashes a spinner for about 100 ms and the label jumps.
- **Fix:** Add a `busy` prop (disabled plus `accessibilityState.busy`, no spinner). Use `loading` only around the actual `applyEvent` await.

**DR2-11 · minor · BAKE-LIVE and BAKES-HOME menus (destructive grouping)**
- **File:** `LiveBakeScreen.tsx:673-698`; `BakesHomeScreen.tsx:177-189`; `ui/components/ActionSheet.tsx:41-62`; `i18n-live.ts:149`
- **Spec:** §8.5: "Cancel bake (destructive, last, **separated**)". "Ingredients and cost" assumes the cost section.
- **Built:**
  - "Finish bake", "Cancel bake" and the iOS dismiss row "Cancel" are adjacent rows with no gap. With wet or floury fingers, "Cancel bake" and "Cancel" are one row apart and read alike. The confirm saves the data, but it's an avoidable scare.
  - The label "Ingredients and cost" opens a sheet with no cost (accepted deviation, so the label is wrong).
- **Fix:**
  - Add `group` / `separatorBefore` to `SheetAction`. Put a `space.md` gap and a `Divider` before destructive rows.
  - Render the iOS dismiss row in its own group below a `space.sm` gap, as `UIAlertController` does.
  - Rename `live.menu.ingredients` to "Ingredients".

**DR2-12 · minor · BAKE-LIVE, BAKES-HOME (banner dismiss)**
- **File:** `ui/components/Banner.tsx:107-109`; `LiveBakeScreen.tsx:516-527`
- **Spec:** §7: dismiss label "Dismiss reminders warning". On BAKE-LIVE, banner controls are `touchKitchen`. §4.5: multi-recipe labels name the recipe.
- **Built:**
  - Every X reads "Dismiss", and with three banners on the live view they're indistinguishable.
  - The X is 44 pt even with `tier="kitchen"`. It sits beside "Hold ready time" in the same card, and dismissal is session-long.
  - In multi-recipe bakes each card's action is just "Hold ready time".
- **Fix:**
  - Add a `dismissLabel` prop: `banner.dismiss.reminders` "Dismiss reminders warning", `live.readyMoved.dismiss` "Dismiss ready time change".
  - Pass `tier` to the `IconButton`.
  - In multi bakes, set the Hold action's label to "Hold ready time for {recipe}".

**DR2-13 · minor · BAKE-LIVE (multi-recipe spacing)**
- **File:** `LiveBakeScreen.tsx:449, 590-595`
- **Spec:** §8.3: `space.xxl` between one item's hero and the next panel, so a missed tap can't land on the next item's controls.
- **Built:** `space.lg` (the gap in both the panel block and the column).
- **Fix:** Use `space.xxl` between panel blocks (the column `gap`) when `panelsCompact`.

**DR2-14 · minor · BAKES-HOME, BAKE-LIVE (spoken times)**
- **File:** `live/format.ts:37-46`; `live/card.ts:139-141`; `live/panel.ts:171-175`
- **Spec:** §0.2 (updated): spoken countdowns use whole minutes, and the home card never uses seconds. §8.11 overtime: "Shape, 12 minutes over time."
- **Built:**
  - Under an hour, the home card label says "42 minutes 10 seconds left", and the panel label (rebuilt each minute) carries a seconds value that's up to 59 s stale.
  - The overtime panel label appends "until Cold ferment · 8:05 PM", a time already in the past, with a "·".
  - The unit words are hard-coded English.
- **Fix:**
  - In `spokenCountdown`, round to minutes ("Less than 1 minute" under 60 s).
  - Drop `sub` from the overtime label, or say "Planned to end at 8:05 PM".
  - Move "minute/second/hour" to plural keys with the DR1-32 work.

**DR2-15 · minor · all time displays (12/24 h)**
- **File:** `schedule/time.ts:33-39`; `notifications/content.ts:17-28`; `LiveBakeScreen.tsx:480-485`
- **Spec:** §0.2: clock time follows `uses24hourClock` (the device setting).
- **Built:** `Intl.DateTimeFormat(locale)` uses the locale default. A US-English phone set to 24-hour shows "3:05 AM" in the app and the lock screen, while the system time pickers (`ReadyField`, `FinishedAtSheet`) show "03:05". Two time formats appear on one screen. **Not accepted** as an RN-06 deviation, because the fix is one option.
- **Fix:** Read `getCalendars()[0]?.uses24hourClock` (expo-localization) once in `useLocale`, and pass `hourCycle: 'h23' | 'h12'` in every clock formatter, including the planner's `formatDayTime`.

**DR2-16 · minor · SCHED-PLAN (warnings card)**
- **File:** `SchedulePlanScreen.tsx:274-284`; `components/WarningsCard.tsx`
- **Spec:** §3.5 B: a summary line scrolls to the row, highlights it (instant with reduce motion) and **moves accessibility focus** to it. When the last warning resolves, announce `plan.warn.cleared`.
- **Built:**
  - It scrolls and highlights for a raw 1,500 ms, with no reduce-motion branch.
  - Focus stays on the summary line, so for VoiceOver the button does nothing perceivable. The RN-06 deviation is **not accepted**.
  - `plan.warn.cleared` is never announced.
- **Fix:**
  - Keep a ref per step row (as `useFocusRefs` does on the live view), and call `setAccessibilityFocus` after `scrollToIndex` settles (`onMomentumScrollEnd`, or a `motion.duration.standard` delay).
  - Use `motion.duration.emphasized` for the highlight. With reduce motion, hold the highlight until the next scroll.
  - Announce `plan.warn.cleared` when `warningLines` goes from non-empty to empty.

**DR2-17 · minor · SCHED-PLAN (duration slider)**
- **File:** `components/DurationSlider.tsx:50-58, 80-100`
- **Spec:** §3.3: 5-min snaps with [−15 min] / [+15 min]. `components.md` §1 rule 2: the slider's ± buttons are `touchKitchen`.
- **Built:**
  - `onStartShouldSetPanResponder: true` plus `onPanResponderTerminationRequest: false` means a vertical scroll that starts on the open slider changes the duration (and the whole plan) instead of scrolling.
  - The ± buttons are `size="md"` (44 pt).
- **Fix:**
  - Claim the gesture on move only when `|dx| > |dy|`, and allow termination.
  - Use `size="lg"` for ±.
  - The JS-thread point is accepted (see below).

**DR2-18 · minor · SCHED-PLAN, SCHED-PICK (iOS Cancel) (verify)**
- **File:** `SchedulePlanScreen.tsx:682`; `SchedulePickScreen.tsx:259, 264`
- **Spec:** §3.2: iOS "Cancel" closes the whole modal, with the discard confirm when `touched`.
- **Built:** Both use `router.dismissAll()`, which pops to the first screen of the closest stack. From the plan, that likely lands on the picker rather than closing, so the user has to tap "Cancel" twice. From the picker, check that it closes the modal and fires the `beforeRemove` guard.
- **Fix:** Close the schedule modal itself (`router.dismiss()` from the picker, or the parent navigator's `goBack()` from the plan) so `useScheduleCloseGuard` runs once. QA: touch a slider, tap Cancel on the plan, and check that you get one confirm and then land on the opener.

**DR2-19 · minor · PERM-NOTIF (iOS swipe-down) (verify)**
- **File:** `notifications/components/NotificationPrimerScreen.tsx:51`; `hooks/usePrimerFinish.ts`
- **Spec:** §5.1: on iOS "the sheet's swipe-down acts as 'Not now'" (dismiss, then open BAKE-LIVE).
- **Built:** `gestureEnabled: false` blocks the push-back swipe. The page sheet itself can still be swiped down, because the draft was marked saved, so the guard lets it through. The user lands back on the recipe or home with no live view and no "Bake scheduled" follow-through.
- **Fix:** Add a `beforeRemove` listener on the primer that calls `finish()` and `preventDefault()`, or set the parent's `gestureEnabled: false` while a primer is showing. Do the same for PERM-ALARM.

**DR2-20 · minor · SCHED-PLAN (quiet-hours hint copy)**
- **File:** `src/lib/i18n-schedule.ts:148`
- **Spec:** `plan.quiet.hint` (updated in DR-02): "To move these steps, change the ready time or how long a step takes."
- **Built:** "A longer cold ferment moves earlier steps earlier." With the default template that advice never clears the warning, because the feed-to-fridge chain is 17 h 10 min against a 16 h day (§3.3, corrected). The baker slides Cold ferment to 24 h, and the warning just moves to another step.
- **Fix:** Update the string. Note for QA-04: the "18 h clears it" expectation is wrong (see the §3.3 worked example).

**DR2-21 · minor · BAKES-HOME (card states)**
- **File:** `components/ActiveBakeCard.tsx:72-82`
- **Spec:** §1.2 item 3: overtime shows "+12 min over" in `warning` **with the icon**. Ready shows "Ready to eat" **with the `success` check icon**.
- **Built:** Neither has an icon. Overtime relies on the separate tag, and ready is plain `title3`.
- **Fix:** Lead the countdown with `Icon alarm` (warning) in overtime and `Icon checkCircle` (success) in ready, as on the live panel.

**DR2-22 · minor · BAKES-HOME (progress bar a11y)**
- **File:** `ui/components/ProgressBar.tsx:19`; `ActiveBakeCard.tsx:89`
- **Spec:** `components.md` §3.18: the percentage is in the card's label only. The card is one stop.
- **Built:** `ProgressBar` is always `accessible` with a `progressbar` role inside the pressable card. TalkBack can surface it as a second stop, which repeats the card's "45 percent through the bake".
- **Fix:** Add `decorative` (sets `accessible={false}`, `importantForAccessibility="no-hide-descendants"`) and use it from the card.

**DR2-23 · minor · all multi-recipe surfaces (letter badge)**
- **File:** `schedule/components/LetterBadge.tsx:15-17`
- **Spec:** `components.md` §1.2.3: no fixed heights on text containers.
- **Built:** A fixed 24 × 24 circle holds `caption` text with no scale cap. From about 1.5× the letter overflows the circle, and at 200% it's clipped. The badge is decorative (the name carries the meaning), so this is cosmetic, but it looks broken.
- **Fix:** Use `minWidth` / `minHeight = size.badge * min(fontScale, 2)` with `borderRadius: radius.full`, or cap the badge text at 1.3× (`maxFontSizeMultiplier`) and scale the circle to match.

**DR2-24 · minor · BAKE-INGREDIENTS**
- **File:** `live/components/IngredientsSheet.tsx:42-53, 71-74`
- **Spec:** §10: with 3 or 4 items, or at `fontScale >= 1.5`, use a picker row instead of the segmented control. The levain subtitle is "{hydration}% hydration · {flour} flour + {water} water".
- **Built:**
  - Always a `SegmentedControl` ("C Country loaf" in a quarter-width segment truncates).
  - The levain line has no flour/water split, which is exactly what you weigh during Feed.
- **Fix:** Switch to a picker row per `components.md` §3.12 above 2 items or at large text, and add the split from the snapshot.

**DR2-25 · minor · SCHED-PLAN (timeline labels)**
- **File:** `schedule/timeline.ts:351`
- **Spec:** §3.10: "Friday 3:05 AM. Final starter feeding. 8 hours, range 6 to 10 hours. During quiet hours."
- **Built:** The spoken meta is the display string with "·" swapped for ",": "8 h, range 6–10 h". VoiceOver reads "h" as a letter, and the dash inconsistently. The row label also says "Change duration." although that's an action, not content.
- **Fix:** Build a spoken meta from `spokenDuration` and "range {min} to {max}" (as `plan.slider.value` already does). Leave "Change duration" to `accessibilityActions`. This continues DR1-25.

**DR2-26 · minor · BAKES-HOME, BAKE-LIVE (skeletons)**
- **File:** `BakesHomeScreen.tsx:84`; `LiveBakeScreen.tsx:276`
- **Spec:** §1.3: 2 card skeletons (a title bar at 60%, a countdown bar at 40%, a thin progress bar). §8.8: a panel skeleton (name bar, large timer block), then 3 rows.
- **Built:** The generic `Skeleton variant="detail"`.
- **Fix:** Add `card` and `panel` variants. The first SQLite read is short, but on a cold start from a notification this is the first thing seen.

**DR2-27 · minor · BAKE-LIVE (per-second re-render)**
- **File:** `LiveBakeScreen.tsx:81, 438-440`
- **Spec:** §8.1 and architecture §12: `useNow(1 s)`, with only the countdown subtree re-rendering each second.
- **Built:** The whole screen re-renders every second: `deriveBakeLive`, two `panelFor` calls per item, the chip derivation over all other bakes, and all sections. With keep-awake on for a 30 h bake, that's avoidable battery and heat, and on older Android devices it can drop frames.
- **Fix:** Run the screen on `useNow(30 s)` (or minute boundaries). Give `CurrentStepPanel` a `CountdownText` child that owns `useNow(1 s)` only while the countdown is under 1 h.

**DR2-28 · minor · BAKE-LIVE (complete and finish copy)**
- **File:** `useLiveActions.ts:186-202`; `i18n-live.ts:97`
- **Spec:** §0.7 and §1.3: finishing shows `home.finished.snack` ("{recipe} is done. Enjoy!") [Undo]. §8.8 complete: `haptic.success`.
- **Built:** Finishing from the hero shows a new string, "Bake finished." (not in the spec, and flatter than E4). The overflow path uses the spec string. The two paths to the same outcome read differently.
- **Fix:** Use `home.finished.snack` for the hero finish too, and remove `live.finished.snack`.

---

## Accepted deviations

| # | Deviation (from RN-06 / RN-07 / RN-08) | Verdict |
|---|---|---|
| S1 | Slider uses PanResponder on the JS thread | **Accepted** until gesture-handler lands with DR1-29. The scroll capture and the ± size are filed separately as DR2-17. |
| S2 | Schedule stays enabled when blocked (haptic, no save) | **Accepted on condition of DR2-07** (scroll, focus and announce). It keeps the hint discoverable for VoiceOver. Spec §3.2 and §3.5 updated. |
| S3 | Summary card scrolls and highlights but doesn't move focus | **Not accepted.** Filed as DR2-16. |
| S4 | No budget summary line on the plan | **Accepted for v1.** `banner.budget` on home covers it after saving, and IO-01 hasn't yet measured the 64-cap on a device. Revisit when it has. |
| S5 | Clock follows the locale, not the device 12/24 h setting | **Not accepted.** Filed as DR2-15 (a one-option fix, and it already mismatches the system pickers). |
| S6 | Range format "12–24 h" | **Accepted.** It matches the spec's own examples (§3.3). The spoken form is handled by DR2-25. |
| L1 | No `/bake/[id]/timeline`; "Coming up" expands in place | **Accepted.** The expanded list shows done rows with actual times, "Marked done" and "Was {time}", and the ready-time card covers the summary line. Spec §13. |
| L2 | No full STEP-ACTIONS, so no out-of-order "Mark done now" | **Accepted for v1.** Done followed by Done (400 ms apart) and "Finished earlier? Set the time" cover the real cases. Revisit after the M5 real-bake test. |
| L3 | Single-column home cards at 600 dp and wider | **Accepted.** `supportsTablet` is false, as in DR-01 #4. |
| L4 | "Other bakes" chip goes to the list with 2 or more other bakes | **Accepted.** The label says "Opens your bakes." The chip's content is wrong (DR2-01), not its destination. |
| L5 | No cost section in the Ingredients sheet | **Accepted on condition of DR2-11** (rename the menu item to "Ingredients"). The cost shows in the complete state. |
| L6 | No Hold action on the oven-conflict banner | **Accepted.** The ready-time card for the shifted item carries Hold, and nothing moves automatically (ADR 0009 §10). |
| L7 | Ready-card dismissals last for the session only | **Accepted.** It fails safe: the card returns after a restart, and a new change shows it again anyway. |
| L8 | Steps are never auto-started by the clock | **Accepted.** This is spec §8.1 rule 2 (UI-derived, Q-A4). The sweep sets the bake to `active`. |
| L9 | 400 ms tap lock on every action | **Accepted.** It equals `motion.duration.emphasized`, and covering +15, Also now and Hold too is better for floury knuckles. The spinner flicker is filed as DR2-10. |
| L10 | Panel uses `warningContainer` in overtime and `successContainer` when ready (not listed) | **Accepted.** It's more glanceable than the border alone, and the contrast passes in both themes. Spec §8.2 updated. |
| L11 | No cross-fade on step change; no complete illustration (not listed) | **Accepted.** The instant swap is the reduce-motion behavior anyway, and E5 has no illustrations yet. |
| N1 | Quiet hours are warnings only: steps inside them still ring time-sensitive | **Accepted.** This is ADR 0010 §5 / 0011 §2 and D3 as decided, and missing a fold is worse than a 5 AM buzz. Spec §11 now states it, and the plan copy never claims silence. |
| N2 | New copy "Ready to eat" (ready kind) and "Test reminder / Your reminders are working." | **Accepted.** Plain and E4-compliant, with no private content. Added to spec §11. The ready kind stays behind `flags.readyNotification` (off, B8). |
| N3 | Generic banner dismiss label | **Not accepted.** Filed as DR2-12. |
| — | Hard-coded English unit words in spoken labels (`spokenSpan`, `spokenCountdown`, `spokenTemperature`) | **Accepted for v1** under the DR1-32 deferral (one locale). DR2-14 tracks the follow-up. |

## Spec changes made in this pass (ux-ui-designer, `screens-bake.md`)
1. **§3.3 worked example (the known spec bug).** An 18 h cold ferment moves the feeding to Thu 9:05 PM, but Mix and rest moves to Fri 5:05 AM, inside quiet hours. The summary stays "1 step…", and the tag moves to Mix and rest. Added why: the feed-to-fridge chain spans 17 h 10 min against a 16 h day. Also added a case that does clear it (feeding 6 h plus bulk 5 h) and two QA assertions.
2. **`plan.quiet.hint`** (§3.5 table and §3.8): "To move these steps, change the ready time or how long a step takes." (DR2-20).
3. **§3.2 item 8 and §3.5 A1:** the Schedule button stays enabled when blocked, with the scroll, focus and announce behavior (S2, DR2-07).
4. **§0.2:** spoken countdown and overtime labels use whole minutes (DR2-14).
5. **§8.2 item 5:** the countdown never wraps mid-value, units use `title2`, and the overtime/ready container colors are accepted (DR2-03, L10).
6. **§11:** added the `notif.ready.*` and `notif.test.*` keys, the quiet-hours rule ("never silences a step") and the "no notes, quantities or costs" rule (N1, N2).
7. **§13 (new):** the v1 amendments that record L1–L9 and S4–S6, so RN-10, QA-04 and QA-05 test against what's accepted.
